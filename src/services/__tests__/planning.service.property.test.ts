/**
 * Property-based tests for PlanningService (Properties 9-11)
 * Feature: platoplan
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  createPlanningService,
  calculateRequiredLunches,
  calculateRequiredDinners,
} from '../planning.service';
import type { FreeDayType, MealType, MealSlot } from '../../models/enums';
import type { MenuPlan, Recipe } from '../../models/types';

// Mock expo-sqlite module
vi.mock('expo-sqlite', () => ({}));

// Mock the plan repository
vi.mock('../../repositories/plan.repository', () => ({
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  getPlanById: vi.fn(),
  getActivePlan: vi.fn(),
}));

// Mock the assignment repository
vi.mock('../../repositories/assignment.repository', () => ({
  createAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  getAssignmentsByPlan: vi.fn(),
  swapAssignments: vi.fn(),
  addFreeDay: vi.fn(),
  removeFreeDay: vi.fn(),
  getFreeDays: vi.fn(),
}));

// Mock the recipe repository
vi.mock('../../repositories/recipe.repository', () => ({
  getById: vi.fn(),
  getAll: vi.fn(),
  getByMealType: vi.fn(),
}));

// Mock database utilities
vi.mock('../../database/database', () => ({
  withTransaction: vi.fn(
    async (_db: unknown, callback: (db: unknown) => Promise<unknown>) => {
      return callback(_db);
    }
  ),
  generateId: vi.fn(() => 'test-uuid-plan'),
}));

import * as planRepository from '../../repositories/plan.repository';
import * as assignmentRepository from '../../repositories/assignment.repository';
import * as recipeRepository from '../../repositories/recipe.repository';

// --- Custom Generators ---

/** Generates a valid period in days (integer 1-30) */
const arbPeriodDays = fc.integer({ min: 1, max: 30 });

/** Generates a free day type */
const arbFreeDayType: fc.Arbitrary<FreeDayType> = fc.constantFrom(
  'comida' as FreeDayType,
  'cena' as FreeDayType,
  'ambas' as FreeDayType
);

/** Generates a meal type for recipes */
const arbMealType: fc.Arbitrary<MealType> = fc.constantFrom(
  'comida' as MealType,
  'cena' as MealType,
  'ambas' as MealType
);

/** Generates a meal slot */
const arbMealSlot: fc.Arbitrary<MealSlot> = fc.constantFrom(
  'comida' as MealSlot,
  'cena' as MealSlot
);

/**
 * Generates an array of free days with unique dayIndex values,
 * each dayIndex in [0, periodDays-1].
 */
function arbFreeDays(periodDays: number): fc.Arbitrary<{ dayIndex: number; type: FreeDayType }[]> {
  if (periodDays <= 0) return fc.constant([]);
  return fc
    .uniqueArray(fc.integer({ min: 0, max: periodDays - 1 }), {
      minLength: 0,
      maxLength: Math.min(periodDays, 10),
    })
    .chain((dayIndices) =>
      fc
        .array(arbFreeDayType, {
          minLength: dayIndices.length,
          maxLength: dayIndices.length,
        })
        .map((types) =>
          dayIndices.map((dayIndex, i) => ({ dayIndex, type: types[i] }))
        )
    );
}

