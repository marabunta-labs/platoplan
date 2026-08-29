/**
 * Unit tests for Planning Service
 *
 * Tests period validation, slot calculation with free days,
 * recipe type constraints, and count match validation.
 * Uses mocked repositories to isolate service-layer logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPlanningService,
  calculateRequiredLunches,
  calculateRequiredDinners,
} from '../planning.service';
import type { PlanConfig } from '../../models/inputs';
import type { MenuPlan } from '../../models/types';
import type { FreeDayType } from '../../models/enums';

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

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
  };
}

function basePlanConfig(overrides?: Partial<PlanConfig>): PlanConfig {
  return {
    periodDays: 7,
    startDate: new Date('2024-06-01'),
    freeDays: [],
    selectedLunchRecipes: [
      { recipeId: 'recipe-lunch-1', count: 4 },
      { recipeId: 'recipe-lunch-2', count: 3 },
    ],
    selectedDinnerRecipes: [
      { recipeId: 'recipe-dinner-1', count: 4 },
      { recipeId: 'recipe-dinner-2', count: 3 },
    ],
    ...overrides,
  };
}

function mockPlan(overrides?: Partial<MenuPlan>): MenuPlan {
  return {
    id: 'plan-1',
    periodDays: 7,
    startDate: new Date('2024-06-01'),
    status: 'draft',
    elaborateDays: [],
    assignments: [],
    freeDays: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Planning Service', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: ReturnType<typeof createPlanningService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = createPlanningService(mockDb as any);

    // Default: recipes are valid for their slots
    vi.mocked(recipeRepository.getById).mockImplementation(
      async (_db, id) => {
        if (id === 'recipe-lunch-1' || id === 'recipe-lunch-2') {
          return {
            id,
            name: `Lunch Recipe ${id}`,
            mealType: 'comida',
            prepTime: 'rapido',
            ingredients: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        if (id === 'recipe-dinner-1' || id === 'recipe-dinner-2') {
          return {
            id,
            name: `Dinner Recipe ${id}`,
            mealType: 'cena',
            prepTime: 'rapido',
            ingredients: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        if (id === 'recipe-ambas') {
          return {
            id,
            name: 'Ambas Recipe',
            mealType: 'ambas',
            prepTime: 'rapido',
            ingredients: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      }
    );
  });

  describe('calculateRequiredLunches', () => {
    it('should return periodDays when no free days', () => {
      expect(calculateRequiredLunches(7, [])).toBe(7);
    });

    it('should subtract free days with type comida', () => {
      const freeDays = [{ dayIndex: 0, type: 'comida' as FreeDayType }];
      expect(calculateRequiredLunches(7, freeDays)).toBe(6);
    });

    it('should subtract free days with type ambas', () => {
      const freeDays = [{ dayIndex: 0, type: 'ambas' as FreeDayType }];
      expect(calculateRequiredLunches(7, freeDays)).toBe(6);
    });

    it('should not subtract free days with type cena', () => {
      const freeDays = [{ dayIndex: 0, type: 'cena' as FreeDayType }];
      expect(calculateRequiredLunches(7, freeDays)).toBe(7);
    });

    it('should handle multiple free days', () => {
      const freeDays = [
        { dayIndex: 0, type: 'comida' as FreeDayType },
        { dayIndex: 2, type: 'ambas' as FreeDayType },
        { dayIndex: 4, type: 'cena' as FreeDayType },
      ];
      expect(calculateRequiredLunches(7, freeDays)).toBe(5);
    });
  });

  describe('calculateRequiredDinners', () => {
    it('should return periodDays when no free days', () => {
      expect(calculateRequiredDinners(7, [])).toBe(7);
    });

    it('should subtract free days with type cena', () => {
      const freeDays = [{ dayIndex: 0, type: 'cena' as FreeDayType }];
      expect(calculateRequiredDinners(7, freeDays)).toBe(6);
    });

    it('should subtract free days with type ambas', () => {
      const freeDays = [{ dayIndex: 0, type: 'ambas' as FreeDayType }];
      expect(calculateRequiredDinners(7, freeDays)).toBe(6);
    });

    it('should not subtract free days with type comida', () => {
      const freeDays = [{ dayIndex: 0, type: 'comida' as FreeDayType }];
      expect(calculateRequiredDinners(7, freeDays)).toBe(7);
    });

    it('should handle multiple free days', () => {
      const freeDays = [
        { dayIndex: 0, type: 'cena' as FreeDayType },
        { dayIndex: 2, type: 'ambas' as FreeDayType },
        { dayIndex: 4, type: 'comida' as FreeDayType },
      ];
      expect(calculateRequiredDinners(7, freeDays)).toBe(5);
    });
  });

  describe('createPlan', () => {
    describe('period validation', () => {
      it('should reject periodDays less than 1', async () => {
        const config = basePlanConfig({ periodDays: 0 });
        const result = await service.createPlan(config);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
          if (result.error.type === 'validation') {
            expect(result.error.fields).toContainEqual(
              expect.objectContaining({ field: 'periodDays' })
            );
          }
        }
      });

      it('should reject periodDays greater than 30', async () => {
        const config = basePlanConfig({ periodDays: 31 });
        const result = await service.createPlan(config);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
          if (result.error.type === 'validation') {
            expect(result.error.fields).toContainEqual(
              expect.objectContaining({ field: 'periodDays' })
            );
          }
        }
      });

      it('should reject negative periodDays', async () => {
        const config = basePlanConfig({ periodDays: -5 });
        const result = await service.createPlan(config);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
        }
      });

      it('should reject non-integer periodDays', async () => {
        const config = basePlanConfig({ periodDays: 7.5 });
        const result = await service.createPlan(config);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
        }
      });

      it('should accept periodDays of 1', async () => {
        const config = basePlanConfig({
          periodDays: 1,
          selectedLunchRecipes: [{ recipeId: 'recipe-lunch-1', count: 1 }],
          selectedDinnerRecipes: [{ recipeId: 'recipe-dinner-1', count: 1 }],
        });

        const plan = mockPlan({ periodDays: 1 });
        vi.mocked(planRepository.createPlan).mockResolvedValue(plan);
        vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

        const result = await service.createPlan(config);
        expect(result.success).toBe(true);
      });

      it('should accept periodDays of 30', async () => {
        const config = basePlanConfig({
          periodDays: 30,
          selectedLunchRecipes: [{ recipeId: 'recipe-lunch-1', count: 30 }],
          selectedDinnerRecipes: [{ recipeId: 'recipe-dinner-1', count: 30 }],
        });

        const plan = mockPlan({ periodDays: 30 });
        vi.mocked(planRepository.createPlan).mockResolvedValue(plan);
        vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

        const result = await service.createPlan(config);
        expect(result.success).toBe(true);
      });
    });

    describe('draft creation without recipe validation', () => {
      it('should create a draft plan with empty recipe arrays', async () => {
        const config = basePlanConfig({
          periodDays: 7,
          selectedLunchRecipes: [],
          selectedDinnerRecipes: [],
        });

        const plan = mockPlan({ periodDays: 7 });
        vi.mocked(planRepository.createPlan).mockResolvedValue(plan);
        vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

        const result = await service.createPlan(config);
        expect(result.success).toBe(true);
      });

      it('should create a draft plan without recipe arrays (optional)', async () => {
        const config: PlanConfig = {
          periodDays: 7,
          startDate: new Date('2024-06-01'),
          freeDays: [],
        };

        const plan = mockPlan({ periodDays: 7 });
        vi.mocked(planRepository.createPlan).mockResolvedValue(plan);
        vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

        const result = await service.createPlan(config);
        expect(result.success).toBe(true);
      });

      it('should not validate count match at draft creation', async () => {
        // Even with mismatched counts, draft creation succeeds
        const config = basePlanConfig({
          periodDays: 7,
          selectedLunchRecipes: [{ recipeId: 'recipe-lunch-1', count: 2 }],
          selectedDinnerRecipes: [{ recipeId: 'recipe-dinner-1', count: 1 }],
        });

        const plan = mockPlan({ periodDays: 7 });
        vi.mocked(planRepository.createPlan).mockResolvedValue(plan);
        vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

        const result = await service.createPlan(config);
        expect(result.success).toBe(true);
      });
    });

    describe('successful plan creation', () => {
      it('should create a plan with valid config', async () => {
        const config = basePlanConfig();
        const plan = mockPlan();

        vi.mocked(planRepository.createPlan).mockResolvedValue(plan);
        vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

        const result = await service.createPlan(config);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe('plan-1');
          expect(result.data.periodDays).toBe(7);
          expect(result.data.status).toBe('draft');
        }
      });

      it('should add free days to the plan', async () => {
        const config = basePlanConfig({
          periodDays: 7,
          freeDays: [
            { dayIndex: 0, type: 'comida' as FreeDayType },
            { dayIndex: 3, type: 'ambas' as FreeDayType },
          ],
        });

        const plan = mockPlan();
        vi.mocked(planRepository.createPlan).mockResolvedValue(plan);
        vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

        await service.createPlan(config);

        expect(assignmentRepository.addFreeDay).toHaveBeenCalledTimes(2);
        expect(assignmentRepository.addFreeDay).toHaveBeenCalledWith(
          mockDb,
          'plan-1',
          0,
          'comida'
        );
        expect(assignmentRepository.addFreeDay).toHaveBeenCalledWith(
          mockDb,
          'plan-1',
          3,
          'ambas'
        );
      });
    });
  });

  describe('updatePlan', () => {
    it('should return error when plan does not exist', async () => {
      vi.mocked(planRepository.getPlanById).mockResolvedValue(null);

      const result = await service.updatePlan('nonexistent', {
        status: 'confirmed',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
      }
    });

    it('should allow updating elaborate days', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.updatePlan('plan-1', {
        elaborateDays: [5, 6],
      });

      expect(result.success).toBe(true);
      expect(planRepository.updatePlan).toHaveBeenCalledWith(
        mockDb,
        'plan-1',
        expect.objectContaining({ elaborateDays: [5, 6] })
      );
    });

    it('should validate count match when confirming a plan', async () => {
      const plan = mockPlan({
        periodDays: 7,
        assignments: [
          // Only 3 lunch assignments instead of 7
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'r1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 1, slot: 'comida', recipeId: 'r1' },
          { id: 'a3', planId: 'plan-1', dayIndex: 2, slot: 'comida', recipeId: 'r1' },
          // 7 dinner assignments
          { id: 'a4', planId: 'plan-1', dayIndex: 0, slot: 'cena', recipeId: 'r2' },
          { id: 'a5', planId: 'plan-1', dayIndex: 1, slot: 'cena', recipeId: 'r2' },
          { id: 'a6', planId: 'plan-1', dayIndex: 2, slot: 'cena', recipeId: 'r2' },
          { id: 'a7', planId: 'plan-1', dayIndex: 3, slot: 'cena', recipeId: 'r2' },
          { id: 'a8', planId: 'plan-1', dayIndex: 4, slot: 'cena', recipeId: 'r2' },
          { id: 'a9', planId: 'plan-1', dayIndex: 5, slot: 'cena', recipeId: 'r2' },
          { id: 'a10', planId: 'plan-1', dayIndex: 6, slot: 'cena', recipeId: 'r2' },
        ],
        freeDays: [],
      });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.updatePlan('plan-1', { status: 'confirmed' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('constraint');
        if (result.error.type === 'constraint') {
          expect(result.error.message).toContain('Faltan 4 comidas');
        }
      }
    });

    it('should allow confirming when counts match', async () => {
      const plan = mockPlan({
        periodDays: 2,
        assignments: [
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'r1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 1, slot: 'comida', recipeId: 'r1' },
          { id: 'a3', planId: 'plan-1', dayIndex: 0, slot: 'cena', recipeId: 'r2' },
          { id: 'a4', planId: 'plan-1', dayIndex: 1, slot: 'cena', recipeId: 'r2' },
        ],
        freeDays: [],
      });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.updatePlan('plan-1', { status: 'confirmed' });

      expect(result.success).toBe(true);
    });
  });

  describe('getPlan', () => {
    it('should return a plan when found', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.getPlan('plan-1');

      expect(result).toEqual(plan);
    });

    it('should return null when not found', async () => {
      vi.mocked(planRepository.getPlanById).mockResolvedValue(null);

      const result = await service.getPlan('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getActivePlan', () => {
    it('should delegate to repository', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getActivePlan).mockResolvedValue(plan);

      const result = await service.getActivePlan();

      expect(result).toEqual(plan);
      expect(planRepository.getActivePlan).toHaveBeenCalledWith(mockDb);
    });

    it('should return null when no active plan', async () => {
      vi.mocked(planRepository.getActivePlan).mockResolvedValue(null);

      const result = await service.getActivePlan();

      expect(result).toBeNull();
    });
  });

  describe('assignRecipe', () => {
    it('should assign a valid comida recipe to a lunch slot', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.assignRecipe(
        'plan-1',
        0,
        'comida',
        'recipe-lunch-1'
      );

      expect(result.success).toBe(true);
      expect(assignmentRepository.createAssignment).toHaveBeenCalledWith(
        mockDb,
        'plan-1',
        0,
        'comida',
        'recipe-lunch-1'
      );
    });

    it('should assign a valid cena recipe to a dinner slot', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.assignRecipe(
        'plan-1',
        0,
        'cena',
        'recipe-dinner-1'
      );

      expect(result.success).toBe(true);
      expect(assignmentRepository.createAssignment).toHaveBeenCalledWith(
        mockDb,
        'plan-1',
        0,
        'cena',
        'recipe-dinner-1'
      );
    });

    it('should assign an ambas recipe to a lunch slot', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.assignRecipe(
        'plan-1',
        0,
        'comida',
        'recipe-ambas'
      );

      expect(result.success).toBe(true);
    });

    it('should assign an ambas recipe to a dinner slot', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.assignRecipe(
        'plan-1',
        0,
        'cena',
        'recipe-ambas'
      );

      expect(result.success).toBe(true);
    });

    it('should reject a cena-only recipe for a lunch slot', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.assignRecipe(
        'plan-1',
        0,
        'comida',
        'recipe-dinner-1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields[0].field).toBe('recipeId');
        }
      }
    });

    it('should reject a comida-only recipe for a dinner slot', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.assignRecipe(
        'plan-1',
        0,
        'cena',
        'recipe-lunch-1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields[0].field).toBe('recipeId');
        }
      }
    });

    it('should return error when plan does not exist', async () => {
      vi.mocked(planRepository.getPlanById).mockResolvedValue(null);

      const result = await service.assignRecipe(
        'nonexistent',
        0,
        'comida',
        'recipe-lunch-1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields[0].field).toBe('planId');
        }
      }
    });

    it('should return error when recipe does not exist', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.assignRecipe(
        'plan-1',
        0,
        'comida',
        'nonexistent-recipe'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields[0].field).toBe('recipeId');
        }
      }
    });
  });

  describe('swapAssignments', () => {
    it('should swap two assignments successfully', async () => {
      const plan = mockPlan({
        assignments: [
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'recipe-lunch-1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 1, slot: 'comida', recipeId: 'recipe-lunch-2' },
        ],
      });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.swapAssignments(
        'plan-1',
        { dayIndex: 0, slot: 'comida' },
        { dayIndex: 1, slot: 'comida' }
      );

      expect(result.success).toBe(true);
      expect(assignmentRepository.swapAssignments).toHaveBeenCalledWith(
        mockDb,
        'a1',
        'a2'
      );
    });

    it('should return error when plan does not exist', async () => {
      vi.mocked(planRepository.getPlanById).mockResolvedValue(null);

      const result = await service.swapAssignments(
        'nonexistent',
        { dayIndex: 0, slot: 'comida' },
        { dayIndex: 1, slot: 'comida' }
      );

      expect(result.success).toBe(false);
    });

    it('should return error when assignments are not found', async () => {
      const plan = mockPlan({ assignments: [] });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.swapAssignments(
        'plan-1',
        { dayIndex: 0, slot: 'comida' },
        { dayIndex: 1, slot: 'comida' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
      }
    });

    it('should reject swap when recipe type would be invalid for target slot', async () => {
      // recipe-lunch-1 is comida type, recipe-dinner-1 is cena type
      // Trying to swap comida slot (day 0) with cena slot (day 0) would break constraints
      const plan = mockPlan({
        assignments: [
          { id: 'a1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'recipe-lunch-1' },
          { id: 'a2', planId: 'plan-1', dayIndex: 0, slot: 'cena', recipeId: 'recipe-dinner-1' },
        ],
      });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.swapAssignments(
        'plan-1',
        { dayIndex: 0, slot: 'comida' },
        { dayIndex: 0, slot: 'cena' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
      }
    });
  });

  describe('markFreeDay', () => {
    it('should mark a day as free for comida', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.markFreeDay('plan-1', 2, 'comida');

      expect(result.success).toBe(true);
      expect(assignmentRepository.addFreeDay).toHaveBeenCalledWith(
        mockDb,
        'plan-1',
        2,
        'comida'
      );
    });

    it('should mark a day as free for cena', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.markFreeDay('plan-1', 3, 'cena');

      expect(result.success).toBe(true);
      expect(assignmentRepository.addFreeDay).toHaveBeenCalledWith(
        mockDb,
        'plan-1',
        3,
        'cena'
      );
    });

    it('should mark a day as free for ambas', async () => {
      const plan = mockPlan();
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.markFreeDay('plan-1', 5, 'ambas');

      expect(result.success).toBe(true);
      expect(assignmentRepository.addFreeDay).toHaveBeenCalledWith(
        mockDb,
        'plan-1',
        5,
        'ambas'
      );
    });

    it('should return error when plan does not exist', async () => {
      vi.mocked(planRepository.getPlanById).mockResolvedValue(null);

      const result = await service.markFreeDay('nonexistent', 0, 'comida');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields[0].field).toBe('planId');
        }
      }
    });

    it('should reject day outside plan period (negative)', async () => {
      const plan = mockPlan({ periodDays: 7 });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.markFreeDay('plan-1', -1, 'comida');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields[0].field).toBe('day');
        }
      }
    });

    it('should reject day outside plan period (exceeds period)', async () => {
      const plan = mockPlan({ periodDays: 7 });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.markFreeDay('plan-1', 7, 'comida');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields[0].field).toBe('day');
        }
      }
    });

    it('should accept day at boundary (day 0)', async () => {
      const plan = mockPlan({ periodDays: 7 });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.markFreeDay('plan-1', 0, 'comida');

      expect(result.success).toBe(true);
    });

    it('should accept day at boundary (last day)', async () => {
      const plan = mockPlan({ periodDays: 7 });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const result = await service.markFreeDay('plan-1', 6, 'cena');

      expect(result.success).toBe(true);
    });
  });
});
