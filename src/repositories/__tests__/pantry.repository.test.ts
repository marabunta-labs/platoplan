import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PantryRepository } from '../pantry.repository';

// Mock generateId
vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => 'test-uuid-123'),
}));

/**
 * Creates a mock SQLiteDatabase with commonly needed methods.
 */
function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getAllAsync: vi.fn().mockResolvedValue([]),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    execAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('PantryRepository', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: PantryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    repo = new PantryRepository(db);
  });

  describe('addOrUpdate', () => {
    it('should insert a new pantry entry when ingredient does not exist', async () => {
      // getByIngredientId returns null (no existing entry)
      db.getFirstAsync.mockResolvedValue(null);

      const result = await repo.addOrUpdate('ingredient-1', 500);

      expect(result.id).toBe('test-uuid-123');
      expect(result.ingredientId).toBe('ingredient-1');
      expect(result.quantity).toBe(500);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO pantry_entries'),
        expect.arrayContaining(['test-uuid-123', 'ingredient-1', 500])
      );
    });

    it('should update an existing pantry entry when ingredient already exists', async () => {
      // getByIngredientId returns an existing entry
      db.getFirstAsync.mockResolvedValue({
        id: 'existing-id',
        ingredient_id: 'ingredient-1',
        quantity: 200,
        updated_at: '2024-01-01T00:00:00.000Z',
        ingredient_name: 'Harina',
        ingredient_unit: 'gramos',
        ingredient_purchase_format_desc: 'paquete de 1kg',
        ingredient_purchase_format_quantity: 1000,
        ingredient_category: 'harinas',
        ingredient_created_at: '2024-01-01T00:00:00.000Z',
        ingredient_updated_at: '2024-01-01T00:00:00.000Z',
      });

      const result = await repo.addOrUpdate('ingredient-1', 750);

      expect(result.id).toBe('existing-id');
      expect(result.ingredientId).toBe('ingredient-1');
      expect(result.quantity).toBe(750);
      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pantry_entries'),
        expect.arrayContaining([750, expect.any(String), 'ingredient-1'])
      );
    });

    it('should use upsert semantics - not create duplicate entries', async () => {
      // First call: no existing entry
      db.getFirstAsync.mockResolvedValueOnce(null);
      await repo.addOrUpdate('ingredient-1', 100);

      // Second call: entry now exists
      db.getFirstAsync.mockResolvedValueOnce({
        id: 'test-uuid-123',
        ingredient_id: 'ingredient-1',
        quantity: 100,
        updated_at: '2024-01-01T00:00:00.000Z',
        ingredient_name: 'Leche',
        ingredient_unit: 'mililitros',
        ingredient_purchase_format_desc: 'brick de 1L',
        ingredient_purchase_format_quantity: 1000,
        ingredient_category: 'lácteos',
        ingredient_created_at: '2024-01-01T00:00:00.000Z',
        ingredient_updated_at: '2024-01-01T00:00:00.000Z',
      });
      await repo.addOrUpdate('ingredient-1', 200);

      // First call should INSERT, second should UPDATE
      expect(db.runAsync).toHaveBeenCalledTimes(2);
      expect(db.runAsync.mock.calls[0][0]).toContain('INSERT');
      expect(db.runAsync.mock.calls[1][0]).toContain('UPDATE');
    });
  });

  describe('remove', () => {
    it('should delete the pantry entry for the given ingredient', async () => {
      await repo.remove('ingredient-1');

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM pantry_entries'),
        ['ingredient-1']
      );
    });

    it('should not throw if ingredient does not exist in pantry', async () => {
      db.runAsync.mockResolvedValue({ changes: 0 });

      await expect(repo.remove('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return an empty array when pantry is empty', async () => {
      db.getAllAsync.mockResolvedValue([]);

      const result = await repo.getAll();

      expect(result).toEqual([]);
    });

    it('should return pantry entries sorted alphabetically by ingredient name', async () => {
      db.getAllAsync.mockResolvedValue([
        {
          id: 'entry-1',
          ingredient_id: 'ing-1',
          quantity: 500,
          updated_at: '2024-01-01T00:00:00.000Z',
          ingredient_name: 'Arroz',
          ingredient_unit: 'gramos',
          ingredient_purchase_format_desc: 'paquete de 1kg',
          ingredient_purchase_format_quantity: 1000,
          ingredient_category: 'cereales',
          ingredient_created_at: '2024-01-01T00:00:00.000Z',
          ingredient_updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'entry-2',
          ingredient_id: 'ing-2',
          quantity: 2000,
          updated_at: '2024-01-02T00:00:00.000Z',
          ingredient_name: 'Leche',
          ingredient_unit: 'mililitros',
          ingredient_purchase_format_desc: 'brick de 1L',
          ingredient_purchase_format_quantity: 1000,
          ingredient_category: 'lácteos',
          ingredient_created_at: '2024-01-01T00:00:00.000Z',
          ingredient_updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'entry-3',
          ingredient_id: 'ing-3',
          quantity: 6,
          updated_at: '2024-01-03T00:00:00.000Z',
          ingredient_name: 'Tomate',
          ingredient_unit: 'unidades',
          ingredient_purchase_format_desc: 'bolsa de 6',
          ingredient_purchase_format_quantity: 6,
          ingredient_category: 'verduras',
          ingredient_created_at: '2024-01-01T00:00:00.000Z',
          ingredient_updated_at: '2024-01-01T00:00:00.000Z',
        },
      ]);

      const result = await repo.getAll();

      expect(result).toHaveLength(3);
      expect(result[0].ingredient?.name).toBe('Arroz');
      expect(result[1].ingredient?.name).toBe('Leche');
      expect(result[2].ingredient?.name).toBe('Tomate');
    });

    it('should join with ingredients table using ORDER BY i.name ASC', async () => {
      await repo.getAll();

      expect(db.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY i.name ASC')
      );
    });

    it('should populate the ingredient field on each entry', async () => {
      db.getAllAsync.mockResolvedValue([
        {
          id: 'entry-1',
          ingredient_id: 'ing-1',
          quantity: 500,
          updated_at: '2024-01-01T00:00:00.000Z',
          ingredient_name: 'Harina',
          ingredient_unit: 'gramos',
          ingredient_purchase_format_desc: 'paquete de 1kg',
          ingredient_purchase_format_quantity: 1000,
          ingredient_category: 'harinas',
          ingredient_created_at: '2024-01-01T00:00:00.000Z',
          ingredient_updated_at: '2024-01-01T00:00:00.000Z',
        },
      ]);

      const result = await repo.getAll();

      expect(result[0].ingredient).toBeDefined();
      expect(result[0].ingredient!.id).toBe('ing-1');
      expect(result[0].ingredient!.name).toBe('Harina');
      expect(result[0].ingredient!.unit).toBe('gramos');
      expect(result[0].ingredient!.purchaseFormat.description).toBe('paquete de 1kg');
      expect(result[0].ingredient!.purchaseFormat.quantity).toBe(1000);
      expect(result[0].ingredient!.category).toBe('harinas');
    });
  });

  describe('getByIngredientId', () => {
    it('should return null when no pantry entry exists for the ingredient', async () => {
      db.getFirstAsync.mockResolvedValue(null);

      const result = await repo.getByIngredientId('non-existent');

      expect(result).toBeNull();
    });

    it('should return the pantry entry for the given ingredient', async () => {
      db.getFirstAsync.mockResolvedValue({
        id: 'entry-1',
        ingredient_id: 'ing-1',
        quantity: 500,
        updated_at: '2024-06-15T10:30:00.000Z',
        ingredient_name: 'Arroz',
        ingredient_unit: 'gramos',
        ingredient_purchase_format_desc: 'paquete de 1kg',
        ingredient_purchase_format_quantity: 1000,
        ingredient_category: 'cereales',
        ingredient_created_at: '2024-01-01T00:00:00.000Z',
        ingredient_updated_at: '2024-06-15T10:30:00.000Z',
      });

      const result = await repo.getByIngredientId('ing-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('entry-1');
      expect(result!.ingredientId).toBe('ing-1');
      expect(result!.quantity).toBe(500);
      expect(result!.updatedAt).toEqual(new Date('2024-06-15T10:30:00.000Z'));
      expect(result!.ingredient?.name).toBe('Arroz');
    });

    it('should query by ingredient_id', async () => {
      await repo.getByIngredientId('ingredient-abc');

      expect(db.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE pe.ingredient_id = ?'),
        ['ingredient-abc']
      );
    });
  });
});
