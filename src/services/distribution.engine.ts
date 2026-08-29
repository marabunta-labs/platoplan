/**
 * Distribution Engine - Core algorithmic component for assigning recipes to meal slots.
 *
 * Pure function implementation (no database access). Takes selected recipes and config,
 * returns assignments. Handles:
 * 1. Slot separation (lunch and dinner independently)
 * 2. Elaborate recipe placement on designated days (default: Saturday/Sunday)
 * 3. Greedy interval-maximization for spacing repeated recipes
 * 4. Fill remaining slots with quick recipes
 */

import type { MealSlot } from '../models/enums';
import type { Recipe, MenuPlan, FreeDay } from '../models/types';
import type { SelectedRecipe } from '../models/inputs';

/** Configuration for the distribution algorithm */
export interface DistributionConfig {
  periodDays: number;
  freeDays: FreeDay[];
  elaborateDays: number[]; // Days available for elaborate recipes (0-indexed, 0=Monday)
  selectedLunchRecipes: SelectedRecipe[];
  selectedDinnerRecipes: SelectedRecipe[];
}

/** Result of a distribution run */
export interface DistributionResult {
  success: boolean;
  assignments: DayAssignment[];
  warnings: DistributionWarning[];
}

/** A single recipe-to-slot assignment */
export interface DayAssignment {
  dayIndex: number;
  slot: MealSlot;
  recipeId: string;
}

/** Warning about suboptimal distribution */
export interface DistributionWarning {
  type: 'insufficient_separation' | 'elaborate_overflow' | 'forced_consecutive';
  message: string;
  affectedDays: number[];
}

/** Validation result for a completed plan */
export interface ValidationResult {
  valid: boolean;
  violations: SeparationViolation[];
}

/** A separation constraint violation */
export interface SeparationViolation {
  recipeId: string;
  slot: MealSlot;
  dayIndices: number[];
  actualSeparation: number;
  minimumSeparation: number;
}

/** Minimum number of days between same recipe in the same slot */
const MIN_SEPARATION = 2;

/** Default elaborate days (Saturday=5, Sunday=6 assuming 0=Monday) */
const DEFAULT_ELABORATE_DAYS = [5, 6];

/**
 * Computes the available day indices for a given slot, excluding free days.
 */
function getAvailableDays(
  periodDays: number,
  slot: MealSlot,
  freeDays: FreeDay[]
): number[] {
  const allDays = Array.from({ length: periodDays }, (_, i) => i);
  return allDays.filter((dayIndex) => {
    const freeDay = freeDays.find((fd) => fd.dayIndex === dayIndex);
    if (!freeDay) return true;
    if (slot === 'comida') {
      return freeDay.type !== 'comida' && freeDay.type !== 'ambas';
    }
    // slot === 'cena'
    return freeDay.type !== 'cena' && freeDay.type !== 'ambas';
  });
}

/**
 * Distributes occurrences of a recipe across available slots using greedy
 * interval-maximization. If a recipe appears K times in N available slots,
 * spaces them approximately N/K apart.
 *
 * Returns the assigned day indices for this recipe.
 */
function distributeWithSpacing(
  count: number,
  availableSlots: number[]
): number[] {
  if (count <= 0 || availableSlots.length === 0) return [];
  if (count === 1) {
    // Place in the middle of available slots for best flexibility
    const mid = Math.floor(availableSlots.length / 2);
    return [availableSlots[mid]];
  }

  const n = availableSlots.length;
  const spacing = n / count;
  const result: number[] = [];

  for (let i = 0; i < count; i++) {
    const slotIndex = Math.min(
      Math.round(i * spacing),
      n - 1
    );
    result.push(availableSlots[slotIndex]);
  }

  return result;
}

/**
 * Places elaborate recipes on designated elaborate days first.
 * Returns placements and remaining available slots.
 */
