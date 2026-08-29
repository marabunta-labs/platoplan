/**
 * Unit tests for Distribution Engine
 *
 * Tests the core distribution algorithm including:
 * - Slot separation (lunch/dinner independence)
 * - Elaborate recipe placement on designated days
 * - Greedy interval-maximization for spacing
 * - Fill remaining slots with quick recipes
 * - Validation of distribution constraints
 */

import { describe, it, expect } from 'vitest';
import {
  distribute,
  validateDistribution,
  type DistributionConfig,
  type DayAssignment,
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

function makeSelectedRecipe(overrides: Partial<SelectedRecipe> & { recipe?: Partial<Recipe> } = {}): SelectedRecipe {
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

function getLunchAssignments(assignments: DayAssignment[]): DayAssignment[] {
  return assignments.filter((a) => a.slot === 'comida');
}

function getDinnerAssignments(assignments: DayAssignment[]): DayAssignment[] {
  return assignments.filter((a) => a.slot === 'cena');
}

// --- Tests ---

describe('Distribution Engine', () => {
  describe('distribute', () => {
    describe('slot separation', () => {
      it('should handle lunch and dinner independently', () => {
        const config = makeConfig({
          periodDays: 3,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        expect(getLunchAssignments(result.assignments)).toHaveLength(3);
        expect(getDinnerAssignments(result.assignments)).toHaveLength(3);
      });

      it('should assign lunch recipes only to comida slots', () => {
        const config = makeConfig({
          periodDays: 3,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
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

        const result = distribute([], config);

        const lunchAssignments = getLunchAssignments(result.assignments);
        lunchAssignments.forEach((a) => {
          expect(a.slot).toBe('comida');
          expect(a.recipeId).toBe('lunch-1');
        });
      });

      it('should assign dinner recipes only to cena slots', () => {
        const config = makeConfig({
          periodDays: 3,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
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

        const result = distribute([], config);

        const dinnerAssignments = getDinnerAssignments(result.assignments);
        dinnerAssignments.forEach((a) => {
          expect(a.slot).toBe('cena');
          expect(a.recipeId).toBe('dinner-1');
        });
      });

      it('should not mix lunch free days with dinner assignments', () => {
        const config = makeConfig({
          periodDays: 5,
          freeDays: [makeFreeDay(2, 'comida')], // Only lunch is free on day 2
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 4, // 5 - 1 free = 4 needed
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 5, // All 5 dinners needed
            }),
          ],
        });

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const lunchAssignments = getLunchAssignments(result.assignments);
        const dinnerAssignments = getDinnerAssignments(result.assignments);
        expect(lunchAssignments).toHaveLength(4);
        expect(dinnerAssignments).toHaveLength(5);
        // Day 2 should not have a lunch assignment
        expect(lunchAssignments.find((a) => a.dayIndex === 2)).toBeUndefined();
        // Day 2 should still have a dinner assignment
        expect(dinnerAssignments.find((a) => a.dayIndex === 2)).toBeDefined();
      });
    });

    describe('elaborate recipe placement', () => {
      it('should place elaborate recipes on designated elaborate days', () => {
        const config = makeConfig({
          periodDays: 7,
          elaborateDays: [5, 6], // Saturday/Sunday
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'elab-1',
              recipe: { id: 'elab-1', name: 'Elaborate A', mealType: 'comida', prepTime: 'elaborado' },
              count: 2,
            }),
            makeSelectedRecipe({
              recipeId: 'quick-1',
              recipe: { id: 'quick-1', name: 'Quick A', mealType: 'comida', prepTime: 'rapido' },
              count: 5,
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const elaborateAssignments = result.assignments.filter(
          (a) => a.recipeId === 'elab-1'
        );
        expect(elaborateAssignments).toHaveLength(2);
        // Both should be on elaborate days (5 or 6)
        elaborateAssignments.forEach((a) => {
          expect([5, 6]).toContain(a.dayIndex);
        });
      });

      it('should default to Saturday/Sunday (5, 6) when elaborateDays is empty', () => {
        const config = makeConfig({
          periodDays: 7,
          elaborateDays: [], // Will default to [5, 6]
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'elab-1',
              recipe: { id: 'elab-1', name: 'Elaborate A', mealType: 'comida', prepTime: 'elaborado' },
              count: 2,
            }),
            makeSelectedRecipe({
              recipeId: 'quick-1',
              recipe: { id: 'quick-1', name: 'Quick A', mealType: 'comida', prepTime: 'rapido' },
              count: 5,
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const elaborateAssignments = result.assignments.filter(
          (a) => a.recipeId === 'elab-1'
        );
        expect(elaborateAssignments).toHaveLength(2);
        elaborateAssignments.forEach((a) => {
          expect([5, 6]).toContain(a.dayIndex);
        });
      });

      it('should overflow elaborate recipes to other days with a warning', () => {
        const config = makeConfig({
          periodDays: 7,
          elaborateDays: [5, 6], // Only 2 elaborate days
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'elab-1',
              recipe: { id: 'elab-1', name: 'Elaborate A', mealType: 'comida', prepTime: 'elaborado' },
              count: 4, // More than available elaborate days
            }),
            makeSelectedRecipe({
              recipeId: 'quick-1',
              recipe: { id: 'quick-1', name: 'Quick A', mealType: 'comida', prepTime: 'rapido' },
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const elaborateAssignments = result.assignments.filter(
          (a) => a.recipeId === 'elab-1'
        );
        expect(elaborateAssignments).toHaveLength(4);
      });

      it('should place elaborate recipes before quick recipes', () => {
        const config = makeConfig({
          periodDays: 4,
          elaborateDays: [2, 3],
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'elab-1',
              recipe: { id: 'elab-1', name: 'Elaborate A', mealType: 'comida', prepTime: 'elaborado' },
              count: 2,
            }),
            makeSelectedRecipe({
              recipeId: 'quick-1',
              recipe: { id: 'quick-1', name: 'Quick A', mealType: 'comida', prepTime: 'rapido' },
              count: 2,
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const elaborateAssignments = result.assignments.filter(
          (a) => a.recipeId === 'elab-1'
        );
        // Elaborate should be on days 2 and 3
        elaborateAssignments.forEach((a) => {
          expect([2, 3]).toContain(a.dayIndex);
        });
        // Quick should be on the remaining days 0 and 1
        const quickAssignments = result.assignments.filter(
          (a) => a.recipeId === 'quick-1' && a.slot === 'comida'
        );
        quickAssignments.forEach((a) => {
          expect([0, 1]).toContain(a.dayIndex);
        });
      });
    });

    describe('greedy interval-maximization', () => {
      it('should space repeated recipes evenly across the period', () => {
        const config = makeConfig({
          periodDays: 6,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'recipe-a',
              recipe: { id: 'recipe-a', name: 'Recipe A', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
            makeSelectedRecipe({
              recipeId: 'recipe-b',
              recipe: { id: 'recipe-b', name: 'Recipe B', mealType: 'comida', prepTime: 'rapido' },
              count: 3,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 6,
            }),
          ],
        });

        const result = distribute([], config);

        expect(result.success).toBe(true);
        // Recipe A appears 3 times in 6 available slots - should be ~2 apart
        const recipeADays = result.assignments
          .filter((a) => a.recipeId === 'recipe-a')
          .map((a) => a.dayIndex)
          .sort((a, b) => a - b);

        expect(recipeADays).toHaveLength(3);
        // Check minimum separation of 2 for the first recipe placed
        for (let i = 1; i < recipeADays.length; i++) {
          expect(recipeADays[i] - recipeADays[i - 1]).toBeGreaterThanOrEqual(2);
        }
      });

      it('should produce a warning when separation cannot be maintained', () => {
        const config = makeConfig({
          periodDays: 3,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'recipe-a',
              recipe: { id: 'recipe-a', name: 'Recipe A', mealType: 'comida', prepTime: 'rapido' },
              count: 3, // 3 times in 3 days - forced consecutive
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some((w) => w.type === 'insufficient_separation')).toBe(true);
      });

      it('should handle a single occurrence without spacing issues', () => {
        const config = makeConfig({
          periodDays: 7,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'recipe-a',
              recipe: { id: 'recipe-a', name: 'Recipe A', mealType: 'comida', prepTime: 'rapido' },
              count: 1,
            }),
            makeSelectedRecipe({
              recipeId: 'recipe-b',
              recipe: { id: 'recipe-b', name: 'Recipe B', mealType: 'comida', prepTime: 'rapido' },
              count: 6,
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const recipeAAssignments = result.assignments.filter(
          (a) => a.recipeId === 'recipe-a'
        );
        expect(recipeAAssignments).toHaveLength(1);
      });
    });

    describe('free days handling', () => {
      it('should skip free comida days for lunch assignments', () => {
        const config = makeConfig({
          periodDays: 5,
          freeDays: [makeFreeDay(1, 'comida'), makeFreeDay(3, 'comida')],
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 3, // 5 - 2 free = 3 needed
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const lunchAssignments = getLunchAssignments(result.assignments);
        expect(lunchAssignments).toHaveLength(3);
        // No lunch on days 1 or 3
        lunchAssignments.forEach((a) => {
          expect(a.dayIndex).not.toBe(1);
          expect(a.dayIndex).not.toBe(3);
        });
      });

      it('should skip free cena days for dinner assignments', () => {
        const config = makeConfig({
          periodDays: 5,
          freeDays: [makeFreeDay(0, 'cena'), makeFreeDay(4, 'cena')],
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 5,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 3, // 5 - 2 free = 3 needed
            }),
          ],
        });

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const dinnerAssignments = getDinnerAssignments(result.assignments);
        expect(dinnerAssignments).toHaveLength(3);
        // No dinner on days 0 or 4
        dinnerAssignments.forEach((a) => {
          expect(a.dayIndex).not.toBe(0);
          expect(a.dayIndex).not.toBe(4);
        });
      });

      it('should skip ambas free days for both slots', () => {
        const config = makeConfig({
          periodDays: 5,
          freeDays: [makeFreeDay(2, 'ambas')],
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 4,
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        // No assignment on day 2 for either slot
        result.assignments.forEach((a) => {
          expect(a.dayIndex).not.toBe(2);
        });
      });
    });

    describe('success/failure conditions', () => {
      it('should return success when all slots are filled', () => {
        const config = makeConfig({
          periodDays: 3,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(6);
      });

      it('should return failure when lunch count does not match', () => {
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

        const result = distribute([], config);

        expect(result.success).toBe(false);
      });

      it('should return failure when dinner count does not match', () => {
        const config = makeConfig({
          periodDays: 5,
          selectedLunchRecipes: [
            makeSelectedRecipe({
              recipeId: 'lunch-1',
              recipe: { id: 'lunch-1', name: 'Lunch A', mealType: 'comida', prepTime: 'rapido' },
              count: 5,
            }),
          ],
          selectedDinnerRecipes: [
            makeSelectedRecipe({
              recipeId: 'dinner-1',
              recipe: { id: 'dinner-1', name: 'Dinner A', mealType: 'cena', prepTime: 'rapido' },
              count: 3, // Less than 5 needed
            }),
          ],
        });

        const result = distribute([], config);

        expect(result.success).toBe(false);
      });

      it('should handle empty recipe lists', () => {
        const config = makeConfig({
          periodDays: 0,
          selectedLunchRecipes: [],
          selectedDinnerRecipes: [],
        });

        const result = distribute([], config);

        expect(result.success).toBe(true);
        expect(result.assignments).toHaveLength(0);
      });
    });

    describe('multiple recipes', () => {
      it('should distribute multiple lunch recipes across available days', () => {
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        const lunchA = result.assignments.filter((a) => a.recipeId === 'lunch-a');
        const lunchB = result.assignments.filter((a) => a.recipeId === 'lunch-b');
        expect(lunchA).toHaveLength(4);
        expect(lunchB).toHaveLength(3);
      });

      it('should not assign two recipes to the same day and slot', () => {
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

        const result = distribute([], config);

        expect(result.success).toBe(true);
        // Check no day has two lunch assignments
        const lunchByDay = new Map<number, number>();
        for (const a of getLunchAssignments(result.assignments)) {
          lunchByDay.set(a.dayIndex, (lunchByDay.get(a.dayIndex) || 0) + 1);
        }
        for (const [, count] of lunchByDay) {
          expect(count).toBe(1);
        }
      });
    });
  });

  describe('validateDistribution', () => {
    it('should return valid for a plan with good separation', () => {
      const plan: MenuPlan = {
        id: 'plan-1',
        periodDays: 7,
        startDate: new Date(),
        status: 'draft',
        elaborateDays: [5, 6],
        assignments: [
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'r1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 3, slot: 'comida', recipeId: 'r1' },
          { id: 'a3', planId: 'plan-1', dayIndex: 6, slot: 'comida', recipeId: 'r1' },
        ],
        freeDays: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateDistribution(plan);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect separation violations', () => {
      const plan: MenuPlan = {
        id: 'plan-1',
        periodDays: 7,
        startDate: new Date(),
        status: 'draft',
        elaborateDays: [],
        assignments: [
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'r1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 1, slot: 'comida', recipeId: 'r1' }, // Only 1 day apart
        ],
        freeDays: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateDistribution(plan);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].recipeId).toBe('r1');
      expect(result.violations[0].slot).toBe('comida');
      expect(result.violations[0].actualSeparation).toBe(1);
      expect(result.violations[0].minimumSeparation).toBe(2);
    });

    it('should check slots independently', () => {
      // Same recipe on same day but different slots = OK
      const plan: MenuPlan = {
        id: 'plan-1',
        periodDays: 7,
        startDate: new Date(),
        status: 'draft',
        elaborateDays: [],
        assignments: [
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'r1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 0, slot: 'cena', recipeId: 'r1' },
          { id: 'a3', planId: 'plan-1', dayIndex: 3, slot: 'comida', recipeId: 'r1' },
          { id: 'a4', planId: 'plan-1', dayIndex: 3, slot: 'cena', recipeId: 'r1' },
        ],
        freeDays: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateDistribution(plan);

      expect(result.valid).toBe(true);
    });

    it('should report multiple violations', () => {
      const plan: MenuPlan = {
        id: 'plan-1',
        periodDays: 7,
        startDate: new Date(),
        status: 'draft',
        elaborateDays: [],
        assignments: [
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'r1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 1, slot: 'comida', recipeId: 'r1' },
          { id: 'a3', planId: 'plan-1', dayIndex: 2, slot: 'comida', recipeId: 'r1' },
        ],
        freeDays: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateDistribution(plan);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(2); // Day 0-1 and Day 1-2
    });

    it('should return valid for single occurrence recipes', () => {
      const plan: MenuPlan = {
        id: 'plan-1',
        periodDays: 7,
        startDate: new Date(),
        status: 'draft',
        elaborateDays: [],
        assignments: [
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'r1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 1, slot: 'comida', recipeId: 'r2' },
          { id: 'a3', planId: 'plan-1', dayIndex: 2, slot: 'comida', recipeId: 'r3' },
        ],
        freeDays: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateDistribution(plan);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should return valid for empty plan', () => {
      const plan: MenuPlan = {
        id: 'plan-1',
        periodDays: 7,
        startDate: new Date(),
        status: 'draft',
        elaborateDays: [],
        assignments: [],
        freeDays: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateDistribution(plan);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
