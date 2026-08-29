/**
 * Unit tests for Recipe Service
 *
 * Tests validation logic, uniqueness constraints, and the 500 recipe limit.
 * Uses mocked repository to isolate service-layer logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRecipeService } from '../recipe.service';
import type { CreateRecipeInput, UpdateRecipeInput } from '../../models/inputs';

// Mock expo-sqlite module
vi.mock('expo-sqlite', () => ({}));

// Mock the recipe repository
vi.mock('../../repositories/recipe.repository', () => ({
  create: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
  getById: vi.fn(),
  getAll: vi.fn(),
  getByMealType: vi.fn(),
  getCount: vi.fn(),
  search: vi.fn(),
}));

// Mock database utilities
vi.mock('../../database/database', () => ({
  withTransaction: vi.fn(
    async (_db: unknown, callback: (db: unknown) => Promise<unknown>) => {
      return callback(_db);
    }
  ),
  generateId: vi.fn(() => 'test-uuid-123'),
}));

import * as recipeRepository from '../../repositories/recipe.repository';

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
  };
}

function validCreateInput(): CreateRecipeInput {
  return {
    name: 'Tortilla Española',
    mealType: 'comida',
    prepTime: 'elaborado',
    ingredients: [
      { ingredientId: 'ing-1', quantity: 4 },
      { ingredientId: 'ing-2', quantity: 200 },
    ],
  };
}

describe('Recipe Service', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: ReturnType<typeof createRecipeService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = createRecipeService(mockDb as any);

    // Default repository mocks
    vi.mocked(recipeRepository.getCount).mockResolvedValue(0);
    vi.mocked(recipeRepository.getAll).mockResolvedValue([]);
  });

  describe('create', () => {
    it('should create a recipe with valid input', async () => {
      const input = validCreateInput();
      const expectedRecipe = {
        id: 'test-uuid-123',
        name: 'Tortilla Española',
        mealType: 'comida' as const,
        prepTime: 'elaborado' as const,
        ingredients: [
          { ingredientId: 'ing-1', quantity: 4 },
          { ingredientId: 'ing-2', quantity: 200 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(recipeRepository.create).mockResolvedValue(expectedRecipe);

      const result = await service.create(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Tortilla Española');
        expect(result.data.ingredients).toHaveLength(2);
      }
      expect(recipeRepository.create).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ name: 'Tortilla Española' })
      );
    });

    describe('name validation', () => {
      it('should reject empty name', async () => {
        const input = { ...validCreateInput(), name: '' };

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
          if (result.error.type === 'validation') {
            expect(result.error.fields).toContainEqual(
              expect.objectContaining({ field: 'name' })
            );
          }
        }
      });

      it('should reject whitespace-only name', async () => {
        const input = { ...validCreateInput(), name: '   ' };

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
        }
      });

      it('should reject name longer than 100 characters', async () => {
        const input = { ...validCreateInput(), name: 'a'.repeat(101) };

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
          if (result.error.type === 'validation') {
            expect(result.error.fields).toContainEqual(
              expect.objectContaining({ field: 'name' })
            );
          }
        }
      });

      it('should accept name with exactly 100 characters', async () => {
        const input = { ...validCreateInput(), name: 'a'.repeat(100) };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'a'.repeat(100),
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });

      it('should accept name with exactly 1 character', async () => {
        const input = { ...validCreateInput(), name: 'A' };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'A',
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });

      it('should trim the name before creating', async () => {
        const input = { ...validCreateInput(), name: '  Tortilla  ' };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'Tortilla',
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await service.create(input);

        expect(recipeRepository.create).toHaveBeenCalledWith(
          mockDb,
          expect.objectContaining({ name: 'Tortilla' })
        );
      });
    });

    describe('ingredients validation', () => {
      it('should allow empty ingredients array', async () => {
        const input = { ...validCreateInput(), ingredients: [] };
        recipeRepository.getCount.mockResolvedValue(0);
        recipeRepository.getAll.mockResolvedValue([]);
        recipeRepository.create.mockResolvedValue({ id: 'new-id', ...input, createdAt: new Date(), updatedAt: new Date() });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });

      it('should reject ingredient with quantity 0', async () => {
        const input = {
          ...validCreateInput(),
          ingredients: [{ ingredientId: 'ing-1', quantity: 0 }],
        };

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
          if (result.error.type === 'validation') {
            expect(result.error.fields).toContainEqual(
              expect.objectContaining({ field: 'ingredients' })
            );
          }
        }
      });

      it('should reject ingredient with negative quantity', async () => {
        const input = {
          ...validCreateInput(),
          ingredients: [{ ingredientId: 'ing-1', quantity: -5 }],
        };

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
          if (result.error.type === 'validation') {
            expect(result.error.fields).toContainEqual(
              expect.objectContaining({ field: 'ingredients' })
            );
          }
        }
      });

      it('should accept ingredient with quantity greater than 0', async () => {
        const input = {
          ...validCreateInput(),
          ingredients: [{ ingredientId: 'ing-1', quantity: 0.5 }],
        };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'Tortilla Española',
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 0.5 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });
    });

    describe('prepTime validation', () => {
      it('should reject invalid prepTime', async () => {
        const input = { ...validCreateInput(), prepTime: 'invalido' as any };

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
          if (result.error.type === 'validation') {
            expect(result.error.fields).toContainEqual(
              expect.objectContaining({ field: 'prepTime' })
            );
          }
        }
      });

      it('should accept "rapido"', async () => {
        const input = { ...validCreateInput(), prepTime: 'rapido' as const };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'Tortilla Española',
          mealType: 'comida',
          prepTime: 'rapido',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });

      it('should accept "elaborado"', async () => {
        const input = { ...validCreateInput(), prepTime: 'elaborado' as const };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'Tortilla Española',
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });
    });

    describe('mealType validation', () => {
      it('should reject invalid mealType', async () => {
        const input = { ...validCreateInput(), mealType: 'invalido' as any };

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
          if (result.error.type === 'validation') {
            expect(result.error.fields).toContainEqual(
              expect.objectContaining({ field: 'mealType' })
            );
          }
        }
      });

      it('should accept "comida"', async () => {
        const input = { ...validCreateInput(), mealType: 'comida' as const };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'Tortilla Española',
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });

      it('should accept "cena"', async () => {
        const input = { ...validCreateInput(), mealType: 'cena' as const };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'Tortilla Española',
          mealType: 'cena',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });

      it('should accept "ambas"', async () => {
        const input = { ...validCreateInput(), mealType: 'ambas' as const };
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'id',
          name: 'Tortilla Española',
          mealType: 'ambas',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(input);

        expect(result.success).toBe(true);
      });
    });

    describe('multiple validation errors', () => {
      it('should return all validation errors at once', async () => {
        const input = {
          name: '',
          mealType: 'invalido' as any,
          prepTime: 'invalido' as any,
          ingredients: [],
        };

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success && result.error.type === 'validation') {
          expect(result.error.fields.length).toBeGreaterThanOrEqual(3);
          const fieldNames = result.error.fields.map((f) => f.field);
          expect(fieldNames).toContain('name');
          expect(fieldNames).toContain('prepTime');
          expect(fieldNames).toContain('mealType');
        }
      });
    });

    describe('unique name constraint', () => {
      it('should reject duplicate recipe name', async () => {
        vi.mocked(recipeRepository.getAll).mockResolvedValue([
          {
            id: 'existing-id',
            name: 'Tortilla Española',
            mealType: 'comida',
            prepTime: 'elaborado',
            ingredients: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

        const input = validCreateInput();
        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('conflict');
          if (result.error.type === 'conflict') {
            expect(result.error.message).toContain('Tortilla Española');
          }
        }
      });

      it('should allow different names', async () => {
        vi.mocked(recipeRepository.getAll).mockResolvedValue([
          {
            id: 'existing-id',
            name: 'Paella',
            mealType: 'comida',
            prepTime: 'elaborado',
            ingredients: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'new-id',
          name: 'Tortilla Española',
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const input = validCreateInput();
        const result = await service.create(input);

        expect(result.success).toBe(true);
      });
    });

    describe('max 500 recipes constraint', () => {
      it('should reject creation when 500 recipes already exist', async () => {
        vi.mocked(recipeRepository.getCount).mockResolvedValue(500);

        const input = validCreateInput();
        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('constraint');
          if (result.error.type === 'constraint') {
            expect(result.error.message).toContain('500');
            expect(result.error.details).toHaveProperty('currentCount', 500);
            expect(result.error.details).toHaveProperty('maxAllowed', 500);
          }
        }
      });

      it('should allow creation when below 500 recipes', async () => {
        vi.mocked(recipeRepository.getCount).mockResolvedValue(499);
        vi.mocked(recipeRepository.create).mockResolvedValue({
          id: 'new-id',
          name: 'Tortilla Española',
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const input = validCreateInput();
        const result = await service.create(input);

        expect(result.success).toBe(true);
      });
    });
  });

  describe('update', () => {
    const existingRecipe = {
      id: 'recipe-1',
      name: 'Tortilla Española',
      mealType: 'comida' as const,
      prepTime: 'elaborado' as const,
      ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    beforeEach(() => {
      vi.mocked(recipeRepository.getById).mockResolvedValue(existingRecipe);
    });

    it('should update a recipe with valid input', async () => {
      const updateInput: UpdateRecipeInput = { name: 'Tortilla Actualizada' };
      const updatedRecipe = { ...existingRecipe, name: 'Tortilla Actualizada' };
      vi.mocked(recipeRepository.update).mockResolvedValue(updatedRecipe);

      const result = await service.update('recipe-1', updateInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Tortilla Actualizada');
      }
    });

    it('should reject update with empty name', async () => {
      const result = await service.update('recipe-1', { name: '' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields).toContainEqual(
            expect.objectContaining({ field: 'name' })
          );
        }
      }
    });

    it('should reject update with name longer than 100 chars', async () => {
      const result = await service.update('recipe-1', { name: 'a'.repeat(101) });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
      }
    });

    it('should allow update with empty ingredients array', async () => {
      recipeRepository.getById.mockResolvedValue({
        id: 'recipe-1',
        name: 'Existing',
        mealType: 'comida',
        prepTime: 'rapido',
        ingredients: [{ ingredientId: 'ing-1', quantity: 1 }],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      recipeRepository.update.mockResolvedValue({
        id: 'recipe-1',
        name: 'Existing',
        mealType: 'comida',
        prepTime: 'rapido',
        ingredients: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.update('recipe-1', { ingredients: [] });

      expect(result.success).toBe(true);
    });

    it('should reject update with ingredient quantity <= 0', async () => {
      const result = await service.update('recipe-1', {
        ingredients: [{ ingredientId: 'ing-1', quantity: 0 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
      }
    });

    it('should reject update with invalid prepTime', async () => {
      const result = await service.update('recipe-1', { prepTime: 'invalido' as any });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields).toContainEqual(
            expect.objectContaining({ field: 'prepTime' })
          );
        }
      }
    });

    it('should reject update with invalid mealType', async () => {
      const result = await service.update('recipe-1', { mealType: 'invalido' as any });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
      }
    });

    it('should reject update when recipe does not exist', async () => {
      vi.mocked(recipeRepository.getById).mockResolvedValue(null);

      const result = await service.update('nonexistent', { name: 'New' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        if (result.error.type === 'validation') {
          expect(result.error.fields).toContainEqual(
            expect.objectContaining({ field: 'id' })
          );
        }
      }
    });

    it('should reject update with duplicate name', async () => {
      vi.mocked(recipeRepository.getAll).mockResolvedValue([
        existingRecipe,
        {
          id: 'recipe-2',
          name: 'Paella',
          mealType: 'comida',
          prepTime: 'elaborado',
          ingredients: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.update('recipe-1', { name: 'Paella' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('conflict');
      }
    });

    it('should allow updating the same recipe with its current name', async () => {
      vi.mocked(recipeRepository.getAll).mockResolvedValue([existingRecipe]);
      vi.mocked(recipeRepository.update).mockResolvedValue(existingRecipe);

      const result = await service.update('recipe-1', { name: 'Tortilla Española' });

      expect(result.success).toBe(true);
    });

    it('should allow updating fields that are not name without uniqueness check failing', async () => {
      vi.mocked(recipeRepository.update).mockResolvedValue({
        ...existingRecipe,
        prepTime: 'rapido',
      });

      const result = await service.update('recipe-1', { prepTime: 'rapido' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prepTime).toBe('rapido');
      }
    });
  });

  describe('delete', () => {
    it('should delete a recipe successfully', async () => {
      vi.mocked(recipeRepository.deleteById).mockResolvedValue(true);

      const result = await service.delete('recipe-1');

      expect(result.success).toBe(true);
      expect(recipeRepository.deleteById).toHaveBeenCalledWith(mockDb, 'recipe-1');
    });

    it('should return error when recipe does not exist', async () => {
      vi.mocked(recipeRepository.deleteById).mockResolvedValue(false);

      const result = await service.delete('nonexistent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
      }
    });
  });

  describe('getById', () => {
    it('should return a recipe when found', async () => {
      const recipe = {
        id: 'recipe-1',
        name: 'Tortilla',
        mealType: 'comida' as const,
        prepTime: 'elaborado' as const,
        ingredients: [{ ingredientId: 'ing-1', quantity: 4 }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      const result = await service.getById('recipe-1');

      expect(result).toEqual(recipe);
    });

    it('should return null when not found', async () => {
      vi.mocked(recipeRepository.getById).mockResolvedValue(null);

      const result = await service.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should delegate to repository', async () => {
      const recipes = [
        {
          id: 'r-1',
          name: 'A Recipe',
          mealType: 'comida' as const,
          prepTime: 'rapido' as const,
          ingredients: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(recipeRepository.getAll).mockResolvedValue(recipes);

      const result = await service.getAll();

      expect(result).toEqual(recipes);
    });
  });

  describe('getByMealType', () => {
    it('should delegate to repository', async () => {
      const recipes = [
        {
          id: 'r-1',
          name: 'Cena Recipe',
          mealType: 'cena' as const,
          prepTime: 'rapido' as const,
          ingredients: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(recipeRepository.getByMealType).mockResolvedValue(recipes);

      const result = await service.getByMealType('cena');

      expect(result).toEqual(recipes);
      expect(recipeRepository.getByMealType).toHaveBeenCalledWith(mockDb, 'cena');
    });
  });

  describe('getCount', () => {
    it('should delegate to repository', async () => {
      vi.mocked(recipeRepository.getCount).mockResolvedValue(42);

      const result = await service.getCount();

      expect(result).toBe(42);
    });
  });

  describe('search', () => {
    it('should delegate to repository', async () => {
      const recipes = [
        {
          id: 'r-1',
          name: 'Tortilla',
          mealType: 'comida' as const,
          prepTime: 'elaborado' as const,
          ingredients: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(recipeRepository.search).mockResolvedValue(recipes);

      const result = await service.search('tort');

      expect(result).toEqual(recipes);
      expect(recipeRepository.search).toHaveBeenCalledWith(mockDb, 'tort');
    });
  });
});
