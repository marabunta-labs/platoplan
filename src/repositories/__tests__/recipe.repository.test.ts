import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as recipeRepo from '../recipe.repository';

// Mock expo-sqlite module
vi.mock('expo-sqlite', () => ({}));

// Mock database utilities
vi.mock('../../database/database', () => ({
  withTransaction: vi.fn(
    async (_db: unknown, callback: (db: unknown) => Promise<unknown>) => {
      return callback(_db);
    }
  ),
  generateId: vi.fn(() => 'test-uuid-123'),
}));

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Recipe Repository', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  describe('create', () => {
    it('should insert a recipe and its ingredients', async () => {
      const input = {
        name: 'Tortilla Española',
        mealType: 'comida' as const,
        prepTime: 'elaborado' as const,
        ingredients: [
          { ingredientId: 'ing-1', quantity: 4 },
          { ingredientId: 'ing-2', quantity: 200 },
        ],
      };

      const result = await recipeRepo.create(mockDb as any, input);

      expect(result.id).toBe('test-uuid-123');
      expect(result.name).toBe('Tortilla Española');
      expect(result.mealType).toBe('comida');
      expect(result.prepTime).toBe('elaborado');
      expect(result.ingredients).toHaveLength(2);
      expect(result.ingredients[0]).toEqual({
        ingredientId: 'ing-1',
        quantity: 4,
      });
      expect(result.ingredients[1]).toEqual({
        ingredientId: 'ing-2',
        quantity: 200,
      });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should call INSERT for recipe and each ingredient', async () => {
      const input = {
        name: 'Ensalada',
        mealType: 'ambas' as const,
        prepTime: 'rapido' as const,
        ingredients: [{ ingredientId: 'ing-1', quantity: 100 }],
      };

      await recipeRepo.create(mockDb as any, input);

      // Recipe INSERT
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO recipes'),
        expect.arrayContaining(['test-uuid-123', 'Ensalada', 'ambas', 'rapido'])
      );

      // Ingredient INSERT
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO recipe_ingredients'),
        expect.arrayContaining(['test-uuid-123', 'ing-1', 100])
      );
    });
  });

  describe('update', () => {
    it('should update recipe fields and return the updated recipe', async () => {
      const updatedRow = {
        id: 'recipe-1',
        name: 'Tortilla Updated',
        meal_type: 'cena',
        prep_time: 'rapido',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-06-01T00:00:00.000Z',
      };

      mockDb.getFirstAsync.mockResolvedValue(updatedRow);
      mockDb.getAllAsync.mockResolvedValue([
        { ingredient_id: 'ing-1', quantity: 3 },
      ]);

      const result = await recipeRepo.update(mockDb as any, 'recipe-1', {
        name: 'Tortilla Updated',
        mealType: 'cena',
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Tortilla Updated');
      expect(result!.mealType).toBe('cena');
      expect(result!.ingredients).toHaveLength(1);
    });

    it('should replace ingredients when provided', async () => {
      const updatedRow = {
        id: 'recipe-1',
        name: 'Tortilla',
        meal_type: 'comida',
        prep_time: 'elaborado',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-06-01T00:00:00.000Z',
      };

      mockDb.getFirstAsync.mockResolvedValue(updatedRow);
      mockDb.getAllAsync.mockResolvedValue([
        { ingredient_id: 'ing-new', quantity: 5 },
      ]);

      await recipeRepo.update(mockDb as any, 'recipe-1', {
        ingredients: [{ ingredientId: 'ing-new', quantity: 5 }],
      });

      // Should delete old ingredients
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM recipe_ingredients'),
        ['recipe-1']
      );

      // Should insert new ingredients
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO recipe_ingredients'),
        expect.arrayContaining(['recipe-1', 'ing-new', 5])
      );
    });

    it('should return null if recipe does not exist', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await recipeRepo.update(mockDb as any, 'nonexistent', {
        name: 'New Name',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteById', () => {
    it('should delete the recipe and return true when found', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const result = await recipeRepo.deleteById(mockDb as any, 'recipe-1');

      expect(result).toBe(true);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM recipes WHERE id = ?'),
        ['recipe-1']
      );
    });

    it('should return false when recipe not found', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 0 });

      const result = await recipeRepo.deleteById(mockDb as any, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getById', () => {
    it('should return the recipe with ingredients when found', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: 'recipe-1',
        name: 'Paella',
        meal_type: 'comida',
        prep_time: 'elaborado',
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-01T10:00:00.000Z',
      });
      mockDb.getAllAsync.mockResolvedValue([
        { ingredient_id: 'ing-1', quantity: 300 },
        { ingredient_id: 'ing-2', quantity: 150 },
      ]);

      const result = await recipeRepo.getById(mockDb as any, 'recipe-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('recipe-1');
      expect(result!.name).toBe('Paella');
      expect(result!.mealType).toBe('comida');
      expect(result!.prepTime).toBe('elaborado');
      expect(result!.ingredients).toHaveLength(2);
      expect(result!.createdAt).toBeInstanceOf(Date);
    });

    it('should return null when not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await recipeRepo.getById(mockDb as any, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return all recipes sorted alphabetically with ingredients', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          {
            id: 'r-1',
            name: 'Arroz con pollo',
            meal_type: 'comida',
            prep_time: 'elaborado',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'r-2',
            name: 'Bocadillo',
            meal_type: 'ambas',
            prep_time: 'rapido',
            created_at: '2024-01-02T00:00:00.000Z',
            updated_at: '2024-01-02T00:00:00.000Z',
          },
        ])
        // fetchIngredientsForRecipes call
        .mockResolvedValueOnce([
          { recipe_id: 'r-1', ingredient_id: 'ing-1', quantity: 200 },
          { recipe_id: 'r-2', ingredient_id: 'ing-2', quantity: 1 },
        ]);

      const result = await recipeRepo.getAll(mockDb as any);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Arroz con pollo');
      expect(result[1].name).toBe('Bocadillo');
      expect(result[0].ingredients).toHaveLength(1);
      expect(result[1].ingredients).toHaveLength(1);

      // Verify ORDER BY clause
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY name ASC')
      );
    });

    it('should return an empty array when no recipes exist', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await recipeRepo.getAll(mockDb as any);

      expect(result).toEqual([]);
    });
  });

  describe('getByMealType', () => {
    it('should return recipes matching the meal type plus "ambas"', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          {
            id: 'r-1',
            name: 'Sopa',
            meal_type: 'cena',
            prep_time: 'rapido',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([
          { recipe_id: 'r-1', ingredient_id: 'ing-1', quantity: 500 },
        ]);

      const result = await recipeRepo.getByMealType(mockDb as any, 'cena');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Sopa');

      // Verify the SQL includes both the specific type and 'ambas'
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("meal_type = ? OR meal_type = 'ambas'"),
        ['cena']
      );
    });

    it('should return empty array when no matching recipes', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await recipeRepo.getByMealType(mockDb as any, 'comida');

      expect(result).toEqual([]);
    });
  });

  describe('getCount', () => {
    it('should return the total number of recipes', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 42 });

      const result = await recipeRepo.getCount(mockDb as any);

      expect(result).toBe(42);
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)')
      );
    });

    it('should return 0 when no recipes exist', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 0 });

      const result = await recipeRepo.getCount(mockDb as any);

      expect(result).toBe(0);
    });
  });

  describe('search', () => {
    it('should find recipes by partial name match', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          {
            id: 'r-1',
            name: 'Tortilla de patatas',
            meal_type: 'comida',
            prep_time: 'elaborado',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([
          { recipe_id: 'r-1', ingredient_id: 'ing-1', quantity: 4 },
        ]);

      const result = await recipeRepo.search(mockDb as any, 'tortilla');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Tortilla de patatas');

      // Verify LIKE pattern
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('LIKE ?'),
        ['%tortilla%']
      );
    });

    it('should return empty array when no matches', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await recipeRepo.search(mockDb as any, 'xyz');

      expect(result).toEqual([]);
    });

    it('should sort results alphabetically', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await recipeRepo.search(mockDb as any, 'test');

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY name ASC'),
        expect.anything()
      );
    });
  });
});
