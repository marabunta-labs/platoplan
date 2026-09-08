/**
 * Unit tests for IngredientRepository
 *
 * Uses a mock SQLiteDatabase to verify repository logic independently
 * of the actual SQLite engine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IngredientRepository } from '../ingredient.repository';
import type { CreateIngredientInput, UpdateIngredientInput } from '../../models/inputs';

// Mock generateId to produce predictable IDs
vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => 'test-id-123'),
}));

/**
 * Creates a mock SQLiteDatabase with the methods used by IngredientRepository.
 */
function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeIngredientRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'ing-1',
    name: 'Tomate',
    unit: 'gramos',
    purchase_format_desc: 'bolsa de 500g',
    purchase_format_quantity: 500,
    category: 'verduras',
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('IngredientRepository', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: IngredientRepository;

  beforeEach(() => {
    db = createMockDb();
    repo = new IngredientRepository(db);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should insert a new ingredient and return the domain object', async () => {
      const input: CreateIngredientInput = {
        name: 'Tomate',
        unit: 'gramos',
        purchaseFormat: { description: 'bolsa de 500g', quantity: 500 },
        category: 'verduras',
      };

      const result = await repo.create(input);

      expect(db.runAsync).toHaveBeenCalledTimes(1);
      const [sql, ...params] = db.runAsync.mock.calls[0];
      expect(sql).toContain('INSERT INTO ingredients');
      expect(params[0]).toBe('test-id-123'); // id
      expect(params[1]).toBe('Tomate'); // name
      expect(params[2]).toBe('gramos'); // unit
      expect(params[3]).toBe('bolsa de 500g'); // purchase_format_desc
      expect(params[4]).toBe(500); // purchase_format_quantity
      // Categories are stored as a JSON array to support multiple categories.
      expect(params[5]).toBe('["verduras"]'); // category (JSON-serialized)

      expect(result).toMatchObject({
        id: 'test-id-123',
        name: 'Tomate',
        unit: 'gramos',
        purchaseFormat: { description: 'bolsa de 500g', quantity: 500 },
        category: 'verduras',
        categories: ['verduras'],
      });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('update', () => {
    it('should update only provided fields and return updated ingredient', async () => {
      const existingRow = makeIngredientRow();
      db.getFirstAsync
        .mockResolvedValueOnce(existingRow) // first call: check if exists
        .mockResolvedValueOnce({ ...existingRow, name: 'Tomate cherry', updated_at: '2024-01-16T10:00:00.000Z' }); // second call: return updated

      const input: UpdateIngredientInput = { name: 'Tomate cherry' };
      const result = await repo.update('ing-1', input);

      expect(db.runAsync).toHaveBeenCalledTimes(1);
      const [sql, ...params] = db.runAsync.mock.calls[0];
      expect(sql).toContain('UPDATE ingredients SET');
      expect(sql).toContain('name = ?');
      expect(params[0]).toBe('Tomate cherry');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Tomate cherry');
    });

    it('should throw when ingredient does not exist', async () => {
      db.getFirstAsync.mockResolvedValue(null);

      await expect(repo.update('nonexistent', { name: 'New' })).rejects.toThrow(
        "Ingredient with id 'nonexistent' not found"
      );
      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('should return existing ingredient when no fields provided', async () => {
      const existingRow = makeIngredientRow();
      db.getFirstAsync.mockResolvedValue(existingRow);

      const result = await repo.update('ing-1', {});

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Tomate');
      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('should update purchaseFormat fields when provided', async () => {
      const existingRow = makeIngredientRow();
      db.getFirstAsync
        .mockResolvedValueOnce(existingRow)
        .mockResolvedValueOnce({
          ...existingRow,
          purchase_format_desc: 'caja de 1kg',
          purchase_format_quantity: 1000,
        });

      const input: UpdateIngredientInput = {
        purchaseFormat: { description: 'caja de 1kg', quantity: 1000 },
      };
      const result = await repo.update('ing-1', input);

      const [sql] = db.runAsync.mock.calls[0];
      expect(sql).toContain('purchase_format_desc = ?');
      expect(sql).toContain('purchase_format_quantity = ?');
      expect(result!.purchaseFormat).toEqual({ description: 'caja de 1kg', quantity: 1000 });
    });
  });

  describe('delete', () => {
    it('should delete ingredient and return true when found', async () => {
      db.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });

      const result = await repo.delete('ing-1');

      expect(result).toBe(true);
      expect(db.runAsync).toHaveBeenCalledWith(
        'DELETE FROM ingredients WHERE id = ?',
        'ing-1'
      );
    });

    it('should return false when ingredient not found', async () => {
      db.runAsync.mockResolvedValue({ changes: 0, lastInsertRowId: 0 });

      const result = await repo.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getById', () => {
    it('should return mapped ingredient when found', async () => {
      db.getFirstAsync.mockResolvedValue(makeIngredientRow());

      const result = await repo.getById('ing-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ing-1');
      expect(result!.name).toBe('Tomate');
      expect(result!.unit).toBe('gramos');
      expect(result!.purchaseFormat).toEqual({
        description: 'bolsa de 500g',
        quantity: 500,
      });
      expect(result!.category).toBe('verduras');
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
    });

    it('should return null when not found', async () => {
      db.getFirstAsync.mockResolvedValue(null);

      const result = await repo.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return ingredients sorted alphabetically by name', async () => {
      const rows = [
        makeIngredientRow({ id: 'ing-1', name: 'Aceite' }),
        makeIngredientRow({ id: 'ing-2', name: 'Leche' }),
        makeIngredientRow({ id: 'ing-3', name: 'Zanahoria' }),
      ];
      db.getAllAsync.mockResolvedValue(rows);

      const result = await repo.getAll();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Aceite');
      expect(result[1].name).toBe('Leche');
      expect(result[2].name).toBe('Zanahoria');

      // Verify ORDER BY is in the query
      const [sql] = db.getAllAsync.mock.calls[0];
      expect(sql).toContain('ORDER BY name ASC');
    });

    it('should return empty array when no ingredients exist', async () => {
      db.getAllAsync.mockResolvedValue([]);

      const result = await repo.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('search', () => {
    it('should use LIKE with wildcard pattern for partial matching', async () => {
      const rows = [
        makeIngredientRow({ id: 'ing-1', name: 'Tomate' }),
        makeIngredientRow({ id: 'ing-2', name: 'Tomate cherry' }),
      ];
      db.getAllAsync.mockResolvedValue(rows);

      const result = await repo.search('Tomat');

      expect(result).toHaveLength(2);
      const [sql, param] = db.getAllAsync.mock.calls[0];
      expect(sql).toContain('LIKE ?');
      expect(param).toBe('%Tomat%');
    });

    it('should return empty array when no matches', async () => {
      db.getAllAsync.mockResolvedValue([]);

      const result = await repo.search('xyz');

      expect(result).toEqual([]);
      const [, param] = db.getAllAsync.mock.calls[0];
      expect(param).toBe('%xyz%');
    });

    it('should return results sorted alphabetically', async () => {
      const rows = [
        makeIngredientRow({ id: 'ing-1', name: 'Agua' }),
        makeIngredientRow({ id: 'ing-2', name: 'Zumo de naranja' }),
      ];
      db.getAllAsync.mockResolvedValue(rows);

      await repo.search('a');

      const [sql] = db.getAllAsync.mock.calls[0];
      expect(sql).toContain('ORDER BY name ASC');
    });
  });

  describe('getRecipesUsingIngredient', () => {
    it('should return recipe names that use the ingredient', async () => {
      db.getAllAsync.mockResolvedValue([
        { name: 'Gazpacho' },
        { name: 'Pasta con tomate' },
        { name: 'Tortilla' },
      ]);

      const result = await repo.getRecipesUsingIngredient('ing-1');

      expect(result).toEqual(['Gazpacho', 'Pasta con tomate', 'Tortilla']);
      const [sql, param] = db.getAllAsync.mock.calls[0];
      expect(sql).toContain('INNER JOIN recipe_ingredients');
      expect(sql).toContain('ri.ingredient_id = ?');
      expect(param).toBe('ing-1');
    });

    it('should return empty array when no recipes use the ingredient', async () => {
      db.getAllAsync.mockResolvedValue([]);

      const result = await repo.getRecipesUsingIngredient('unused-ing');

      expect(result).toEqual([]);
    });

    it('should sort results alphabetically by recipe name', async () => {
      db.getAllAsync.mockResolvedValue([
        { name: 'Arroz' },
        { name: 'Zarzuela' },
      ]);

      await repo.getRecipesUsingIngredient('ing-1');

      const [sql] = db.getAllAsync.mock.calls[0];
      expect(sql).toContain('ORDER BY r.name ASC');
    });
  });
});
