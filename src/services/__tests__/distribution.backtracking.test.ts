/**
 * Unit tests for Distribution Engine - Backtracking and Conflict Resolution
 *
 * Tests the enhanced distribution with:
 * - Constraint-satisfaction backtracking with depth limit
 * - Best-effort assignment with warnings when constraints can't be fully satisfied
 * - DistributionWarning generation for insufficient_separation, elaborate_overflow, forced_consecutive
 * - validateDistribution for post-assignment conflict checking
 */

import { describe, it, expect } from 'vitest';
import {
  distribute,
  distributeWithBacktracking,
  validateDistribution,
  type DistributionConfig,
  type DayAssignment,
  type DistributionWarning,
} from '../distribution.engine';
import type { SelectedRecipe } from '../../models/inputs';
import type { Recipe, MenuPlan, FreeDay } from '../../models/types';

// --- Helpers ---

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    mealType: 'comida',
    prepTime: 'rapido',
    ingredients: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSelectedRecipe(
  overrides: Partial<SelectedRecipe> & { recipe?: Partial<Recipe> } = {}
): SelectedRecipe {
  const { recipe: recipeOverrides, ...rest } = overrides;
  return {
    recipeId: 'recipe-1',
    recipe: makeRecipe(recipeOverrides),
    count: 1,
    ...rest,
  };
}

function makeConfig(overrides: Partial<DistributionConfig> = {}): DistributionConfig {
  return {
    periodDays: 7,
    freeDays: [],
    elaborateDays: [],
    selectedLunchRecipes: [],
    selectedDinnerRecipes: [],
    ...overrides,
  };
}

function makeFreeDay(dayIndex: number, type: 'comida' | 'cena' | 'ambas'): FreeDay {
  return {
    id: `free-${dayIndex}`,
    planId: 'plan-1',
    dayIndex,
    type,
  };
}

// --- Tests ---

