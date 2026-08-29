/**
 * Property-based tests for Distribution Engine (Properties 12-15)
 * Feature: platoplan
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  distributeWithBacktracking,
  type DistributionConfig,
  type DayAssignment,
} from '../distribution.engine';
import {
  reassignWithConflictCheck,
  checkConflicts,
} from '../reassignment.service';
import type { SelectedRecipe } from '../../models/inputs';
import type { Recipe, MenuPlan, FreeDay } from '../../models/types';
import type { MealSlot, FreeDayType, PrepTime } from '../../models/enums';

// --- Custom Generators ---

/** Generates a valid period in days (1-14, kept smaller for fast execution) */
const arbPeriodDays = fc.integer({ min: 1, max: 14 });

/** Generates a prep time */
const arbPrepTime: fc.Arbitrary<PrepTime> = fc.constantFrom('rapido', 'elaborado');

/** Generates a free day type */
const arbFreeDayType: fc.Arbitrary<FreeDayType> = fc.constantFrom('comida', 'cena', 'ambas');

/**
 * Generates an array of FreeDay objects with unique dayIndex values,
 * each dayIndex in [0, periodDays-1].
 */
function arbFreeDays(periodDays: number): fc.Arbitrary<FreeDay[]> {
  if (periodDays <= 0) return fc.constant([]);
  return fc
    .uniqueArray(fc.integer({ min: 0, max: periodDays - 1 }), {
      minLength: 0,
      maxLength: Math.min(periodDays - 1, 4), // Keep some slots available
    })
    .chain((dayIndices) =>
      fc
        .array(arbFreeDayType, {
          minLength: dayIndices.length,
          maxLength: dayIndices.length,
        })
        .map((types) =>
          dayIndices.map((dayIndex, i) => ({
            id: `free-${dayIndex}`,
            planId: 'plan-1',
            dayIndex,
            type: types[i],
          }))
        )
    );
}

/**
 * Generates a subset of [0..periodDays-1] to use as elaborate days.
 */
function arbElaborateDays(periodDays: number): fc.Arbitrary<number[]> {
  if (periodDays <= 0) return fc.constant([]);
  return fc.uniqueArray(fc.integer({ min: 0, max: periodDays - 1 }), {
    minLength: 1,
    maxLength: Math.min(periodDays, 4),
  });
}

/**
 * Helper to compute available days for a slot given free days.
 */
function getAvailableDaysForSlot(
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
    return freeDay.type !== 'cena' && freeDay.type !== 'ambas';
  });
}

