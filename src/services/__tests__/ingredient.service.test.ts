/**
 * PlatoPlan - Ingredient Service Unit Tests
 *
 * Tests validation, CRUD operations, unique name enforcement,
 * and affected-recipe reporting for the IngredientService.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IngredientService } from '../ingredient.service';
import type { ValidationError, ConflictError } from '../../models/errors';
import type { CreateIngredientInput, UpdateIngredientInput } from '../../models/inputs';
import type { Ingredient } from '../../models/types';

// ─── Mock the repository ────────────────────────────────────────────────────

const mockRepository = {
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getById: vi.fn(),
  getAll: vi.fn(),
  search: vi.fn(),
  getRecipesUsingIngredient: vi.fn(),
};

vi.mock('../../repositories/ingredient.repository', () => ({
  IngredientRepository: class {
    constructor() {
      return mockRepository;
    }
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {} as any;
}

function validInput(): CreateIngredientInput {
  return {
    name: 'Tomate',
    unit: 'gramos',
    purchaseFormat: { description: 'Bandeja 6 unidades', quantity: 500 },
    category: 'Verduras',
  };
}

function mockIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-1',
    name: 'Tomate',
    unit: 'gramos',
    purchaseFormat: { description: 'Bandeja 6 unidades', quantity: 500 },
    category: 'Verduras',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('IngredientService', () => {
  let service: IngredientService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository.getAll.mockResolvedValue([]);
    service = new IngredientService(createMockDb());
  });

  // ── CREATE ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a valid ingredient', async () => {
      const input = validInput();
      const expected = mockIngredient();
      mockRepository.create.mockResolvedValue(expected);

      const result = await service.create(input);

      expect(result).toEqual(expected);
      expect(mockRepository.create).toHaveBeenCalledWith(input);
    });

    it('should reject empty name', async () => {
      const input = { ...validInput(), name: '' };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'name' })
        );
      }
    });

    it('should reject whitespace-only name', async () => {
      const input = { ...validInput(), name: '   ' };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'name' })
        );
      }
    });

    it('should reject name longer than 100 characters', async () => {
      const input = { ...validInput(), name: 'A'.repeat(101) };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'name' })
        );
      }
    });

    it('should accept name with exactly 100 characters', async () => {
      const input = { ...validInput(), name: 'A'.repeat(100) };
      mockRepository.create.mockResolvedValue(mockIngredient({ name: input.name }));

      const result = await service.create(input);
      expect(result.name).toBe(input.name);
    });

    it('should reject invalid unit', async () => {
      const input = { ...validInput(), unit: 'litros' as any };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'unit' })
        );
      }
    });

    it('should accept all valid units', async () => {
      for (const unit of ['gramos', 'mililitros', 'unidades'] as const) {
        mockRepository.create.mockResolvedValue(mockIngredient({ unit }));
        const input = { ...validInput(), unit };
        const result = await service.create(input);
        expect(result.unit).toBe(unit);
      }
    });

    it('should reject empty purchaseFormat description', async () => {
      const input = {
        ...validInput(),
        purchaseFormat: { description: '', quantity: 500 },
      };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'purchaseFormat.description' })
        );
      }
    });

    it('should reject purchaseFormat quantity of 0', async () => {
      const input = {
        ...validInput(),
        purchaseFormat: { description: 'Bolsa', quantity: 0 },
      };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'purchaseFormat.quantity' })
        );
      }
    });

    it('should reject negative purchaseFormat quantity', async () => {
      const input = {
        ...validInput(),
        purchaseFormat: { description: 'Bolsa', quantity: -5 },
      };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'purchaseFormat.quantity' })
        );
      }
    });

    it('should collect multiple validation errors at once', async () => {
      const input = {
        name: '',
        unit: 'invalid' as any,
        purchaseFormat: { description: '', quantity: -1 },
        category: undefined as any,
      };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('should throw ConflictError for duplicate name', async () => {
      mockRepository.getAll.mockResolvedValue([mockIngredient({ id: 'existing-1', name: 'Tomate' })]);
      const input = validInput();

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ConflictError;
        expect(err.type).toBe('conflict');
        expect(err.existingId).toBe('existing-1');
      }
    });

    it('should detect duplicate names case-insensitively', async () => {
      mockRepository.getAll.mockResolvedValue([mockIngredient({ id: 'existing-1', name: 'Tomate' })]);
      const input = { ...validInput(), name: 'TOMATE' };

      try {
        await service.create(input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ConflictError;
        expect(err.type).toBe('conflict');
      }
    });
  });

  // ── UPDATE ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update with valid partial input', async () => {
      const updated = mockIngredient({ name: 'Tomate Cherry' });
      mockRepository.update.mockResolvedValue(updated);
      const input: UpdateIngredientInput = { name: 'Tomate Cherry' };

      const result = await service.update('ing-1', input);

      expect(result).toEqual(updated);
      expect(mockRepository.update).toHaveBeenCalledWith('ing-1', input);
    });

    it('should reject invalid name on update', async () => {
      const input: UpdateIngredientInput = { name: '' };

      try {
        await service.update('ing-1', input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'name' })
        );
      }
    });

    it('should reject invalid unit on update', async () => {
      const input: UpdateIngredientInput = { unit: 'litros' as any };

      try {
        await service.update('ing-1', input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields).toContainEqual(
          expect.objectContaining({ field: 'unit' })
        );
      }
    });

    it('should reject invalid purchaseFormat on update', async () => {
      const input: UpdateIngredientInput = {
        purchaseFormat: { description: '', quantity: 0 },
      };

      try {
        await service.update('ing-1', input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ValidationError;
        expect(err.type).toBe('validation');
        expect(err.fields.length).toBe(2);
      }
    });

    it('should throw ConflictError for duplicate name on update', async () => {
      mockRepository.getAll.mockResolvedValue([
        mockIngredient({ id: 'ing-2', name: 'Cebolla' }),
      ]);
      const input: UpdateIngredientInput = { name: 'Cebolla' };

      try {
        await service.update('ing-1', input);
        expect.fail('Should have thrown');
      } catch (e) {
        const err = e as ConflictError;
        expect(err.type).toBe('conflict');
      }
    });

    it('should allow updating to the same name (own ingredient)', async () => {
      mockRepository.getAll.mockResolvedValue([
        mockIngredient({ id: 'ing-1', name: 'Tomate' }),
      ]);
      const updated = mockIngredient({ name: 'Tomate' });
      mockRepository.update.mockResolvedValue(updated);

      const result = await service.update('ing-1', { name: 'Tomate' });
      expect(result.name).toBe('Tomate');
    });

    it('should throw Error when ingredient not found', async () => {
      mockRepository.update.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'Test' })
      ).rejects.toThrow('not found');
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete and return affected recipes', async () => {
      mockRepository.getRecipesUsingIngredient.mockResolvedValue([
        'Pasta Carbonara',
        'Ensalada Caprese',
      ]);
      mockRepository.delete.mockResolvedValue(true);

      const result = await service.delete('ing-1');

      expect(result.affectedRecipes).toEqual([
        'Pasta Carbonara',
        'Ensalada Caprese',
      ]);
      expect(mockRepository.getRecipesUsingIngredient).toHaveBeenCalledWith('ing-1');
      expect(mockRepository.delete).toHaveBeenCalledWith('ing-1');
    });

    it('should return empty affectedRecipes when ingredient is unused', async () => {
      mockRepository.getRecipesUsingIngredient.mockResolvedValue([]);
      mockRepository.delete.mockResolvedValue(true);

      const result = await service.delete('ing-1');

      expect(result.affectedRecipes).toEqual([]);
    });

    it('should throw Error when ingredient not found', async () => {
      mockRepository.getRecipesUsingIngredient.mockResolvedValue([]);
      mockRepository.delete.mockResolvedValue(false);

      await expect(service.delete('nonexistent')).rejects.toThrow('not found');
    });
  });

  // ── GET ALL ───────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return all ingredients from repository', async () => {
      const ingredients = [
        mockIngredient({ id: 'ing-1', name: 'Ajo' }),
        mockIngredient({ id: 'ing-2', name: 'Tomate' }),
      ];
      mockRepository.getAll.mockResolvedValue(ingredients);

      const result = await service.getAll();

      expect(result).toEqual(ingredients);
    });

    it('should return empty array when no ingredients exist', async () => {
      mockRepository.getAll.mockResolvedValue([]);

      const result = await service.getAll();

      expect(result).toEqual([]);
    });
  });

  // ── SEARCH ────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('should delegate partial name search to repository', async () => {
      const results = [mockIngredient({ name: 'Tomate' })];
      mockRepository.search.mockResolvedValue(results);

      const result = await service.search('tom');

      expect(result).toEqual(results);
      expect(mockRepository.search).toHaveBeenCalledWith('tom');
    });

    it('should return empty array for no matches', async () => {
      mockRepository.search.mockResolvedValue([]);

      const result = await service.search('xyz');

      expect(result).toEqual([]);
    });
  });

  // ── GET RECIPES USING ─────────────────────────────────────────────────────

  describe('getRecipesUsing', () => {
    it('should return recipe names using the ingredient', async () => {
      mockRepository.getRecipesUsingIngredient.mockResolvedValue([
        'Tortilla Española',
        'Patatas Bravas',
      ]);

      const result = await service.getRecipesUsing('ing-1');

      expect(result).toEqual(['Tortilla Española', 'Patatas Bravas']);
      expect(mockRepository.getRecipesUsingIngredient).toHaveBeenCalledWith('ing-1');
    });

    it('should return empty array when ingredient is not used', async () => {
      mockRepository.getRecipesUsingIngredient.mockResolvedValue([]);

      const result = await service.getRecipesUsing('ing-1');

      expect(result).toEqual([]);
    });
  });
});