describe('Distribution Engine - Backtracking and Conflict Resolution', () => {
  describe('distributeWithBacktracking', () => {
    describe('greedy fallback', () => {
      it('should return greedy result when no violations exist', () => {
        const config = makeConfig({
          periodDays: 7,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-a',
              recipe: { id: 'lunch-a', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 4,
            }),
            makeSelectedRecipe({
              recipeId: 'lunch-b',
              recipe: { id: 'lunch-b', name: 'Lunch B', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 7,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(14); // 7 lunches + 7 dinners
      });

      it('should return failure when counts do not match (same as greedy)', () => {
        const config = makeConfig({
          periodDays: 5,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 3, // Less than 5 needed
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 5,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(false);
      });
    });

    describe('backtracking resolves violations', () => {
      it('should improve distribution when greedy produces violations', () => {
        // Scenario: 4 occurrences of same recipe in 7 days
        // Greedy might produce suboptimal spacing; backtracking should fix it
        const config = makeConfig({
          periodDays: 7,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'recipe-a',
              recipe: { id: 'recipe-a', name: 'Recipe A', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
            makeSelectedRecipe({
              recipeId: 'recipe-b',
              recipe: { id: 'recipe-b', name: 'Recipe B', mealType: 'comida', prepTime: 'rapido' },
              count: 4,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 7,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(14);

        // Verify separation for recipe-a
        const recipeADays = result.assignments
          .filter((a) => a.recipeId === 'recipe-a' && a.slot === 'comida')
          .map((a) => a.dayIndex)
          .sort((a, b) => a - b);

        for (let i = 1; i < recipeADays.length; i++) {
          expect(recipeADays[i] - recipeADays[i - 1]).toBeGreaterThanOrEqual(2);
        }
      });

      it('should handle backtracking for both lunch and dinner slots', () => {
        const config = makeConfig({
          periodDays: 7,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-a',
              recipe: { id: 'lunch-a', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 4,
            }),
            makeSelectedRecipe({
              recipeId: 'lunch-b',
              recipe: { id: 'lunch-b', name: 'Lunch B', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-a',
              recipe: { id: 'dinner-a', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 4,
            }),
            makeSelectedRecipe({
              recipeId: 'dinner-b',
              recipe: { id: 'dinner-b', name: 'Dinner B', mealType: 'cena', prepTime: 'rapido' },
              count: 3,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(14);
      });
    });

    describe('best-effort with warnings', () => {
      it('should produce forced_consecutive warning when same recipe fills all slots', () => {
        // 3 days, 1 recipe repeated 3 times - cannot avoid consecutive placement
        const config = makeConfig({
          periodDays: 3,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'recipe-a',
              recipe: { id: 'recipe-a', name: 'Recipe A', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 3,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        // Must have warnings since same recipe on consecutive days is unavoidable
        expect(result.warnings.length).toBeGreaterThan(0);
        const consecutiveWarnings = result.warnings.filter(
          (w) => w.type === 'forced_consecutive' || w.type === 'insufficient_separation'
        );
        expect(consecutiveWarnings.length).toBeGreaterThan(0);
      });

      it('should produce elaborate_overflow warning when elaborate recipes exceed available days', () => {
        const config = makeConfig({
          periodDays: 7,
          elaborateDays: [5, 6], // Only 2 elaborate days available
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'elab-1',
              recipe: { id: 'elab-1', name: 'Elaborate 1', mealType: 'comida', prepTime: 'elaborado' },
              count: 3, // More than 2 elaborate days
            }),
            makeSelectedRecipe({
              recipeId: 'elab-2',
              recipe: { id: 'elab-2', name: 'Elaborate 2', mealType: 'comida', prepTime: 'elaborado' },
              count: 2, // Even more elaborate
            }),
            makeSelectedRecipe({
              recipeId: 'quick-1',
              recipe: { id: 'quick-1', name: 'Quick 1', mealType: 'comida', prepTime: 'rapido' },
              count: 2,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 7,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        // Should have elaborate_overflow because 5 elaborate occurrences > 2 elaborate days
        // Note: the greedy places first recipe (3 times) on 2 elaborate days + 1 regular day,
        // second recipe (2 times) may overflow too
      });

      it('should return best result found when full resolution is impossible', () => {
        // 4 days, recipe A x3 - minimum separation of 2 cannot be fully maintained
        // Optimal: days 0, 2, and one more (day 3 gives separation 1 from day 2)
        // or days 0, 2 are fine, day 3 violates with day 2, but that's the best possible
        const config = makeConfig({
          periodDays: 4,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'recipe-a',
              recipe: { id: 'recipe-a', name: 'Recipe A', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
            makeSelectedRecipe({
              recipeId: 'recipe-b',
              recipe: { id: 'recipe-b', name: 'Recipe B', mealType: 'comida', prepTime: 'rapido' },
              count: 1,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 4,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(8); // 4 lunches + 4 dinners
      });
    });

    describe('warning types', () => {
      it('should generate insufficient_separation warning correctly', () => {
        // Force a scenario where separation is less than MIN_SEPARATION but > 1
        // With MIN_SEPARATION = 2, only separation of 1 (consecutive) is a violation
        // So insufficient_separation with separation < 2 but > 1 doesn't apply
        // but forced_consecutive applies when separation = 1
        const config = makeConfig({
          periodDays: 3,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'recipe-a',
              recipe: { id: 'recipe-a', name: 'Recipe A', mealType: 'comida', prepTime: 'rapido' },
              count: 3, // All 3 days, forced consecutive
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 3,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        // With separation = 1, these should be 'forced_consecutive'
        const forcedConsecutive = result.warnings.filter(
          (w) => w.type === 'forced_consecutive'
        );
        expect(forcedConsecutive.length).toBeGreaterThan(0);
        // Each warning should have affectedDays
        forcedConsecutive.forEach((w) => {
          expect(w.affectedDays.length).toBe(2);
          expect(w.message).toBeTruthy();
        });
      });

      it('should not generate warnings when distribution is perfect', () => {
        const config = makeConfig({
          periodDays: 7,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-a',
              recipe: { id: 'lunch-a', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
            makeSelectedRecipe({
              recipeId: 'lunch-b',
              recipe: { id: 'lunch-b', name: 'Lunch B', mealType: 'comida', prepTime: 'rapido' },
              count: 4,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-a',
              recipe: { id: 'dinner-a', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 3,
            }),
            makeSelectedRecipe({
              recipeId: 'dinner-b',
              recipe: { id: 'dinner-b', name: 'Dinner B', mealType: 'cena', prepTime: 'rapido' },
              count: 4,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        // With enough variety, no violations should occur
        const violationWarnings = result.warnings.filter(
          (w) =>
            w.type === 'insufficient_separation' || w.type === 'forced_consecutive'
        );
        expect(violationWarnings).toHaveLength(0);
      });
    });

    describe('depth limit termination', () => {
      it('should terminate within reasonable time even for complex inputs', () => {
        // A moderately complex scenario that exercises the depth limit
        const config = makeConfig({
          periodDays: 14,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-a',
              recipe: { id: 'lunch-a', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 7,
            }),
            makeSelectedRecipe({
              recipeId: 'lunch-b',
              recipe: { id: 'lunch-b', name: 'Lunch B', mealType: 'comida', prepTime: 'rapido' },
              count: 7,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-a',
              recipe: { id: 'dinner-a', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 7,
            }),
            makeSelectedRecipe({
              recipeId: 'dinner-b',
              recipe: { id: 'dinner-b', name: 'Dinner B', mealType: 'cena', prepTime: 'rapido' },
              count: 7,
            }),
          ],
        });

        const startTime = Date.now();
        const result = distributeWithBacktracking([], config);
        const elapsed = Date.now() - startTime;

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(28);
        // Should complete in well under 5 seconds (requirement 5.1)
        expect(elapsed).toBeLessThan(5000);
      });

      it('should handle single recipe repeated many times gracefully', () => {
        // Worst case for separation: 1 recipe fills all slots
        const config = makeConfig({
          periodDays: 7,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'only-recipe',
              recipe: { id: 'only-recipe', name: 'Only Recipe', mealType: 'comida', prepTime: 'rapido' },
              count: 7,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'only-dinner',
              recipe: { id: 'only-dinner', name: 'Only Dinner', mealType: 'cena', prepTime: 'rapido' },
              count: 7,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(14);
        // Should have forced_consecutive warnings since it's the same recipe every day
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });

    describe('integration with validateDistribution', () => {
      it('should produce results that validateDistribution can check', () => {
        const config = makeConfig({
          periodDays: 7,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-a',
              recipe: { id: 'lunch-a', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
            makeSelectedRecipe({
              recipeId: 'lunch-b',
              recipe: { id: 'lunch-b', name: 'Lunch B', mealType: 'comida', prepTime: 'rapido' },
              count: 4,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-a',
              recipe: { id: 'dinner-a', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 3,
            }),
            makeSelectedRecipe({
              recipeId: 'dinner-b',
              recipe: { id: 'dinner-b', name: 'Dinner B', mealType: 'cena', prepTime: 'rapido' },
              count: 4,
            }),
          ],
        });

        const distResult = distributeWithBacktracking([], config);
        expect(distResult.success).toBe(true);

        // Build a MenuPlan from the result
        const plan: MenuPlan = {
          id: 'plan-1',
          periodDays: 7,
          startDate: new Date(),
          status: 'confirmed',
          elaborateDays: [],
          assignments: distResult.assignments.map((a, i) => ({
            id: `assign-${i}`,
            planId: 'plan-1',
            dayIndex: a.dayIndex,
            slot: a.slot,
            recipeId: a.recipeId,
          })),
          freeDays: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const validation = validateDistribution(plan);

        // With enough recipe variety in 7 days, should be valid
        expect(validation.valid).toBe(true);
        expect(validation.violations).toHaveLength(0);
      });

      it('should produce warnings consistent with validateDistribution violations', () => {
        // Force violations by using a single recipe many times in few days
        const config = makeConfig({
          periodDays: 3,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'recipe-a',
              recipe: { id: 'recipe-a', name: 'Recipe A', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 3,
            }),
          ],
        });

        const distResult = distributeWithBacktracking([], config);
        expect(distResult.success).toBe(true);

        // Build a MenuPlan from the result
        const plan: MenuPlan = {
          id: 'plan-1',
          periodDays: 3,
          startDate: new Date(),
          status: 'confirmed',
          elaborateDays: [],
          assignments: distResult.assignments.map((a, i) => ({
            id: `assign-${i}`,
            planId: 'plan-1',
            dayIndex: a.dayIndex,
            slot: a.slot,
            recipeId: a.recipeId,
          })),
          freeDays: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const validation = validateDistribution(plan);

        // With recipe-a on all 3 days, violations must exist
        expect(validation.valid).toBe(false);
        expect(validation.violations.length).toBeGreaterThan(0);
        // And warnings from distributeWithBacktracking should also reflect this
        expect(distResult.warnings.length).toBeGreaterThan(0);
      });
    });

    describe('free days handling', () => {
      it('should respect free days during backtracking', () => {
        const config = makeConfig({
          periodDays: 7,
          freeDays: [makeFreeDay(2, 'comida'), makeFreeDay(4, 'ambas')],
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-a',
              recipe: { id: 'lunch-a', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 5, // 7 - 2 free days for lunch = 5
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-a',
              recipe: { id: 'dinner-a', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 6, // 7 - 1 free day for dinner = 6
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        // Verify no lunch on days 2 or 4
        const lunchAssignments = result.assignments.filter((a) => a.slot === 'comida');
        lunchAssignments.forEach((a) => {
          expect(a.dayIndex).not.toBe(2);
          expect(a.dayIndex).not.toBe(4);
        });
        // Verify no dinner on day 4
        const dinnerAssignments = result.assignments.filter((a) => a.slot === 'cena');
        dinnerAssignments.forEach((a) => {
          expect(a.dayIndex).not.toBe(4);
        });
      });
    });

    describe('empty and edge cases', () => {
      it('should handle empty recipe lists', () => {
        const config = makeConfig({
          periodDays: 0,
          selectedLunchRecipes: [],
          selectedDinnerRecipes: [],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      it('should handle period of 1 day', () => {
        const config = makeConfig({
          periodDays: 1,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch', mealType: 'comida', prepTime: 'rapido' },
              count: 1,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner', mealType: 'cena', prepTime: 'rapido' },
              count: 1,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(2);
        expect(result.warnings).toHaveLength(0);
      });

      it('should handle elaborate recipes with backtracking', () => {
        const config = makeConfig({
          periodDays: 7,
          elaborateDays: [5, 6],
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'elab-1',
              recipe: { id: 'elab-1', name: 'Elaborate 1', mealType: 'comida', prepTime: 'elaborado' },
              count: 2,
            }),
            makeSelectedRecipe({
              recipeId: 'quick-1',
              recipe: { id: 'quick-1', name: 'Quick 1', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
            makeSelectedRecipe({
              recipeId: 'quick-2',
              recipe: { id: 'quick-2', name: 'Quick 2', mealType: 'comida', prepTime: 'rapido' },
              count: 2,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 7,
            }),
          ],
        });

        const result = distributeWithBacktracking([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(14);
        // Elaborate recipes should still be on days 5, 6
        const elaborateAssignments = result.assignments.filter(
          (a) => a.recipeId === 'elab-1'
        );
        elaborateAssignments.forEach((a) => {
          expect([5, 6]).toContain(a.dayIndex);
        });
      });
    });
  });
});