function placeElaborateRecipes(
  elaborateRecipes: SelectedRecipe[],
  availableDays: number[],
  elaborateDays: number[]
): { placements: Map<string, number[]>; remainingDays: number[]; warnings: DistributionWarning[] } {
  const placements = new Map<string, number[]>();
  const warnings: DistributionWarning[] = [];
  const usedDays = new Set<number>();

  // Filter elaborate days to those available
  const eligibleElaborateDays = elaborateDays.filter((d) => availableDays.includes(d));

  // Sort elaborate recipes by count descending (place most frequent first)
  const sortedElaborate = [...elaborateRecipes].sort((a, b) => b.count - a.count);

  for (const recipe of sortedElaborate) {
    const assignedDays: number[] = [];
    let remaining = recipe.count;

    // First, try to place on elaborate days that are not yet used
    const availableElaborateDays = eligibleElaborateDays.filter((d) => !usedDays.has(d));

    for (const day of availableElaborateDays) {
      if (remaining <= 0) break;
      assignedDays.push(day);
      usedDays.add(day);
      remaining--;
    }

    // If we still have remaining, place on other available days
    if (remaining > 0) {
      const otherDays = availableDays.filter(
        (d) => !usedDays.has(d) && !elaborateDays.includes(d)
      );

      if (remaining > otherDays.length) {
        // Not enough days - use what we have
        warnings.push({
          type: 'elaborate_overflow',
          message: `No hay suficientes días disponibles para la receta elaborada "${recipe.recipe.name}". Se asignaron ${assignedDays.length + otherDays.length} de ${recipe.count} ocurrencias.`,
          affectedDays: [...assignedDays, ...otherDays],
        });
        for (const day of otherDays) {
          assignedDays.push(day);
          usedDays.add(day);
        }
      } else {
        // Distribute remaining across other days with spacing
        const distributed = distributeWithSpacing(remaining, otherDays);
        for (const day of distributed) {
          assignedDays.push(day);
          usedDays.add(day);
        }
      }
    }

    placements.set(recipe.recipeId, assignedDays);
  }

  const remainingDays = availableDays.filter((d) => !usedDays.has(d));
  return { placements, remainingDays, warnings };
}

/**
 * Places quick recipes on remaining available days using interval-maximization.
 * Returns placements and any warnings.
 */
function placeQuickRecipes(
  quickRecipes: SelectedRecipe[],
  availableDays: number[]
): { placements: Map<string, number[]>; warnings: DistributionWarning[] } {
  const placements = new Map<string, number[]>();
  const warnings: DistributionWarning[] = [];
  const usedDays = new Set<number>();

  // Sort by count descending (place most repeated recipes first for best spacing)
  const sortedQuick = [...quickRecipes].sort((a, b) => b.count - a.count);

  for (const recipe of sortedQuick) {
    const remaining = availableDays.filter((d) => !usedDays.has(d));

    if (remaining.length < recipe.count) {
      // Not enough slots - this shouldn't happen if counts are validated
      const assigned = remaining.slice(0, remaining.length);
      assigned.forEach((d) => usedDays.add(d));
      placements.set(recipe.recipeId, assigned);
      continue;
    }

    const assigned = distributeWithSpacing(recipe.count, remaining);

    // Check for separation violations
    const sortedAssigned = [...assigned].sort((a, b) => a - b);
    for (let i = 1; i < sortedAssigned.length; i++) {
      const separation = sortedAssigned[i] - sortedAssigned[i - 1];
      if (separation < MIN_SEPARATION) {
        warnings.push({
          type: 'insufficient_separation',
          message: `La receta "${recipe.recipe.name}" tiene asignaciones con separación de ${separation} día(s) (mínimo recomendado: ${MIN_SEPARATION}).`,
          affectedDays: [sortedAssigned[i - 1], sortedAssigned[i]],
        });
        break; // Only report first violation per recipe
      }
    }

    assigned.forEach((d) => usedDays.add(d));
    placements.set(recipe.recipeId, assigned);
  }

  return { placements, warnings };
}

/**
 * Distributes recipes for a single slot (lunch or dinner).
 */
function distributeForSlot(
  selectedRecipes: SelectedRecipe[],
  availableDays: number[],
  elaborateDays: number[],
  slot: MealSlot
): { assignments: DayAssignment[]; warnings: DistributionWarning[] } {
  const assignments: DayAssignment[] = [];
  const warnings: DistributionWarning[] = [];

  // Separate elaborate and quick recipes
  const elaborateRecipes = selectedRecipes.filter(
    (r) => r.recipe.prepTime === 'elaborado'
  );
  const quickRecipes = selectedRecipes.filter(
    (r) => r.recipe.prepTime === 'rapido'
  );

  // Step 1: Place elaborate recipes on designated days
  const {
    placements: elaboratePlacements,
    remainingDays,
    warnings: elaborateWarnings,
  } = placeElaborateRecipes(elaborateRecipes, availableDays, elaborateDays);

  warnings.push(...elaborateWarnings);

  // Convert elaborate placements to assignments
  for (const [recipeId, days] of elaboratePlacements) {
    for (const dayIndex of days) {
      assignments.push({ dayIndex, slot, recipeId });
    }
  }

  // Step 2: Fill remaining slots with quick recipes
  const { placements: quickPlacements, warnings: quickWarnings } =
    placeQuickRecipes(quickRecipes, remainingDays);

  warnings.push(...quickWarnings);

  // Convert quick placements to assignments
  for (const [recipeId, days] of quickPlacements) {
    for (const dayIndex of days) {
      assignments.push({ dayIndex, slot, recipeId });
    }
  }

  return { assignments, warnings };
}