describe('PlanningService - Property Tests', () => {
  const mockDb = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 9: Plan slot calculation with free days
   * Feature: platoplan, Property 9: Plan slot calculation with free days
   *
   * For any planning period of N days with a set of free days F, the number of
   * required lunches equals N minus the count of free days that include "comida"
   * (type "comida" or "ambas"), and the number of required dinners equals N minus
   * the count of free days that include "cena" (type "cena" or "ambas").
   *
   * **Validates: Requirements 4.3, 4.5**
   */
  describe('Property 9: Plan slot calculation with free days', () => {
    it('required lunches = periodDays - count of free days with type comida or ambas', () => {
      fc.assert(
        fc.property(
          arbPeriodDays.chain((periodDays) =>
            arbFreeDays(periodDays).map((freeDays) => ({ periodDays, freeDays }))
          ),
          ({ periodDays, freeDays }) => {
            const result = calculateRequiredLunches(periodDays, freeDays);

            // Manual calculation: count free days that affect lunches
            const lunchFreeDayCount = freeDays.filter(
              (fd) => fd.type === 'comida' || fd.type === 'ambas'
            ).length;

            const expected = periodDays - lunchFreeDayCount;

            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('required dinners = periodDays - count of free days with type cena or ambas', () => {
      fc.assert(
        fc.property(
          arbPeriodDays.chain((periodDays) =>
            arbFreeDays(periodDays).map((freeDays) => ({ periodDays, freeDays }))
          ),
          ({ periodDays, freeDays }) => {
            const result = calculateRequiredDinners(periodDays, freeDays);

            // Manual calculation: count free days that affect dinners
            const dinnerFreeDayCount = freeDays.filter(
              (fd) => fd.type === 'cena' || fd.type === 'ambas'
            ).length;

            const expected = periodDays - dinnerFreeDayCount;

            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('required lunches is always non-negative and at most periodDays', () => {
      fc.assert(
        fc.property(
          arbPeriodDays.chain((periodDays) =>
            arbFreeDays(periodDays).map((freeDays) => ({ periodDays, freeDays }))
          ),
          ({ periodDays, freeDays }) => {
            const result = calculateRequiredLunches(periodDays, freeDays);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(periodDays);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('required dinners is always non-negative and at most periodDays', () => {
      fc.assert(
        fc.property(
          arbPeriodDays.chain((periodDays) =>
            arbFreeDays(periodDays).map((freeDays) => ({ periodDays, freeDays }))
          ),
          ({ periodDays, freeDays }) => {
            const result = calculateRequiredDinners(periodDays, freeDays);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(periodDays);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('free days with type cena do NOT affect required lunches', () => {
      fc.assert(
        fc.property(
          arbPeriodDays.chain((periodDays) =>
            fc
              .uniqueArray(fc.integer({ min: 0, max: periodDays - 1 }), {
                minLength: 0,
                maxLength: Math.min(periodDays, 5),
              })
              .map((dayIndices) => ({
                periodDays,
                cenaOnlyFreeDays: dayIndices.map((d) => ({
                  dayIndex: d,
                  type: 'cena' as FreeDayType,
                })),
              }))
          ),
          ({ periodDays, cenaOnlyFreeDays }) => {
            const result = calculateRequiredLunches(periodDays, cenaOnlyFreeDays);
            // cena-only free days should not reduce lunch count
            expect(result).toBe(periodDays);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('free days with type comida do NOT affect required dinners', () => {
      fc.assert(
        fc.property(
          arbPeriodDays.chain((periodDays) =>
            fc
              .uniqueArray(fc.integer({ min: 0, max: periodDays - 1 }), {
                minLength: 0,
                maxLength: Math.min(periodDays, 5),
              })
              .map((dayIndices) => ({
                periodDays,
                comidaOnlyFreeDays: dayIndices.map((d) => ({
                  dayIndex: d,
                  type: 'comida' as FreeDayType,
                })),
              }))
          ),
          ({ periodDays, comidaOnlyFreeDays }) => {
            const result = calculateRequiredDinners(periodDays, comidaOnlyFreeDays);
            // comida-only free days should not reduce dinner count
            expect(result).toBe(periodDays);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Recipe type constraint for meal slots
   * Feature: platoplan, Property 10: Recipe type constraint for meal slots
   *
   * For any recipe selection for a menu plan, a Recipe can be selected for a
   * lunch slot if and only if its meal type is "comida" or "ambas", and can be
   * selected for a dinner slot if and only if its meal type is "cena" or "ambas".
   *
   * **Validates: Requirements 4.6**
   */
  describe('Property 10: Recipe type constraint for meal slots', () => {
    it('assignRecipe accepts a recipe for a slot iff the recipe type is compatible', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbMealType,
          arbMealSlot,
          async (recipeMealType, targetSlot) => {
            vi.clearAllMocks();
            const service = createPlanningService(mockDb);

            const recipeId = `recipe-${recipeMealType}-${targetSlot}`;
            const mockRecipe: Recipe = {
              id: recipeId,
              name: `Test Recipe ${recipeMealType}`,
              mealType: recipeMealType,
              prepTime: 'rapido',
              ingredients: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const mockPlan: MenuPlan = {
              id: 'plan-1',
              periodDays: 7,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            vi.mocked(planRepository.getPlanById).mockResolvedValue(mockPlan);
            vi.mocked(recipeRepository.getById).mockResolvedValue(mockRecipe);
            vi.mocked(assignmentRepository.createAssignment).mockResolvedValue(undefined);

            const result = await service.assignRecipe('plan-1', 0, targetSlot, recipeId);

            // Determine if this combination should be valid
            const isValidForLunch =
              recipeMealType === 'comida' || recipeMealType === 'ambas';
            const isValidForDinner =
              recipeMealType === 'cena' || recipeMealType === 'ambas';

            const shouldSucceed =
              targetSlot === 'comida' ? isValidForLunch : isValidForDinner;

            if (shouldSucceed) {
              expect(result.success).toBe(true);
            } else {
              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.error.type).toBe('validation');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('comida recipes are always valid for lunch and never valid for dinner', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 29 }),
          async (dayIndex) => {
            vi.clearAllMocks();
            const service = createPlanningService(mockDb);

            const mockRecipe: Recipe = {
              id: 'recipe-comida',
              name: 'Comida Recipe',
              mealType: 'comida',
              prepTime: 'rapido',
              ingredients: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const mockPlan: MenuPlan = {
              id: 'plan-1',
              periodDays: 30,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            vi.mocked(planRepository.getPlanById).mockResolvedValue(mockPlan);
            vi.mocked(recipeRepository.getById).mockResolvedValue(mockRecipe);
            vi.mocked(assignmentRepository.createAssignment).mockResolvedValue(undefined);

            // Should succeed for lunch
            const lunchResult = await service.assignRecipe(
              'plan-1',
              dayIndex,
              'comida',
              'recipe-comida'
            );
            expect(lunchResult.success).toBe(true);

            // Should fail for dinner
            const dinnerResult = await service.assignRecipe(
              'plan-1',
              dayIndex,
              'cena',
              'recipe-comida'
            );
            expect(dinnerResult.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cena recipes are always valid for dinner and never valid for lunch', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 29 }),
          async (dayIndex) => {
            vi.clearAllMocks();
            const service = createPlanningService(mockDb);

            const mockRecipe: Recipe = {
              id: 'recipe-cena',
              name: 'Cena Recipe',
              mealType: 'cena',
              prepTime: 'rapido',
              ingredients: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const mockPlan: MenuPlan = {
              id: 'plan-1',
              periodDays: 30,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            vi.mocked(planRepository.getPlanById).mockResolvedValue(mockPlan);
            vi.mocked(recipeRepository.getById).mockResolvedValue(mockRecipe);
            vi.mocked(assignmentRepository.createAssignment).mockResolvedValue(undefined);

            // Should succeed for dinner
            const dinnerResult = await service.assignRecipe(
              'plan-1',
              dayIndex,
              'cena',
              'recipe-cena'
            );
            expect(dinnerResult.success).toBe(true);

            // Should fail for lunch
            const lunchResult = await service.assignRecipe(
              'plan-1',
              dayIndex,
              'comida',
              'recipe-cena'
            );
            expect(lunchResult.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('ambas recipes are always valid for both lunch and dinner', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 29 }),
          arbMealSlot,
          async (dayIndex, slot) => {
            vi.clearAllMocks();
            const service = createPlanningService(mockDb);

            const mockRecipe: Recipe = {
              id: 'recipe-ambas',
              name: 'Ambas Recipe',
              mealType: 'ambas',
              prepTime: 'rapido',
              ingredients: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const mockPlan: MenuPlan = {
              id: 'plan-1',
              periodDays: 30,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            vi.mocked(planRepository.getPlanById).mockResolvedValue(mockPlan);
            vi.mocked(recipeRepository.getById).mockResolvedValue(mockRecipe);
            vi.mocked(assignmentRepository.createAssignment).mockResolvedValue(undefined);

            const result = await service.assignRecipe(
              'plan-1',
              dayIndex,
              slot,
              'recipe-ambas'
            );
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 11: Plan confirmation requires exact count match
   * Feature: platoplan, Property 11: Plan confirmation requires exact count match
   *
   * For any menu plan configuration, the plan can be confirmed if and only if
   * the number of selected lunch recipes equals the number of required lunches
   * AND the number of selected dinner recipes equals the number of required dinners.
   * When counts do not match, the exact numeric difference is reported.
   *
   * **Validates: Requirements 4.8, 4.9**
   */
  describe('Property 11: Plan confirmation requires exact count match', () => {
    it('plan confirmation succeeds iff lunch and dinner assignment counts match required', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPeriodDays.chain((periodDays) =>
            arbFreeDays(periodDays).chain((freeDays) => {
              // Calculate required meals
              const requiredLunches = periodDays - freeDays.filter(
                (fd) => fd.type === 'comida' || fd.type === 'ambas'
              ).length;
              const requiredDinners = periodDays - freeDays.filter(
                (fd) => fd.type === 'cena' || fd.type === 'ambas'
              ).length;

              // Generate a number of actual lunch/dinner assignments
              return fc
                .tuple(
                  fc.integer({ min: 0, max: Math.max(requiredLunches + 5, 5) }),
                  fc.integer({ min: 0, max: Math.max(requiredDinners + 5, 5) })
                )
                .map(([actualLunches, actualDinners]) => ({
                  periodDays,
                  freeDays,
                  requiredLunches,
                  requiredDinners,
                  actualLunches,
                  actualDinners,
                }));
            })
          ),
          async ({
            periodDays,
            freeDays,
            requiredLunches,
            requiredDinners,
            actualLunches,
            actualDinners,
          }) => {
            vi.clearAllMocks();
            const service = createPlanningService(mockDb);

            // Build mock assignments
            const assignments = [
              ...Array.from({ length: actualLunches }, (_, i) => ({
                id: `lunch-${i}`,
                planId: 'plan-1',
                dayIndex: i % periodDays,
                slot: 'comida' as MealSlot,
                recipeId: `recipe-l-${i}`,
              })),
              ...Array.from({ length: actualDinners }, (_, i) => ({
                id: `dinner-${i}`,
                planId: 'plan-1',
                dayIndex: i % periodDays,
                slot: 'cena' as MealSlot,
                recipeId: `recipe-d-${i}`,
              })),
            ];

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments,
              freeDays: freeDays.map((fd, i) => ({
                id: `fd-${i}`,
                planId: 'plan-1',
                dayIndex: fd.dayIndex,
                type: fd.type,
              })),
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);
            vi.mocked(planRepository.updatePlan).mockResolvedValue(undefined);

            const result = await service.updatePlan('plan-1', {
              status: 'confirmed',
            });

            const countsMatch =
              actualLunches === requiredLunches &&
              actualDinners === requiredDinners;

            if (countsMatch) {
              expect(result.success).toBe(true);
            } else {
              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.error.type).toBe('constraint');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('when counts do not match, exact numeric difference is reported', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPeriodDays.chain((periodDays) =>
            arbFreeDays(periodDays).chain((freeDays) => {
              const requiredLunches = periodDays - freeDays.filter(
                (fd) => fd.type === 'comida' || fd.type === 'ambas'
              ).length;
              const requiredDinners = periodDays - freeDays.filter(
                (fd) => fd.type === 'cena' || fd.type === 'ambas'
              ).length;

              // Generate mismatched counts (at least one must differ)
              return fc
                .tuple(
                  fc.integer({ min: 0, max: Math.max(requiredLunches + 5, 5) }),
                  fc.integer({ min: 0, max: Math.max(requiredDinners + 5, 5) })
                )
                .filter(
                  ([actualLunches, actualDinners]) =>
                    actualLunches !== requiredLunches ||
                    actualDinners !== requiredDinners
                )
                .map(([actualLunches, actualDinners]) => ({
                  periodDays,
                  freeDays,
                  requiredLunches,
                  requiredDinners,
                  actualLunches,
                  actualDinners,
                }));
            })
          ),
          async ({
            periodDays,
            freeDays,
            requiredLunches,
            requiredDinners,
            actualLunches,
            actualDinners,
          }) => {
            vi.clearAllMocks();
            const service = createPlanningService(mockDb);

            const assignments = [
              ...Array.from({ length: actualLunches }, (_, i) => ({
                id: `lunch-${i}`,
                planId: 'plan-1',
                dayIndex: i % periodDays,
                slot: 'comida' as MealSlot,
                recipeId: `recipe-l-${i}`,
              })),
              ...Array.from({ length: actualDinners }, (_, i) => ({
                id: `dinner-${i}`,
                planId: 'plan-1',
                dayIndex: i % periodDays,
                slot: 'cena' as MealSlot,
                recipeId: `recipe-d-${i}`,
              })),
            ];

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments,
              freeDays: freeDays.map((fd, i) => ({
                id: `fd-${i}`,
                planId: 'plan-1',
                dayIndex: fd.dayIndex,
                type: fd.type,
              })),
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

            const result = await service.updatePlan('plan-1', {
              status: 'confirmed',
            });

            expect(result.success).toBe(false);
            if (!result.success && result.error.type === 'constraint') {
              const message = result.error.message;

              // Verify lunch difference is reported correctly
              if (actualLunches !== requiredLunches) {
                const lunchDiff = requiredLunches - actualLunches;
                if (lunchDiff > 0) {
                  expect(message).toContain(`Faltan ${lunchDiff} comidas`);
                } else {
                  expect(message).toContain(`Sobran ${Math.abs(lunchDiff)} comidas`);
                }
              }

              // Verify dinner difference is reported correctly
              if (actualDinners !== requiredDinners) {
                const dinnerDiff = requiredDinners - actualDinners;
                if (dinnerDiff > 0) {
                  expect(message).toContain(`Faltan ${dinnerDiff} cenas`);
                } else {
                  expect(message).toContain(`Sobran ${Math.abs(dinnerDiff)} cenas`);
                }
              }

              // Verify details contain exact counts
              const details = result.error.details as Record<string, number>;
              expect(details.requiredLunches).toBe(requiredLunches);
              expect(details.selectedLunches).toBe(actualLunches);
              expect(details.requiredDinners).toBe(requiredDinners);
              expect(details.selectedDinners).toBe(actualDinners);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('createPlan always succeeds as draft regardless of recipe counts (validation deferred to confirmation)', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPeriodDays.chain((periodDays) =>
            arbFreeDays(periodDays).chain((freeDays) => {
              const requiredLunches = periodDays - freeDays.filter(
                (fd) => fd.type === 'comida' || fd.type === 'ambas'
              ).length;
              const requiredDinners = periodDays - freeDays.filter(
                (fd) => fd.type === 'cena' || fd.type === 'ambas'
              ).length;

              return fc
                .tuple(
                  fc.integer({ min: Math.max(0, requiredLunches - 3), max: requiredLunches + 3 }),
                  fc.integer({ min: Math.max(0, requiredDinners - 3), max: requiredDinners + 3 })
                )
                .map(([lunchCount, dinnerCount]) => ({
                  periodDays,
                  freeDays,
                  lunchCount,
                  dinnerCount,
                }));
            })
          ),
          async ({
            periodDays,
            freeDays,
            lunchCount,
            dinnerCount,
          }) => {
            vi.clearAllMocks();
            const service = createPlanningService(mockDb);

            const mockCreatedPlan: MenuPlan = {
              id: 'plan-new',
              periodDays,
              startDate: new Date('2024-06-01'),
              status: 'draft',
              elaborateDays: [],
              assignments: [],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            vi.mocked(planRepository.createPlan).mockResolvedValue(mockCreatedPlan);
            vi.mocked(planRepository.getPlanById).mockResolvedValue(mockCreatedPlan);
            vi.mocked(assignmentRepository.addFreeDay).mockResolvedValue(undefined);

            const config = {
              periodDays,
              startDate: new Date('2024-06-01'),
              freeDays,
              selectedLunchRecipes:
                lunchCount > 0
                  ? [{ recipeId: 'lunch-recipe-1', count: lunchCount }]
                  : [],
              selectedDinnerRecipes:
                dinnerCount > 0
                  ? [{ recipeId: 'dinner-recipe-1', count: dinnerCount }]
                  : [],
            };

            // createPlan should always succeed for draft creation
            // (count validation is deferred to updatePlan with status='confirmed')
            const result = await service.createPlan(config);
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
