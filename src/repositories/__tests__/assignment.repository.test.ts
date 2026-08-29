import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAssignment,
  deleteAssignment,
  getAssignmentsByPlan,
  swapAssignments,
  addFreeDay,
  removeFreeDay,
  getFreeDays,
} from '../assignment.repository';

// Mock database utilities
vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => 'test-id'),
  withTransaction: vi.fn(async (_db: any, callback: any) => {
    return callback(_db);
  }),
}));

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
  };
}

describe('assignment.repository', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  describe('createAssignment', () => {
    it('should insert a new assignment and return the domain object', async () => {
      const result = await createAssignment(
        mockDb as any,
        'plan-1',
        0,
        'comida',
        'recipe-1'
      );

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [sql, id, planId, dayIndex, slot, recipeId] =
        mockDb.runAsync.mock.calls[0];
      expect(sql).toContain('INSERT INTO plan_assignments');
      expect(id).toBe('test-id');
      expect(planId).toBe('plan-1');
      expect(dayIndex).toBe(0);
      expect(slot).toBe('comida');
      expect(recipeId).toBe('recipe-1');

      expect(result).toEqual({
        id: 'test-id',
        planId: 'plan-1',
        dayIndex: 0,
        slot: 'comida',
        recipeId: 'recipe-1',
      });
    });

    it('should handle cena slot correctly', async () => {
      const result = await createAssignment(
        mockDb as any,
        'plan-2',
        3,
        'cena',
        'recipe-5'
      );

      expect(result.slot).toBe('cena');
      expect(result.dayIndex).toBe(3);
    });
  });

  describe('deleteAssignment', () => {
    it('should delete an assignment by ID', async () => {
      await deleteAssignment(mockDb as any, 'assign-1');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM plan_assignments WHERE id = ?',
        'assign-1'
      );
    });
  });

  describe('getAssignmentsByPlan', () => {
    it('should return empty array when no assignments exist', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await getAssignmentsByPlan(mockDb as any, 'plan-1');

      expect(result).toEqual([]);
    });

    it('should return mapped assignments ordered by day_index and slot', async () => {
      mockDb.getAllAsync.mockResolvedValue([
        {
          id: 'a1',
          plan_id: 'plan-1',
          day_index: 0,
          slot: 'comida',
          recipe_id: 'r1',
        },
        {
          id: 'a2',
          plan_id: 'plan-1',
          day_index: 0,
          slot: 'cena',
          recipe_id: 'r2',
        },
        {
          id: 'a3',
          plan_id: 'plan-1',
          day_index: 1,
          slot: 'comida',
          recipe_id: 'r3',
        },
      ]);

      const result = await getAssignmentsByPlan(mockDb as any, 'plan-1');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'a1',
        planId: 'plan-1',
        dayIndex: 0,
        slot: 'comida',
        recipeId: 'r1',
      });
      expect(result[1].slot).toBe('cena');
      expect(result[2].dayIndex).toBe(1);
    });
  });

  describe('swapAssignments', () => {
    it('should swap recipe_id between two assignments', async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce({
          id: 'a1',
          plan_id: 'plan-1',
          day_index: 0,
          slot: 'comida',
          recipe_id: 'recipe-A',
        })
        .mockResolvedValueOnce({
          id: 'a2',
          plan_id: 'plan-1',
          day_index: 1,
          slot: 'comida',
          recipe_id: 'recipe-B',
        });

      await swapAssignments(mockDb as any, 'a1', 'a2');

      // First update: a1 gets recipe-B
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE plan_assignments SET recipe_id = ? WHERE id = ?',
        'recipe-B',
        'a1'
      );
      // Second update: a2 gets recipe-A
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE plan_assignments SET recipe_id = ? WHERE id = ?',
        'recipe-A',
        'a2'
      );
    });

    it('should throw if one assignment is not found', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'a1',
        plan_id: 'plan-1',
        day_index: 0,
        slot: 'comida',
        recipe_id: 'recipe-A',
      });
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      await expect(
        swapAssignments(mockDb as any, 'a1', 'non-existent')
      ).rejects.toThrow('One or both assignments not found');
    });
  });

  describe('addFreeDay', () => {
    it('should insert a free day and return the domain object', async () => {
      const result = await addFreeDay(mockDb as any, 'plan-1', 2, 'ambas');

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [sql, id, planId, dayIndex, type] = mockDb.runAsync.mock.calls[0];
      expect(sql).toContain('INSERT INTO free_days');
      expect(id).toBe('test-id');
      expect(planId).toBe('plan-1');
      expect(dayIndex).toBe(2);
      expect(type).toBe('ambas');

      expect(result).toEqual({
        id: 'test-id',
        planId: 'plan-1',
        dayIndex: 2,
        type: 'ambas',
      });
    });

    it('should handle comida type', async () => {
      const result = await addFreeDay(mockDb as any, 'plan-1', 5, 'comida');
      expect(result.type).toBe('comida');
    });

    it('should handle cena type', async () => {
      const result = await addFreeDay(mockDb as any, 'plan-1', 3, 'cena');
      expect(result.type).toBe('cena');
    });
  });

  describe('removeFreeDay', () => {
    it('should delete a free day by ID', async () => {
      await removeFreeDay(mockDb as any, 'fd-1');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM free_days WHERE id = ?',
        'fd-1'
      );
    });
  });

  describe('getFreeDays', () => {
    it('should return empty array when no free days exist', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await getFreeDays(mockDb as any, 'plan-1');

      expect(result).toEqual([]);
    });

    it('should return mapped free days ordered by day_index', async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { id: 'fd-1', plan_id: 'plan-1', day_index: 1, type: 'comida' },
        { id: 'fd-2', plan_id: 'plan-1', day_index: 3, type: 'ambas' },
        { id: 'fd-3', plan_id: 'plan-1', day_index: 6, type: 'cena' },
      ]);

      const result = await getFreeDays(mockDb as any, 'plan-1');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'fd-1',
        planId: 'plan-1',
        dayIndex: 1,
        type: 'comida',
      });
      expect(result[1].type).toBe('ambas');
      expect(result[2].type).toBe('cena');
    });
  });
});
