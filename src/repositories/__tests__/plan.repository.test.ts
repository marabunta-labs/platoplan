import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPlan,
  updatePlan,
  getPlanById,
  getActivePlan,
} from '../plan.repository';

// Mock generateId
vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => 'test-plan-id'),
  withTransaction: vi.fn(),
}));

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
  };
}

describe('plan.repository', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  describe('createPlan', () => {
    it('should insert a new plan and return the domain object', async () => {
      const input = {
        periodDays: 7,
        startDate: new Date('2024-01-15T00:00:00.000Z'),
        elaborateDays: [5, 6],
      };

      const result = await createPlan(mockDb as any, input);

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [sql, id, periodDays, startDate, servings, elaborateDays] =
        mockDb.runAsync.mock.calls[0];
      expect(sql).toContain('INSERT INTO menu_plans');
      expect(id).toBe('test-plan-id');
      expect(periodDays).toBe(7);
      expect(startDate).toBe('2024-01-15T00:00:00.000Z');
      expect(servings).toBe(2);
      expect(elaborateDays).toBe('[5,6]');

      expect(result.id).toBe('test-plan-id');
      expect(result.periodDays).toBe(7);
      expect(result.startDate).toEqual(new Date('2024-01-15T00:00:00.000Z'));
      expect(result.servings).toBe(2);
      expect(result.status).toBe('draft');
      expect(result.elaborateDays).toEqual([5, 6]);
      expect(result.assignments).toEqual([]);
      expect(result.freeDays).toEqual([]);
    });

    it('should default elaborateDays to empty array when not provided', async () => {
      const input = {
        periodDays: 14,
        startDate: new Date('2024-02-01T00:00:00.000Z'),
      };

      const result = await createPlan(mockDb as any, input);

      const elaborateDaysArg = mockDb.runAsync.mock.calls[0][5];
      expect(elaborateDaysArg).toBe('[]');
      expect(result.elaborateDays).toEqual([]);
    });
  });

  describe('updatePlan', () => {
    it('should update status when provided', async () => {
      await updatePlan(mockDb as any, 'plan-1', { status: 'confirmed' });

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [sql, ...params] = mockDb.runAsync.mock.calls[0];
      expect(sql).toContain('SET status = ?');
      expect(sql).toContain('updated_at');
      expect(params).toContain('confirmed');
      expect(params).toContain('plan-1');
    });

    it('should update elaborateDays when provided', async () => {
      await updatePlan(mockDb as any, 'plan-1', { elaborateDays: [0, 6] });

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [sql, ...params] = mockDb.runAsync.mock.calls[0];
      expect(sql).toContain('elaborate_days_config = ?');
      expect(params).toContain('[0,6]');
    });

    it('should not execute query when no changes provided', async () => {
      await updatePlan(mockDb as any, 'plan-1', {});

      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it('should update both status and elaborateDays when both provided', async () => {
      await updatePlan(mockDb as any, 'plan-1', {
        status: 'confirmed',
        elaborateDays: [5, 6],
      });

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [sql] = mockDb.runAsync.mock.calls[0];
      expect(sql).toContain('status = ?');
      expect(sql).toContain('elaborate_days_config = ?');
    });
  });

  describe('getPlanById', () => {
    it('should return null when plan does not exist', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await getPlanById(mockDb as any, 'non-existent');

      expect(result).toBeNull();
    });

    it('should return plan with assignments and free days', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: 'plan-1',
        period_days: 7,
        start_date: '2024-01-15T00:00:00.000Z',
        status: 'draft',
        elaborate_days_config: '[5,6]',
        created_at: '2024-01-10T00:00:00.000Z',
        updated_at: '2024-01-10T00:00:00.000Z',
      });

      mockDb.getAllAsync
        .mockResolvedValueOnce([
          {
            id: 'assign-1',
            plan_id: 'plan-1',
            day_index: 0,
            slot: 'comida',
            recipe_id: 'recipe-1',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'fd-1',
            plan_id: 'plan-1',
            day_index: 2,
            type: 'ambas',
          },
        ]);

      const result = await getPlanById(mockDb as any, 'plan-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('plan-1');
      expect(result!.periodDays).toBe(7);
      expect(result!.status).toBe('draft');
      expect(result!.elaborateDays).toEqual([5, 6]);
      expect(result!.assignments).toHaveLength(1);
      expect(result!.assignments[0].slot).toBe('comida');
      expect(result!.freeDays).toHaveLength(1);
      expect(result!.freeDays[0].type).toBe('ambas');
    });
  });

  describe('getActivePlan', () => {
    it('should return null when no plans exist', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await getActivePlan(mockDb as any);

      expect(result).toBeNull();
    });

    it('should prefer draft plans over confirmed', async () => {
      // First call: find draft
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'draft-plan',
        period_days: 7,
        start_date: '2024-01-15T00:00:00.000Z',
        status: 'draft',
        elaborate_days_config: '[]',
        created_at: '2024-01-10T00:00:00.000Z',
        updated_at: '2024-01-10T00:00:00.000Z',
      });
      // getPlanById call — same row returned
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'draft-plan',
        period_days: 7,
        start_date: '2024-01-15T00:00:00.000Z',
        status: 'draft',
        elaborate_days_config: '[]',
        created_at: '2024-01-10T00:00:00.000Z',
        updated_at: '2024-01-10T00:00:00.000Z',
      });

      const result = await getActivePlan(mockDb as any);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('draft-plan');
    });

    it('should fall back to confirmed plan when no drafts exist', async () => {
      // First call: no draft found
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      // Second call: find confirmed plan
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'confirmed-plan',
        period_days: 14,
        start_date: '2024-01-01T00:00:00.000Z',
        status: 'confirmed',
        elaborate_days_config: '[5,6]',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-08T00:00:00.000Z',
      });
      // getPlanById call
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'confirmed-plan',
        period_days: 14,
        start_date: '2024-01-01T00:00:00.000Z',
        status: 'confirmed',
        elaborate_days_config: '[5,6]',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-08T00:00:00.000Z',
      });

      const result = await getActivePlan(mockDb as any);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('confirmed-plan');
      expect(result!.status).toBe('confirmed');
    });
  });
});
