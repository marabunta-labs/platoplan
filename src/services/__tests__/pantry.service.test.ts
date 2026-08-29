/**
 * Unit tests for PantryService
 * Tests validation, upsert semantics, and preparable recipe classification.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PantryService } from '../pantry.service';
import type { PantryEntry, Recipe } from '../../models/types';
import type { ValidationError } from '../../models/errors';

// Mock the recipe repository
vi.mock('../../repositories/recipe.repository', () => ({
  getAll: vi.fn(),
}));

// Mock the PantryRepository
const mockPantryRepo = {
  addOrUpdate: vi.fn(),
  remove: vi.fn(),
  getAll: vi.fn(),
  getByIngredientId: vi.fn(),
};

vi.mock('../../repositories/pantry.repository', () => {
  return {
    PantryRepository: class {
      addOrUpdate = mockPantryRepo.addOrUpdate;
      remove = mockPantryRepo.remove;
      getAll = mockPantryRepo.getAll;
      getByIngredientId = mockPantryRepo.getByIngredientId;
    },
  };
});

import * as recipeRepository from '../../repositories/recipe.repository';

describe('PantryService', () => {
  let service: PantryService;
  const mockDb = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PantryService(mockDb);
  });

  describe('addOrUpdate', () => {
    it('should validate that ingredientId is provided', async () => {
      const entry: PantryEntry = {
        id: 'test-id',
        ingredientId: '',
        quantity: 5,
        updatedAt: new Date(),
      };

      try {
        await service.addOrUpdate(entry);
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.type).toBe('validation');
        expect(validationError.fields).toContainEqual({
          field: 'ingredientId',
          message: 'El ingrediente es obligatorio',
        });
      }
    });

    it('should validate that quantity is greater than 0', async () => {
      const entry: PantryEntry = {
        id: 'test-id',
        ingredientId: 'ing-1',
        quantity: 0,
        updatedAt: new Date(),
      };

      try {
        await service.addOrUpdate(entry);
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.type).toBe('validation');
        expect(validationError.fields).toContainEqual({
          field: 'quantity',
          message: 'La cantidad debe ser mayor que 0',
        });
      }
    });

    it('should reject negative quantities', async () => {
      const entry: PantryEntry = {
        id: 'test-id',
        ingredientId: 'ing-1',
        quantity: -5,
        updatedAt: new Date(),
      };

      try {
        await service.addOrUpdate(entry);
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.type).toBe('validation');
        expect(validationError.fields.some((f) => f.field === 'quantity')).toBe(true);
      }
    });

    it('should report multiple validation errors at once', async () => {
      const entry: PantryEntry = {
        id: 'test-id',
        ingredientId: '',
        quantity: 0,
        updatedAt: new Date(),
      };

      try {
        await service.addOrUpdate(entry);
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.type).toBe('validation');
        expect(validationError.fields).toHaveLength(2);
      }
    });

    it('should call repository addOrUpdate with valid entry', async () => {
      const entry: PantryEntry = {
        id: 'test-id',
        ingredientId: 'ing-1',
        quantity: 5,
        updatedAt: new Date(),
      };

      const expectedResult: PantryEntry = {
        id: 'new-id',
        ingredientId: 'ing-1',
        quantity: 5,
        updatedAt: new Date(),
      };

      mockPantryRepo.addOrUpdate.mockResolvedValue(expectedResult);

      const result = await service.addOrUpdate(entry);

      expect(mockPantryRepo.addOrUpdate).toHaveBeenCalledWith('ing-1', 5);
      expect(result).toEqual(expectedResult);
    });

    it('should implement upsert semantics (update existing, not duplicate)', async () => {
      const entry: PantryEntry = {
        id: 'existing-id',
        ingredientId: 'ing-1',
        quantity: 10,
        updatedAt: new Date(),
      };

      const updatedEntry: PantryEntry = {
        id: 'existing-id',
        ingredientId: 'ing-1',
        quantity: 10,
        updatedAt: new Date(),
      };

      mockPantryRepo.addOrUpdate.mockResolvedValue(updatedEntry);

      const result = await service.addOrUpdate(entry);

      expect(mockPantryRepo.addOrUpdate).toHaveBeenCalledWith('ing-1', 10);
      expect(result.quantity).toBe(10);
    });
  });

  describe('remove', () => {
    it('should call repository remove', async () => {
      mockPantryRepo.remove.mockResolvedValue(undefined);

      await service.remove('ing-1');

      expect(mockPantryRepo.remove).toHaveBeenCalledWith('ing-1');
    });
  });

  describe('getAll', () => {
    it('should return all pantry entries from repository', async () => {
      const entries: PantryEntry[] = [
        { id: '1', ingredientId: 'ing-a', quantity: 5, updatedAt: new Date() },
        { id: '2', ingredientId: 'ing-b', quantity: 10, updatedAt: new Date() },
      ];

      mockPantryRepo.getAll.mockResolvedValue(entries);

      const result = await service.getAll();

      expect(result).toEqual(entries);
      expect(mockPantryRepo.getAll).toHaveBeenCalled();
    });
  });

  describe('getAvailableQuantity', () => {
    it('should return quantity when ingredient exists in pantry', async () => {
      const entry: PantryEntry = {
        id: '1',
        ingredientId: 'ing-1',
        quantity: 15,
        updatedAt: new Date(),
      };

      mockPantryRepo.getByIngredientId.mockResolvedValue(entry);

      const result = await service.getAvailableQuantity('ing-1');

      expect(result).toBe(15);
    });

    it('should return 0 when ingredient is not in pantry', async () => {
      mockPantryRepo.getByIngredientId.mockResolvedValue(null);

      const result = await service.getAvailableQuantity('ing-missing');

      expect(result).toBe(0);
    });
  });

  describe('getPreparableRecipes', () => {
    const makeRecipe = (
      id: string,
      name: string,
      ingredients: { ingredientId: string; quantity: number }[]
    ): Recipe => ({
      id,
      name,
      mealType: 'comida',
      prepTime: 'rapido',
      ingredients: ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        quantity: i.quantity,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('should classify recipe as fully preparable when all ingredients available', async () => {
      const recipe = makeRecipe('r1', 'Pasta', [
        { ingredientId: 'ing-1', quantity: 200 },
        { ingredientId: 'ing-2', quantity: 100 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      mockPantryRepo.getAll.mockResolvedValue([
        { id: 'p1', ingredientId: 'ing-1', quantity: 200, updatedAt: new Date() },
        { id: 'p2', ingredientId: 'ing-2', quantity: 150, updatedAt: new Date() },
      ]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(1);
      expect(result.full[0].id).toBe('r1');
      expect(result.partial).toHaveLength(0);
    });

    it('should classify recipe as partially preparable (>=50% but not all)', async () => {
      const recipe = makeRecipe('r1', 'Ensalada', [
        { ingredientId: 'ing-1', quantity: 100 },
        { ingredientId: 'ing-2', quantity: 50 },
        { ingredientId: 'ing-3', quantity: 200 },
        { ingredientId: 'ing-4', quantity: 30 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      // 2 out of 4 ingredients available (50% threshold met)
      mockPantryRepo.getAll.mockResolvedValue([
        { id: 'p1', ingredientId: 'ing-1', quantity: 100, updatedAt: new Date() },
        { id: 'p2', ingredientId: 'ing-2', quantity: 50, updatedAt: new Date() },
      ]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(0);
      expect(result.partial).toHaveLength(1);
      expect(result.partial[0].id).toBe('r1');
    });

    it('should exclude recipe when less than 50% of ingredients available', async () => {
      const recipe = makeRecipe('r1', 'Paella', [
        { ingredientId: 'ing-1', quantity: 100 },
        { ingredientId: 'ing-2', quantity: 200 },
        { ingredientId: 'ing-3', quantity: 300 },
        { ingredientId: 'ing-4', quantity: 400 },
        { ingredientId: 'ing-5', quantity: 500 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      // Only 1 out of 5 available (20%, below 50% threshold)
      mockPantryRepo.getAll.mockResolvedValue([
        { id: 'p1', ingredientId: 'ing-1', quantity: 100, updatedAt: new Date() },
      ]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(0);
      expect(result.partial).toHaveLength(0);
    });

    it('should use Math.floor for the 50% threshold', async () => {
      // 3 ingredients: Math.floor(3 * 0.5) = 1
      // So with 1 ingredient available, recipe should be partial
      const recipe = makeRecipe('r1', 'Tostada', [
        { ingredientId: 'ing-1', quantity: 50 },
        { ingredientId: 'ing-2', quantity: 100 },
        { ingredientId: 'ing-3', quantity: 150 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      mockPantryRepo.getAll.mockResolvedValue([
        { id: 'p1', ingredientId: 'ing-1', quantity: 50, updatedAt: new Date() },
      ]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(0);
      expect(result.partial).toHaveLength(1);
      expect(result.partial[0].id).toBe('r1');
    });

    it('should return empty lists when no recipes exist', async () => {
      vi.mocked(recipeRepository.getAll).mockResolvedValue([]);
      mockPantryRepo.getAll.mockResolvedValue([]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(0);
      expect(result.partial).toHaveLength(0);
    });

    it('should return empty lists when pantry is empty', async () => {
      const recipe = makeRecipe('r1', 'Tortilla', [
        { ingredientId: 'ing-1', quantity: 100 },
        { ingredientId: 'ing-2', quantity: 200 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      mockPantryRepo.getAll.mockResolvedValue([]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(0);
      expect(result.partial).toHaveLength(0);
    });

    it('should handle recipes with no ingredients', async () => {
      const recipe = makeRecipe('r1', 'Agua', []);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      mockPantryRepo.getAll.mockResolvedValue([]);

      const result = await service.getPreparableRecipes();

      // Recipes with no ingredients are excluded from classification
      expect(result.full).toHaveLength(0);
      expect(result.partial).toHaveLength(0);
    });

    it('should classify multiple recipes correctly', async () => {
      const fullyPreparable = makeRecipe('r1', 'Arroz', [
        { ingredientId: 'ing-1', quantity: 100 },
      ]);
      const partiallyPreparable = makeRecipe('r2', 'Gazpacho', [
        { ingredientId: 'ing-1', quantity: 50 },
        { ingredientId: 'ing-2', quantity: 200 },
      ]);
      const notPreparable = makeRecipe('r3', 'Fabada', [
        { ingredientId: 'ing-3', quantity: 500 },
        { ingredientId: 'ing-4', quantity: 300 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([
        fullyPreparable,
        partiallyPreparable,
        notPreparable,
      ]);
      mockPantryRepo.getAll.mockResolvedValue([
        { id: 'p1', ingredientId: 'ing-1', quantity: 100, updatedAt: new Date() },
      ]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(1);
      expect(result.full[0].id).toBe('r1');
      expect(result.partial).toHaveLength(1);
      expect(result.partial[0].id).toBe('r2');
    });

    it('should check quantity sufficiency (not just presence)', async () => {
      const recipe = makeRecipe('r1', 'Pan', [
        { ingredientId: 'ing-1', quantity: 500 },
        { ingredientId: 'ing-2', quantity: 200 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      // Both in pantry, but quantities insufficient
      mockPantryRepo.getAll.mockResolvedValue([
        { id: 'p1', ingredientId: 'ing-1', quantity: 100, updatedAt: new Date() },
        { id: 'p2', ingredientId: 'ing-2', quantity: 50, updatedAt: new Date() },
      ]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(0);
      expect(result.partial).toHaveLength(0);
    });

    it('should handle single-ingredient recipe as fully preparable', async () => {
      const recipe = makeRecipe('r1', 'Leche', [
        { ingredientId: 'ing-1', quantity: 250 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      mockPantryRepo.getAll.mockResolvedValue([
        { id: 'p1', ingredientId: 'ing-1', quantity: 1000, updatedAt: new Date() },
      ]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(1);
      expect(result.partial).toHaveLength(0);
    });

    it('should handle single-ingredient recipe as not preparable when insufficient', async () => {
      // 1 ingredient, floor(1*0.5) = 0, so threshold = 0
      // With 0 sufficient ingredients, sufficientCount (0) >= threshold (0) is true
      // but threshold > 0 check prevents it from being partial
      // So it should be excluded entirely
      const recipe = makeRecipe('r1', 'Zumo', [
        { ingredientId: 'ing-1', quantity: 500 },
      ]);

      vi.mocked(recipeRepository.getAll).mockResolvedValue([recipe]);
      mockPantryRepo.getAll.mockResolvedValue([
        { id: 'p1', ingredientId: 'ing-1', quantity: 100, updatedAt: new Date() },
      ]);

      const result = await service.getPreparableRecipes();

      expect(result.full).toHaveLength(0);
      expect(result.partial).toHaveLength(0);
    });
  });
});