/**
 * Main distribution function. Implements the IDistributionEngine interface.
 * Pure function - no database access.
 */
export function distribute(
  _recipes: SelectedRecipe[],
  config: DistributionConfig
): DistributionResult {
  const allWarnings: DistributionWarning[] = [];

  // Determine elaborate days (default to Saturday/Sunday if not configured)
  const elaborateDays =
    config.elaborateDays.length > 0 ? config.elaborateDays : DEFAULT_ELABORATE_DAYS;

  // Get available days for each slot
  const availableLunchDays = getAvailableDays(
    config.periodDays,
    'comida',
    config.freeDays
  );
  const availableDinnerDays = getAvailableDays(
    config.periodDays,
    'cena',
    config.freeDays
  );

  // Distribute lunch recipes
  const lunchResult = distributeForSlot(
    config.selectedLunchRecipes,
    availableLunchDays,
    elaborateDays,
    'comida'
  );

  // Distribute dinner recipes
  const dinnerResult = distributeForSlot(
    config.selectedDinnerRecipes,
    availableDinnerDays,
    elaborateDays,
    'cena'
  );

  allWarnings.push(...lunchResult.warnings, ...dinnerResult.warnings);

  const allAssignments = [...lunchResult.assignments, ...dinnerResult.assignments];

  // Verify all slots are filled
  const totalLunchNeeded = availableLunchDays.length;
  const totalDinnerNeeded = availableDinnerDays.length;
  const totalLunchSelected = config.selectedLunchRecipes.reduce(
    (sum, r) => sum + r.count,
    0
  );
  const totalDinnerSelected = config.selectedDinnerRecipes.reduce(
    (sum, r) => sum + r.count,
    0
  );

  const success =
    totalLunchSelected === totalLunchNeeded &&
    totalDinnerSelected === totalDinnerNeeded &&
    allAssignments.length === totalLunchNeeded + totalDinnerNeeded;

  return {
    success,
    assignments: allAssignments,
    warnings: allWarnings,
  };
}

/**
 * Validates an existing plan for separation constraint violations.
 * Checks that the same recipe doesn't appear within MIN_SEPARATION days
 * in the same slot.
 */
