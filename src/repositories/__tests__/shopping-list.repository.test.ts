import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShoppingListRepository } from '../shopping-list.repository';
import type { CreateShoppingListItemInput } from '../shopping-list.repository';

let idCounter = 0;

// Mock database module
vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => `test-id-${++idCounter}`),
  withTransaction: vi.fn(async (_db: any, callback: any) => {
    return callback(_db);
  }),
}));

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
  };
}

describe('ShoppingListRepository', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let repo: ShoppingListRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    mockDb = createMockDb();
    repo = new ShoppingListRepository(mockDb as any);
  });

  describe('create', () => {
    it('should create a shopping list with items', async () => {
      const items: CreateShoppingListItemInput[] = [
        {
          ingredientId: 'ing-1',
          totalQuantityNeeded: 500,
          pantryQuantityDeducted: 200,
          netQuantity: 300,
          purchaseUnits: 1,
        },
        {
          ingredientId: 'ing-2',
          totalQuantityNeeded: 1000,
          pantryQuantityDeducted: 0,
          netQuantity: 1000,
          purchaseUnits: 2,
        },
      ];

      const result = await repo.createForPlan('plan-1', items);

      // Verify list was inserted
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO shopping_lists'),
        expect.arrayContaining(['plan-1'])
      );

      // Verify items were inserted
      expect(mockDb.runAsync).toHaveBeenCalledTimes(3); // 1 list + 2 items

      // Verify returned structure
      expect(result.planId).toBe('plan-1');
      expect(result.isStale).toBe(false);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].ingredientId).toBe('ing-1');
      expect(result.items[0].totalQuantityNeeded).toBe(500);
      expect(result.items[0].pantryQuantityDeducted).toBe(200);
      expect(result.items[0].netQuantity).toBe(300);
      expect(result.items[0].purchaseUnits).toBe(1);
      expect(result.items[0].isManuallyEdited).toBe(false);
      expect(result.items[0].isRemoved).toBe(false);
      expect(result.items[1].ingredientId).toBe('ing-2');
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should create a shopping list with no items', async () => {
      const result = await repo.createForPlan('plan-1', []);

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1); // Only the list insert
      expect(result.items).toHaveLength(0);
      expect(result.planId).toBe('plan-1');
    });
  });

  describe('getByPlanId', () => {
    it('should return null when no list exists for the plan', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await repo.getByPlanId('plan-1');

      expect(result).toBeNull();
    });

    it('should return the shopping list with items populated', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: 'list-1',
        plan_id: 'plan-1',
        generated_at: '2024-01-15T10:00:00.000Z',
        is_stale: 0,
      });

      mockDb.getAllAsync.mockResolvedValue([
        {
          id: 'item-1',
          list_id: 'list-1',
          ingredient_id: 'ing-1',
          total_quantity_needed: 500,
          pantry_quantity_deducted: 100,
          net_quantity: 400,
          purchase_units: 2,
          is_manually_edited: 0,
          is_removed: 0,
        },
        {
          id: 'item-2',
          list_id: 'list-1',
          ingredient_id: 'ing-2',
          total_quantity_needed: 200,
          pantry_quantity_deducted: 0,
          net_quantity: 200,
          purchase_units: 1,
          is_manually_edited: 1,
          is_removed: 0,
        },
      ]);

      const result = await repo.getByPlanId('plan-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('list-1');
      expect(result!.planId).toBe('plan-1');
      expect(result!.isStale).toBe(false);
      expect(result!.generatedAt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
      expect(result!.items).toHaveLength(2);
      expect(result!.items[0].ingredientId).toBe('ing-1');
      expect(result!.items[0].purchaseUnits).toBe(2);
      expect(result!.items[0].isManuallyEdited).toBe(false);
      expect(result!.items[1].isManuallyEdited).toBe(true);
    });

    it('should return isStale as true when is_stale = 1', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: 'list-1',
        plan_id: 'plan-1',
        generated_at: '2024-01-15T10:00:00.000Z',
        is_stale: 1,
      });
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await repo.getByPlanId('plan-1');

      expect(result!.isStale).toBe(true);
    });
  });

  describe('update', () => {
    it('should delete existing items and insert new ones', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        plan_id: 'plan-1',
        generated_at: '2024-01-16T12:00:00.000Z',
        is_stale: 0,
      });

      const newItems: CreateShoppingListItemInput[] = [
        {
          ingredientId: 'ing-3',
          totalQuantityNeeded: 750,
          pantryQuantityDeducted: 250,
          netQuantity: 500,
          purchaseUnits: 3,
        },
      ];

      const result = await repo.updateItems('list-1', newItems);

      // Should delete existing items
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM shopping_list_items'),
        ['list-1']
      );

      // Should update generated_at and reset is_stale
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE shopping_lists'),
        expect.arrayContaining(['list-1'])
      );

      // Should insert the new item
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO shopping_list_items'),
        expect.arrayContaining(['ing-3', 750, 250, 500, 3])
      );

      expect(result.id).toBe('list-1');
      expect(result.planId).toBe('plan-1');
      expect(result.isStale).toBe(false);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].ingredientId).toBe('ing-3');
      expect(result.items[0].purchaseUnits).toBe(3);
    });
  });

  describe('markStale', () => {
    it('should set is_stale = 1 on the shopping list', async () => {
      await repo.markStale('list-1');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE shopping_lists SET is_stale = 1 WHERE id = ?',
        ['list-1']
      );
    });
  });

  describe('editQuantity', () => {
    it('should update purchase_units and set is_manually_edited = 1', async () => {
      await repo.editQuantity('item-1', 5);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE shopping_list_items SET purchase_units = ?, is_manually_edited = 1 WHERE id = ?',
        [5, 'item-1']
      );
    });
  });

  describe('removeItem', () => {
    it('should set is_removed = 1 on the item (soft delete)', async () => {
      await repo.removeItem('item-1');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE shopping_list_items SET is_removed = 1 WHERE id = ?',
        ['item-1']
      );
    });
  });
});