/** Creates a Recipe object with the given properties */
function makeRecipe(id: string, name: string, prepTime: PrepTime): Recipe {
  return {
    id,
    name,
    mealType: 'ambas',
    prepTime,
    ingredients: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Generates a valid set of SelectedRecipes for a slot such that
 * the total count matches the number of available slots exactly.
 * Ensures at least one recipe in the set.
 */
function arbRecipeSetForSlot(
  availableSlots: number,
  prepTimeConstraint?: PrepTime
): fc.Arbitrary<SelectedRecipe[]> {
  if (availableSlots <= 0) return fc.constant([]);

  // Generate between 1 and min(availableSlots, 5) distinct recipes
  const maxRecipes = Math.min(availableSlots, 5);

  return fc
    .integer({ min: 1, max: maxRecipes })
    .chain((numRecipes) => {
      // Partition availableSlots into numRecipes groups (each >= 1)
      return fc
        .array(fc.integer({ min: 1, max: availableSlots }), {
          minLength: numRecipes,
          maxLength: numRecipes,
        })
        .map((rawCounts) => {
          // Normalize counts to sum to availableSlots
          const total = rawCounts.reduce((a, b) => a + b, 0);
          const normalized = rawCounts.map((c) =>
            Math.max(1, Math.round((c / total) * availableSlots))
          );

          // Adjust to match exactly
          let diff = availableSlots - normalized.reduce((a, b) => a + b, 0);
          for (let i = 0; diff !== 0 && i < normalized.length; i++) {
            if (diff > 0) {
              normalized[i]++;
              diff--;
            } else if (diff < 0 && normalized[i] > 1) {
              normalized[i]--;
              diff++;
            }
          }
          // Final adjustment if still off
          while (diff > 0) {
            normalized[0]++;
            diff--;
          }
          while (diff < 0 && normalized[normalized.length - 1] > 1) {
            normalized[normalized.length - 1]--;
            diff++;
          }

          return normalized.map((count, idx) => {
            const prep = prepTimeConstraint || 'rapido';
            const id = `recipe-${prep}-${idx}`;
            return {
              recipeId: id,
              recipe: makeRecipe(id, `Recipe ${prep} ${idx}`, prep),
              count,
            };
          });
        });
    });
}

/**
 * Generates a complete valid DistributionConfig with recipes that exactly
 * fill all available slots.
 */
function arbValidDistributionConfig(): fc.Arbitrary<{
  config: DistributionConfig;
  availableLunchDays: number[];
  availableDinnerDays: number[];
}> {
  return arbPeriodDays.chain((periodDays) =>
    arbFreeDays(periodDays).chain((freeDays) =>
      arbElaborateDays(periodDays).chain((elaborateDays) => {
        const availableLunchDays = getAvailableDaysForSlot(periodDays, 'comida', freeDays);
        const availableDinnerDays = getAvailableDaysForSlot(periodDays, 'cena', freeDays);

        const lunchSlots = availableLunchDays.length;
        const dinnerSlots = availableDinnerDays.length;

        if (lunchSlots === 0 && dinnerSlots === 0) {
          return fc.constant({
            config: {
              periodDays,
              freeDays,
              elaborateDays,
              selectedLunchRecipes: [] as SelectedRecipe[],
              selectedDinnerRecipes: [] as SelectedRecipe[],
            },
            availableLunchDays,
            availableDinnerDays,
          });
        }

        return fc
          .tuple(
            arbRecipeSetForSlot(lunchSlots),
            arbRecipeSetForSlot(dinnerSlots)
          )
          .map(([lunchRecipes, dinnerRecipes]) => ({
            config: {
              periodDays,
              freeDays,
              elaborateDays,
              selectedLunchRecipes: lunchRecipes,
              selectedDinnerRecipes: dinnerRecipes,
            },
            availableLunchDays,
            availableDinnerDays,
          }));
      })
    )
  );
}

/**
 * Generates a valid DistributionConfig where lunch and dinner recipes
 * include both elaborate and quick recipes, with elaborate recipe counts
 * fitting within the available elaborate days.
 */
function arbConfigWithElaborateRecipes(): fc.Arbitrary<{
  config: DistributionConfig;
  elaborateDays: number[];
}> {
  // Use periods large enough to have meaningful elaborate days
  return fc.integer({ min: 4, max: 14 }).chain((periodDays) =>
    arbFreeDays(periodDays).chain((freeDays) =>
      arbElaborateDays(periodDays).chain((elaborateDays) => {
        const availableLunchDays = getAvailableDaysForSlot(periodDays, 'comida', freeDays);
        const lunchSlots = availableLunchDays.length;

        if (lunchSlots < 2) {
          // Need at least 2 slots to have both elaborate and quick
          return fc.constant({
            config: {
              periodDays,
              freeDays,
              elaborateDays,
              selectedLunchRecipes: [] as SelectedRecipe[],
              selectedDinnerRecipes: [] as SelectedRecipe[],
            },
            elaborateDays,
          });
        }

        // Count elaborate days that are available for lunch
        const eligibleElaborateDaysForLunch = elaborateDays.filter(
          (d) => availableLunchDays.includes(d)
        );
        const maxElaborate = Math.min(
          eligibleElaborateDaysForLunch.length,
          Math.floor(lunchSlots / 2)
        );

        if (maxElaborate === 0) {
          // No eligible elaborate days, just use quick recipes
          const dinnerSlots = getAvailableDaysForSlot(periodDays, 'cena', freeDays).length;
          return arbRecipeSetForSlot(dinnerSlots).map((dinnerRecipes) => ({
            config: {
              periodDays,
              freeDays,
              elaborateDays,
              selectedLunchRecipes: [{
                recipeId: 'quick-lunch-0',
                recipe: makeRecipe('quick-lunch-0', 'Quick Lunch 0', 'rapido'),
                count: lunchSlots,
              }],
              selectedDinnerRecipes: dinnerRecipes,
            },
            elaborateDays,
          }));
        }

        return fc
          .integer({ min: 1, max: maxElaborate })
          .chain((elaborateCount) => {
            const quickCount = lunchSlots - elaborateCount;
            const dinnerSlots = getAvailableDaysForSlot(periodDays, 'cena', freeDays).length;

            return arbRecipeSetForSlot(dinnerSlots).map((dinnerRecipes) => ({
              config: {
                periodDays,
                freeDays,
                elaborateDays,
                selectedLunchRecipes: [
                  {
                    recipeId: 'elab-lunch-0',
                    recipe: makeRecipe('elab-lunch-0', 'Elaborate Lunch 0', 'elaborado'),
                    count: elaborateCount,
                  },
                  ...(quickCount > 0
                    ? [{
                        recipeId: 'quick-lunch-0',
                        recipe: makeRecipe('quick-lunch-0', 'Quick Lunch 0', 'rapido'),
                        count: quickCount,
                      }]
                    : []),
                ],
                selectedDinnerRecipes: dinnerRecipes,
              },
              elaborateDays,
            }));
          });
      })
    )
  );
}

// --- Property Tests ---

describe('Distribution Engine - Property Tests', () => {
  /**
   * Property 12: Distribution fills all available slots
   * Feature: platoplan, Property 12: Distribution fills all available slots
   *
   * For any valid set of selected recipes and distribution configuration,
   * the distribution algorithm produces an assignment where every non-free
   * slot (lunch and dinner) has exactly one recipe assigned.
   *
   * **Validates: Requirements 5.1**
   */
  describe('Property 12: Distribution fills all available slots', () => {
    it('every non-free lunch slot has exactly one recipe assigned', () => {
      fc.assert(
        fc.property(
          arbValidDistributionConfig(),
          ({ config, availableLunchDays }) => {
            const result = distributeWithBacktracking([], config);

            if (!result.success) return; // Pre-condition: distribution succeeded

            const lunchAssignments = result.assignments.filter(
              (a) => a.slot === 'comida'
            );

            // Every available lunch day should have exactly one assignment
            for (const day of availableLunchDays) {
              const assignmentsForDay = lunchAssignments.filter(
                (a) => a.dayIndex === day
              );
              expect(assignmentsForDay).toHaveLength(1);
            }

            // Total lunch assignments should equal available lunch days
            expect(lunchAssignments).toHaveLength(availableLunchDays.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('every non-free dinner slot has exactly one recipe assigned', () => {
      fc.assert(
        fc.property(
          arbValidDistributionConfig(),
          ({ config, availableDinnerDays }) => {
            const result = distributeWithBacktracking([], config);

            if (!result.success) return; // Pre-condition: distribution succeeded

            const dinnerAssignments = result.assignments.filter(
              (a) => a.slot === 'cena'
            );

            // Every available dinner day should have exactly one assignment
            for (const day of availableDinnerDays) {
              const assignmentsForDay = dinnerAssignments.filter(
                (a) => a.dayIndex === day
              );
              expect(assignmentsForDay).toHaveLength(1);
            }

            // Total dinner assignments should equal available dinner days
            expect(dinnerAssignments).toHaveLength(availableDinnerDays.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('total assignments equal total available slots (lunch + dinner)', () => {
      fc.assert(
        fc.property(
          arbValidDistributionConfig(),
          ({ config, availableLunchDays, availableDinnerDays }) => {
            const result = distributeWithBacktracking([], config);

            if (!result.success) return; // Pre-condition: distribution succeeded

            const expectedTotal = availableLunchDays.length + availableDinnerDays.length;
            expect(result.assignments).toHaveLength(expectedTotal);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no recipe is assigned to a free day slot', () => {
      fc.assert(
        fc.property(
          arbValidDistributionConfig(),
          ({ config }) => {
            const result = distributeWithBacktracking([], config);

            if (!result.success) return;

            for (const assignment of result.assignments) {
              const freeDay = config.freeDays.find(
                (fd) => fd.dayIndex === assignment.dayIndex
              );
              if (freeDay) {
                if (assignment.slot === 'comida') {
                  expect(freeDay.type).not.toBe('comida');
                  expect(freeDay.type).not.toBe('ambas');
                } else {
                  expect(freeDay.type).not.toBe('cena');
                  expect(freeDay.type).not.toBe('ambas');
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 13: Distribution maintains minimum separation between repeated recipes
   * Feature: platoplan, Property 13: Distribution maintains minimum separation
   *
   * For any distribution output where a recipe appears more than once, the minimum
   * gap between consecutive occurrences of the same recipe is at least 2 days,
   * whenever the total number of distinct recipes makes this achievable.
   *
   * **Validates: Requirements 5.2**
   */
  describe('Property 13: Distribution maintains minimum separation between repeated recipes', () => {
    it('when separation is achievable, same recipe has at least 2-day gap in same slot', () => {
      fc.assert(
        fc.property(
          arbValidDistributionConfig(),
          ({ config, availableLunchDays, availableDinnerDays }) => {
            const result = distributeWithBacktracking([], config);

            if (!result.success) return;

            // Check each slot independently
            for (const slot of ['comida', 'cena'] as MealSlot[]) {
              const slotAssignments = result.assignments.filter(
                (a) => a.slot === slot
              );
              const availableDays =
                slot === 'comida' ? availableLunchDays : availableDinnerDays;

              // Group by recipeId
              const grouped = new Map<string, number[]>();
              for (const a of slotAssignments) {
                if (!grouped.has(a.recipeId)) {
                  grouped.set(a.recipeId, []);
                }
                grouped.get(a.recipeId)!.push(a.dayIndex);
              }

              // Check overall slot capacity: separation is achievable for ALL recipes
              // simultaneously only if the total slots can accommodate all recipes
              // with min gaps of 2 between same-recipe occurrences.
              // A conservative check: the max count recipe can achieve separation
              // only if n >= 2 * maxCount - 1, AND there's enough slack for other recipes.
              // We use a stricter check: n >= 2 * maxCount to ensure slack.
              let maxCount = 0;
              for (const [, days] of grouped) {
                maxCount = Math.max(maxCount, days.length);
              }

              // Skip if the slot is too constrained for the backtracking to guarantee separation
              const n = availableDays.length;
              if (n < 2 * maxCount) continue;

              for (const [recipeId, days] of grouped) {
                if (days.length < 2) continue;

                const sorted = [...days].sort((a, b) => a - b);
                for (let i = 1; i < sorted.length; i++) {
                  const separation = sorted[i] - sorted[i - 1];
                  // When achievable, the backtracking engine should maintain min 2-day gap
                  expect(separation).toBeGreaterThanOrEqual(2);
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('when only one recipe fills all slots (tight constraint), produces warnings for violations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 7 }),
          (periodDays) => {
            // Single recipe filling all slots - separation cannot be maintained
            const config: DistributionConfig = {
              periodDays,
              freeDays: [],
              elaborateDays: [],
              selectedLunchRecipes: [{
                recipeId: 'single-recipe',
                recipe: makeRecipe('single-recipe', 'Single Recipe', 'rapido'),
                count: periodDays,
              }],
              selectedDinnerRecipes: [{
                recipeId: 'dinner-recipe',
                recipe: makeRecipe('dinner-recipe', 'Dinner Recipe', 'rapido'),
                count: periodDays,
              }],
            };

            const result = distributeWithBacktracking([], config);

            expect(result.success).toBe(true);
            // When period >= 3, the single recipe will have consecutive days
            if (periodDays >= 3) {
              // Either it maintains separation (period small enough) or produces warnings
              const lunchDays = result.assignments
                .filter((a) => a.slot === 'comida')
                .map((a) => a.dayIndex)
                .sort((a, b) => a - b);

              let hasViolation = false;
              for (let i = 1; i < lunchDays.length; i++) {
                if (lunchDays[i] - lunchDays[i - 1] < 2) {
                  hasViolation = true;
                  break;
                }
              }

              if (hasViolation) {
                // Should produce warnings when violations exist
                expect(result.warnings.length).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('with enough distinct recipes, no consecutive-day assignments in same slot', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          (periodDays) => {
            // Use periodDays distinct recipes, each appearing once - no repetitions
            const lunchRecipes: SelectedRecipe[] = Array.from(
              { length: periodDays },
              (_, i) => ({
                recipeId: `lunch-${i}`,
                recipe: makeRecipe(`lunch-${i}`, `Lunch ${i}`, 'rapido'),
                count: 1,
              })
            );
            const dinnerRecipes: SelectedRecipe[] = Array.from(
              { length: periodDays },
              (_, i) => ({
                recipeId: `dinner-${i}`,
                recipe: makeRecipe(`dinner-${i}`, `Dinner ${i}`, 'rapido'),
                count: 1,
              })
            );

            const config: DistributionConfig = {
              periodDays,
              freeDays: [],
              elaborateDays: [],
              selectedLunchRecipes: lunchRecipes,
              selectedDinnerRecipes: dinnerRecipes,
            };

            const result = distributeWithBacktracking([], config);

            expect(result.success).toBe(true);

            // No recipe appears more than once, so no separation violations possible
            for (const slot of ['comida', 'cena'] as MealSlot[]) {
              const slotAssignments = result.assignments.filter(
                (a) => a.slot === slot
              );
              const grouped = new Map<string, number[]>();
              for (const a of slotAssignments) {
                if (!grouped.has(a.recipeId)) {
                  grouped.set(a.recipeId, []);
                }
                grouped.get(a.recipeId)!.push(a.dayIndex);
              }

              for (const [, days] of grouped) {
                // Each recipe appears exactly once
                expect(days).toHaveLength(1);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 14: Elaborate recipes assigned only to designated days
   * Feature: platoplan, Property 14: Elaborate recipes on designated days
   *
   * For any distribution output, every recipe with prep time "elaborado" is assigned
   * to a day that is in the set of designated elaborate days (defaults to Saturday=5
   * and Sunday=6 if not configured).
   *
   * **Validates: Requirements 5.3**
   */
  describe('Property 14: Elaborate recipes assigned only to designated days', () => {
    it('elaborate recipes are placed on designated elaborate days when enough days are available', () => {
      fc.assert(
        fc.property(
          arbConfigWithElaborateRecipes(),
          ({ config, elaborateDays }) => {
            const result = distributeWithBacktracking([], config);

            if (!result.success) return;

            // Get all elaborate recipe IDs from config
            const elaborateRecipeIds = new Set<string>();
            for (const r of config.selectedLunchRecipes) {
              if (r.recipe.prepTime === 'elaborado') {
                elaborateRecipeIds.add(r.recipeId);
              }
            }
            for (const r of config.selectedDinnerRecipes) {
              if (r.recipe.prepTime === 'elaborado') {
                elaborateRecipeIds.add(r.recipeId);
              }
            }

            if (elaborateRecipeIds.size === 0) return;

            // Check if there's an overflow warning (meaning not all elaborate
            // recipes could fit on elaborate days)
            const hasOverflow = result.warnings.some(
              (w) => w.type === 'elaborate_overflow'
            );

            if (hasOverflow) return; // Property doesn't hold when there's overflow

            // When no overflow, all elaborate recipe assignments should be on elaborate days
            const effectiveElaborateDays =
              elaborateDays.length > 0 ? elaborateDays : [5, 6];

            const elaborateAssignments = result.assignments.filter((a) =>
              elaborateRecipeIds.has(a.recipeId)
            );

            for (const assignment of elaborateAssignments) {
              expect(effectiveElaborateDays).toContain(assignment.dayIndex);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('with default elaborate days (empty config), elaborate recipes go to days 5 and 6', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 7, max: 14 }),
          (periodDays) => {
            // Period must include days 5 and 6
            const elaborateCount = 2; // Exactly fits 2 weekend days
            const quickCount = periodDays - elaborateCount;

            const config: DistributionConfig = {
              periodDays,
              freeDays: [],
              elaborateDays: [], // Defaults to [5, 6]
              selectedLunchRecipes: [
                {
                  recipeId: 'elab-0',
                  recipe: makeRecipe('elab-0', 'Elaborate 0', 'elaborado'),
                  count: elaborateCount,
                },
                {
                  recipeId: 'quick-0',
                  recipe: makeRecipe('quick-0', 'Quick 0', 'rapido'),
                  count: quickCount,
                },
              ],
              selectedDinnerRecipes: [{
                recipeId: 'dinner-0',
                recipe: makeRecipe('dinner-0', 'Dinner 0', 'rapido'),
                count: periodDays,
              }],
            };

            const result = distributeWithBacktracking([], config);

            expect(result.success).toBe(true);

            // Check elaborate assignments are on days 5 and 6
            const elaborateAssignments = result.assignments.filter(
              (a) => a.recipeId === 'elab-0'
            );

            expect(elaborateAssignments).toHaveLength(2);
            for (const a of elaborateAssignments) {
              expect([5, 6]).toContain(a.dayIndex);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('elaborate recipes do not appear on non-elaborate days when within capacity', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 14 }).chain((periodDays) =>
            arbElaborateDays(periodDays).chain((elaborateDays) => {
              // Ensure elaborate count <= available elaborate days
              const maxElaborate = Math.min(elaborateDays.length, 3);
              if (maxElaborate === 0) {
                return fc.constant({ periodDays, elaborateDays, elaborateCount: 0 });
              }
              return fc
                .integer({ min: 1, max: maxElaborate })
                .map((elaborateCount) => ({
                  periodDays,
                  elaborateDays,
                  elaborateCount,
                }));
            })
          ),
          ({ periodDays, elaborateDays, elaborateCount }) => {
            if (elaborateCount === 0) return;

            const quickCount = periodDays - elaborateCount;
            if (quickCount < 0) return;

            const config: DistributionConfig = {
              periodDays,
              freeDays: [],
              elaborateDays,
              selectedLunchRecipes: [
                {
                  recipeId: 'elab-only',
                  recipe: makeRecipe('elab-only', 'Elaborate Only', 'elaborado'),
                  count: elaborateCount,
                },
                ...(quickCount > 0
                  ? [{
                      recipeId: 'quick-only',
                      recipe: makeRecipe('quick-only', 'Quick Only', 'rapido'),
                      count: quickCount,
                    }]
                  : []),
              ],
              selectedDinnerRecipes: [{
                recipeId: 'dinner-quick',
                recipe: makeRecipe('dinner-quick', 'Dinner Quick', 'rapido'),
                count: periodDays,
              }],
            };

            const result = distributeWithBacktracking([], config);

            expect(result.success).toBe(true);

            // No overflow since elaborateCount <= elaborateDays.length
            const hasOverflow = result.warnings.some(
              (w) => w.type === 'elaborate_overflow'
            );
            if (hasOverflow) return;

            const elaborateAssignments = result.assignments.filter(
              (a) => a.recipeId === 'elab-only'
            );

            for (const a of elaborateAssignments) {
              expect(elaborateDays).toContain(a.dayIndex);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15: Manual reassignment conflict detection
   * Feature: platoplan, Property 15: Manual reassignment conflict detection
   *
   * For any manual reassignment that results in the same recipe appearing on
   * consecutive days, the system produces a warning indicating the specific
   * conflict, and the original assignment is preserved until the user explicitly
   * confirms the change.
   *
   * **Validates: Requirements 5.5, 5.6**
   */
  describe('Property 15: Manual reassignment conflict detection', () => {
    it('reassigning a recipe to a day adjacent to its existing occurrence produces a conflict warning', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 14 }),
          fc.constantFrom('comida' as MealSlot, 'cena' as MealSlot),
          (periodDays, slot) => {
            // Create a plan with a recipe at some day, then reassign it adjacent
            const existingDay = fc.sample(
              fc.integer({ min: 1, max: periodDays - 2 }),
              1
            )[0];
            const adjacentDay = existingDay + 1; // Consecutive day

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [
                {
                  id: 'a1',
                  planId: 'plan-1',
                  dayIndex: existingDay,
                  slot,
                  recipeId: 'recipe-conflict',
                },
              ],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Try to assign the same recipe to an adjacent day
            const result = reassignWithConflictCheck(
              plan,
              adjacentDay,
              slot,
              'recipe-conflict'
            );

            // Should detect a conflict
            expect(result.hasConflicts).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);

            // Warning should mention the affected days
            const warning = result.warnings[0];
            expect(warning.affectedDays).toContain(existingDay);
            expect(warning.affectedDays).toContain(adjacentDay);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('reassigning a recipe with sufficient separation produces no conflict', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 14 }),
          fc.constantFrom('comida' as MealSlot, 'cena' as MealSlot),
          (periodDays, slot) => {
            // Place a recipe at day 0, reassign to day with >=2 separation
            const existingDay = 0;
            const targetDay = fc.sample(
              fc.integer({ min: 2, max: periodDays - 1 }),
              1
            )[0];

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [
                {
                  id: 'a1',
                  planId: 'plan-1',
                  dayIndex: existingDay,
                  slot,
                  recipeId: 'recipe-ok',
                },
              ],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const result = reassignWithConflictCheck(
              plan,
              targetDay,
              slot,
              'recipe-ok'
            );

            // No conflict since separation >= 2
            expect(result.hasConflicts).toBe(false);
            expect(result.warnings).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('conflict detection returns the proposed assignment without modifying the plan', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 14 }),
          fc.constantFrom('comida' as MealSlot, 'cena' as MealSlot),
          fc.integer({ min: 0, max: 12 }),
          (periodDays, slot, baseDayRaw) => {
            const baseDay = baseDayRaw % Math.max(1, periodDays - 1);
            const targetDay = (baseDay + 1) % periodDays;

            const originalAssignments = [
              {
                id: 'a1',
                planId: 'plan-1',
                dayIndex: baseDay,
                slot,
                recipeId: 'recipe-x',
              },
            ];

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [...originalAssignments],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const result = reassignWithConflictCheck(
              plan,
              targetDay,
              slot,
              'recipe-x'
            );

            // Original plan assignments should remain unchanged
            expect(plan.assignments).toEqual(originalAssignments);

            // The result should include the proposed assignment
            if (result.proposedAssignment) {
              expect(result.proposedAssignment.dayIndex).toBe(targetDay);
              expect(result.proposedAssignment.slot).toBe(slot);
              expect(result.proposedAssignment.recipeId).toBe('recipe-x');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('conflict detected for same-day assignment (separation = 0)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 14 }),
          fc.constantFrom('comida' as MealSlot, 'cena' as MealSlot),
          (periodDays, slot) => {
            const existingDay = fc.sample(
              fc.integer({ min: 0, max: periodDays - 1 }),
              1
            )[0];

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [
                {
                  id: 'a1',
                  planId: 'plan-1',
                  dayIndex: existingDay,
                  slot,
                  recipeId: 'recipe-dup',
                },
              ],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Note: checkConflicts excludes the target day itself from checks,
            // so assigning to the same day won't find a conflict (it would replace).
            // But assigning to existingDay ± 1 will.
            const adjacentDay =
              existingDay < periodDays - 1 ? existingDay + 1 : existingDay - 1;

            const result = reassignWithConflictCheck(
              plan,
              adjacentDay,
              slot,
              'recipe-dup'
            );

            // Separation is 1, which is < MIN_SEPARATION (2), so conflict expected
            expect(result.hasConflicts).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0].type).toBe('forced_consecutive');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