export function validateDistribution(plan: MenuPlan): ValidationResult {
  const violations: SeparationViolation[] = [];

  // Group assignments by slot and recipeId
  const grouped = new Map<string, number[]>();

  for (const assignment of plan.assignments) {
    const key = `${assignment.slot}:${assignment.recipeId}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(assignment.dayIndex);
  }

  // Check separation for each group
  for (const [key, days] of grouped) {
    if (days.length < 2) continue;

    const [slot, recipeId] = key.split(':') as [MealSlot, string];
    const sorted = [...days].sort((a, b) => a - b);

    for (let i = 1; i < sorted.length; i++) {
      const separation = sorted[i] - sorted[i - 1];
      if (separation < MIN_SEPARATION) {
        violations.push({
          recipeId,
          slot,
          dayIndices: [sorted[i - 1], sorted[i]],
          actualSeparation: separation,
          minimumSeparation: MIN_SEPARATION,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/** Maximum iterations for backtracking to ensure termination */
const MAX_BACKTRACK_ITERATIONS = 1000;

/**
 * Checks if a given assignment set has separation violations for a specific slot.
 * Returns the violations found.
 */
function findSeparationViolations(
  assignments: DayAssignment[],
  slot: MealSlot
): SeparationViolation[] {
  const violations: SeparationViolation[] = [];
  const grouped = new Map<string, number[]>();

  for (const assignment of assignments) {
    if (assignment.slot !== slot) continue;
    if (!grouped.has(assignment.recipeId)) {
      grouped.set(assignment.recipeId, []);
    }
    grouped.get(assignment.recipeId)!.push(assignment.dayIndex);
  }

  for (const [recipeId, days] of grouped) {
    if (days.length < 2) continue;
    const sorted = [...days].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const separation = sorted[i] - sorted[i - 1];
      if (separation < MIN_SEPARATION) {
        violations.push({
          recipeId,
          slot,
          dayIndices: [sorted[i - 1], sorted[i]],
          actualSeparation: separation,
          minimumSeparation: MIN_SEPARATION,
        });
      }
    }
  }

  return violations;
}

/**
 * Counts the total number of separation violations in an assignment set.
 */
function countViolations(assignments: DayAssignment[]): number {
  const lunchViolations = findSeparationViolations(assignments, 'comida');
  const dinnerViolations = findSeparationViolations(assignments, 'cena');
  return lunchViolations.length + dinnerViolations.length;
}

/**
 * Checks if a swap is valid with respect to elaborate-day constraints.
 * An elaborate recipe can only be placed on elaborate days (or any day if
 * elaborate days are not relevant for a given recipe).
 *
 * @param assignmentA - first assignment being swapped
 * @param newDayForA - the day assignmentA would move to (assignmentB's current day)
 * @param assignmentB - second assignment being swapped
 * @param newDayForB - the day assignmentB would move to (assignmentA's current day)
 */
function isSwapValid(
  assignmentA: DayAssignment,
  newDayForA: number,
  assignmentB: DayAssignment,
  newDayForB: number,
  elaborateRecipeIds: Set<string>,
  elaborateDays: number[]
): boolean {
  // If recipe A is elaborate and would move to newDayForA, newDayForA must be an elaborate day
  if (elaborateRecipeIds.has(assignmentA.recipeId) && !elaborateDays.includes(newDayForA)) {
    return false;
  }
  // If recipe B is elaborate and would move to newDayForB, newDayForB must be an elaborate day
  if (elaborateRecipeIds.has(assignmentB.recipeId) && !elaborateDays.includes(newDayForB)) {
    return false;
  }
  return true;
}

/**
 * Attempts to resolve separation violations using backtracking.
 * Tries to swap assignments to reduce violations within the given slot.
 * Returns the improved assignments or the original if no improvement found.
 */
function backtrackResolve(
  assignments: DayAssignment[],
  slot: MealSlot,
  availableDays: number[],
  elaborateRecipeIds: Set<string> = new Set(),
  elaborateDays: number[] = []
): DayAssignment[] {
  let currentAssignments = [...assignments];
  let currentViolationCount = countViolations(currentAssignments);

  if (currentViolationCount === 0) return currentAssignments;

  let bestAssignments = [...currentAssignments];
  let bestViolationCount = currentViolationCount;
  let iterations = 0;

  // Get assignments for this slot only
  const slotAssignments = currentAssignments.filter((a) => a.slot === slot);
  const otherAssignments = currentAssignments.filter((a) => a.slot !== slot);

  if (slotAssignments.length < 2) return currentAssignments;

  // Try swapping pairs of assignments to resolve violations
  for (let i = 0; i < slotAssignments.length && iterations < MAX_BACKTRACK_ITERATIONS; i++) {
    for (let j = i + 1; j < slotAssignments.length && iterations < MAX_BACKTRACK_ITERATIONS; j++) {
      iterations++;

      // Check if this swap respects elaborate-day constraints
      if (!isSwapValid(
        slotAssignments[i],
        slotAssignments[j].dayIndex,  // A would move to j's day
        slotAssignments[j],
        slotAssignments[i].dayIndex,  // B would move to i's day
        elaborateRecipeIds,
        elaborateDays
      )) {
        continue;
      }

      // Try swapping dayIndex between assignment i and j
      const candidate = [...slotAssignments];
      const tempDay = candidate[i].dayIndex;
      candidate[i] = { ...candidate[i], dayIndex: candidate[j].dayIndex };
      candidate[j] = { ...candidate[j], dayIndex: tempDay };

      const candidateAll = [...otherAssignments, ...candidate];
      const candidateViolations = countViolations(candidateAll);

      if (candidateViolations < bestViolationCount) {
        bestAssignments = candidateAll;
        bestViolationCount = candidateViolations;

        if (bestViolationCount === 0) {
          return bestAssignments;
        }

        // Update current state and restart inner search
        currentAssignments = bestAssignments;
        // Reset to search from new best state
        const newSlotAssignments = currentAssignments.filter((a) => a.slot === slot);
        const newOtherAssignments = currentAssignments.filter((a) => a.slot !== slot);
        slotAssignments.length = 0;
        slotAssignments.push(...newSlotAssignments);
        otherAssignments.length = 0;
        otherAssignments.push(...newOtherAssignments);
        // Restart iteration from beginning with the improved state
        i = -1; // will become 0 after i++
        break;
      }
    }
  }

  return bestAssignments;
}

/**
 * Generates warnings based on remaining violations after best-effort distribution.
 */
function generateViolationWarnings(assignments: DayAssignment[]): DistributionWarning[] {
  const warnings: DistributionWarning[] = [];
  const allViolations = [
    ...findSeparationViolations(assignments, 'comida'),
    ...findSeparationViolations(assignments, 'cena'),
  ];

  for (const violation of allViolations) {
    if (violation.actualSeparation === 0) {
      // Same day - shouldn't happen with our algorithm but handle it
      warnings.push({
        type: 'forced_consecutive',
        message: `La receta "${violation.recipeId}" está asignada en el mismo día (día ${violation.dayIndices[0]}).`,
        affectedDays: violation.dayIndices,
      });
    } else if (violation.actualSeparation === 1) {
      // Consecutive days
      warnings.push({
        type: 'forced_consecutive',
        message: `La receta "${violation.recipeId}" está asignada en días consecutivos (días ${violation.dayIndices[0]} y ${violation.dayIndices[1]}).`,
        affectedDays: violation.dayIndices,
      });
    } else {
      // Insufficient separation (less than MIN_SEPARATION but > 1)
      warnings.push({
        type: 'insufficient_separation',
        message: `La receta "${violation.recipeId}" tiene separación insuficiente de ${violation.actualSeparation} día(s) entre días ${violation.dayIndices[0]} y ${violation.dayIndices[1]} (mínimo recomendado: ${MIN_SEPARATION}).`,
        affectedDays: violation.dayIndices,
      });
    }
  }

  return warnings;
}

/**
 * Distributes recipes with backtracking and conflict resolution.
 *
 * Strategy:
 * 1. Run the greedy distribution first
 * 2. Validate the result for separation violations
 * 3. If violations exist, attempt backtracking to resolve them
 * 4. If backtracking can't fully resolve, return best-effort with warnings
 *
 * This is the enhanced distribution function that provides better results
 * than the pure greedy approach.
 */
export function distributeWithBacktracking(
  _recipes: SelectedRecipe[],
  config: DistributionConfig
): DistributionResult {
  // Step 1: Run greedy distribution
  const greedyResult = distribute(_recipes, config);

  // If greedy failed (wrong counts), backtracking won't help
  if (!greedyResult.success) {
    return greedyResult;
  }

  // Step 2: Check for violations
  const initialViolationCount = countViolations(greedyResult.assignments);

  if (initialViolationCount === 0) {
    // Greedy solution is perfect, no backtracking needed
    return greedyResult;
  }

  // Step 3: Attempt backtracking for each slot
  const elaborateDays =
    config.elaborateDays.length > 0 ? config.elaborateDays : DEFAULT_ELABORATE_DAYS;

  const availableLunchDays = getAvailableDays(
    config.periodDays,
    'comida',
    config.freeDays
  );
  const availableDinnerDays = getAvailableDays(
    config.periodDays,
    'cena',
    config.freeDays
  );

  // Collect elaborate recipe IDs for constraint preservation during backtracking
  const elaborateRecipeIds = new Set<string>();
  for (const recipe of config.selectedLunchRecipes) {
    if (recipe.recipe.prepTime === 'elaborado') {
      elaborateRecipeIds.add(recipe.recipeId);
    }
  }
  for (const recipe of config.selectedDinnerRecipes) {
    if (recipe.recipe.prepTime === 'elaborado') {
      elaborateRecipeIds.add(recipe.recipeId);
    }
  }

  let improvedAssignments = backtrackResolve(
    greedyResult.assignments,
    'comida',
    availableLunchDays,
    elaborateRecipeIds,
    elaborateDays
  );
  improvedAssignments = backtrackResolve(
    improvedAssignments,
    'cena',
    availableDinnerDays,
    elaborateRecipeIds,
    elaborateDays
  );

  // Step 4: Check if backtracking resolved everything
  const finalViolationCount = countViolations(improvedAssignments);

  if (finalViolationCount === 0) {
    // Backtracking resolved all violations
    // Keep only the non-violation-related warnings from greedy (e.g., elaborate_overflow)
    const nonViolationWarnings = greedyResult.warnings.filter(
      (w) => w.type === 'elaborate_overflow'
    );
    return {
      success: true,
      assignments: improvedAssignments,
      warnings: nonViolationWarnings,
    };
  }

  // Step 5: Best-effort — return the best result found with appropriate warnings
  const bestEffortWarnings = [
    ...greedyResult.warnings.filter((w) => w.type === 'elaborate_overflow'),
    ...generateViolationWarnings(improvedAssignments),
  ];

  return {
    success: true,
    assignments: improvedAssignments,
    warnings: bestEffortWarnings,
  };
}

/** The distribution engine object implementing IDistributionEngine */
export const distributionEngine = {
  distribute,
  distributeWithBacktracking,
  validateDistribution,
};

export type IDistributionEngine = typeof distributionEngine;
