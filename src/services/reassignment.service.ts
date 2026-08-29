/**
 * Reassignment Service - Handles manual recipe reassignment and swap operations
 * with consecutive-day conflict detection.
 *
 * This service operates on in-memory plan data (pure functions, no database access).
 * It checks for conflicts before applying changes and returns proposed modifications
 * so the caller can decide whether to commit them.
 *
 * The separation rule: Same recipe should not appear within 2 days of each other
 * in the same slot (e.g., if recipe A is on day 3/comida, it shouldn't be on
 * day 2/comida or day 4/comida).
 */

import type { MealSlot } from '../models/enums';
import type { MenuPlan, PlanAssignment } from '../models/types';
import type { DistributionWarning, DayAssignment } from './distribution.engine';

/** Minimum number of days between same recipe in the same slot */
const MIN_SEPARATION = 2;

/** Reference to a specific assignment within the plan */
export interface AssignmentRef {
  dayIndex: number;
  slot: MealSlot;
}

/** Result of checking conflicts for a proposed assignment */
export interface ConflictCheckResult {
  hasConflicts: boolean;
  warnings: DistributionWarning[];
  proposedAssignment?: DayAssignment;
}

/** Result of checking conflicts for a proposed swap */
export interface SwapCheckResult {
  hasConflicts: boolean;
  warnings: DistributionWarning[];
  proposedSwap?: { from: DayAssignment; to: DayAssignment };
}

/**
 * Checks whether placing a recipe at a given day/slot in the plan would create
 * a consecutive-day conflict (same recipe within MIN_SEPARATION days in the same slot).
 *
 * @param plan - The current menu plan
 * @param dayIndex - The target day for the new assignment
 * @param slot - The target meal slot
 * @param recipeId - The recipe to assign
 * @returns List of conflicts/warnings detected
 */
export function checkConflicts(
  plan: MenuPlan,
  dayIndex: number,
  slot: MealSlot,
  recipeId: string
): ConflictCheckResult {
  const warnings: DistributionWarning[] = [];

  // Find all existing assignments of this recipe in the same slot,
  // excluding the target day itself (in case we're replacing an existing assignment there)
  const sameRecipeSameSlot = plan.assignments.filter(
    (a) => a.recipeId === recipeId && a.slot === slot && a.dayIndex !== dayIndex
  );

  // Check if any of those are within MIN_SEPARATION days
  for (const existing of sameRecipeSameSlot) {
    const separation = Math.abs(existing.dayIndex - dayIndex);
    if (separation < MIN_SEPARATION) {
      warnings.push({
        type: 'forced_consecutive',
        message: `La receta se repite con separación de ${separation} día(s) en ${slot} (días ${Math.min(existing.dayIndex, dayIndex)} y ${Math.max(existing.dayIndex, dayIndex)}). La separación mínima recomendada es de ${MIN_SEPARATION} días.`,
        affectedDays: [existing.dayIndex, dayIndex].sort((a, b) => a - b),
      });
    }
  }

  const proposedAssignment: DayAssignment = {
    dayIndex,
    slot,
    recipeId,
  };

  return {
    hasConflicts: warnings.length > 0,
    warnings,
    proposedAssignment,
  };
}

/**
 * Proposes a recipe reassignment with conflict checking.
 *
 * Checks whether the proposed assignment would create consecutive-day conflicts.
 * If conflicts exist, returns warnings but still provides the proposed assignment.
 * The caller decides whether to commit the change (preserving original until confirmed).
 *
 * @param plan - The current menu plan
 * @param dayIndex - The target day for the assignment
 * @param slot - The target meal slot
 * @param recipeId - The recipe to assign
 * @returns ConflictCheckResult with warnings if any conflicts detected
 */
export function reassignWithConflictCheck(
  plan: MenuPlan,
  dayIndex: number,
  slot: MealSlot,
  recipeId: string
): ConflictCheckResult {
  return checkConflicts(plan, dayIndex, slot, recipeId);
}

/**
 * Proposes a swap of two assignments with conflict checking.
 *
 * Checks whether swapping two recipe assignments would introduce new
 * consecutive-day violations for either recipe in their new positions.
 * Returns warnings if the swap creates conflicts, along with the proposed
 * new state (without committing).
 *
 * @param plan - The current menu plan
 * @param ref1 - Reference to the first assignment (day/slot)
 * @param ref2 - Reference to the second assignment (day/slot)
 * @returns SwapCheckResult with warnings if the swap introduces conflicts
 */
export function swapWithConflictCheck(
  plan: MenuPlan,
  ref1: AssignmentRef,
  ref2: AssignmentRef
): SwapCheckResult {
  // Find the two assignments to swap
  const assignment1 = plan.assignments.find(
    (a) => a.dayIndex === ref1.dayIndex && a.slot === ref1.slot
  );
  const assignment2 = plan.assignments.find(
    (a) => a.dayIndex === ref2.dayIndex && a.slot === ref2.slot
  );

  if (!assignment1 || !assignment2) {
    return {
      hasConflicts: false,
      warnings: [],
    };
  }

  const warnings: DistributionWarning[] = [];

  // After the swap, recipe1 goes to ref2's position, recipe2 goes to ref1's position.
  // We need to check conflicts for each recipe in its new position,
  // ignoring the other assignment being swapped (since it will be moved away).

  // Check recipe1 in ref2's position
  const recipe1Conflicts = checkSwapConflictsForRecipe(
    plan,
    assignment1.recipeId,
    ref2.dayIndex,
    ref2.slot,
    // Exclude the current position of recipe1 (it's being moved away)
    // and the current position of ref2 (recipe2 is moving away from there)
    [ref1, ref2]
  );
  warnings.push(...recipe1Conflicts);

  // Check recipe2 in ref1's position
  const recipe2Conflicts = checkSwapConflictsForRecipe(
    plan,
    assignment2.recipeId,
    ref1.dayIndex,
    ref1.slot,
    // Exclude both positions involved in the swap
    [ref1, ref2]
  );
  warnings.push(...recipe2Conflicts);

  const proposedSwap = {
    from: {
      dayIndex: ref1.dayIndex,
      slot: ref1.slot,
      recipeId: assignment2.recipeId,
    },
    to: {
      dayIndex: ref2.dayIndex,
      slot: ref2.slot,
      recipeId: assignment1.recipeId,
    },
  };

  return {
    hasConflicts: warnings.length > 0,
    warnings,
    proposedSwap,
  };
}

/**
 * Checks conflicts for a recipe being moved to a new position during a swap.
 * Excludes specified positions from the check (the swap positions themselves).
 */
function checkSwapConflictsForRecipe(
  plan: MenuPlan,
  recipeId: string,
  targetDayIndex: number,
  targetSlot: MealSlot,
  excludeRefs: AssignmentRef[]
): DistributionWarning[] {
  const warnings: DistributionWarning[] = [];

  // Find all other assignments of this recipe in the same slot,
  // excluding the positions being swapped
  const sameRecipeSameSlot = plan.assignments.filter((a) => {
    if (a.recipeId !== recipeId || a.slot !== targetSlot) return false;
    // Exclude positions involved in the swap
    const isExcluded = excludeRefs.some(
      (ref) => ref.dayIndex === a.dayIndex && ref.slot === a.slot
    );
    return !isExcluded;
  });

  for (const existing of sameRecipeSameSlot) {
    const separation = Math.abs(existing.dayIndex - targetDayIndex);
    if (separation < MIN_SEPARATION) {
      warnings.push({
        type: 'forced_consecutive',
        message: `La receta se repite con separación de ${separation} día(s) en ${targetSlot} (días ${Math.min(existing.dayIndex, targetDayIndex)} y ${Math.max(existing.dayIndex, targetDayIndex)}). La separación mínima recomendada es de ${MIN_SEPARATION} días.`,
        affectedDays: [existing.dayIndex, targetDayIndex].sort((a, b) => a - b),
      });
    }
  }

  return warnings;
}
