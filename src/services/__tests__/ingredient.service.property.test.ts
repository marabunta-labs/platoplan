/**
 * PlatoPlan - Ingredient Service Property Tests (Properties 5-6)
 *
 * Feature: platoplan
 *
 * Uses vitest + fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { createRecipeService } from '../recipe.service';
import { IngredientService } from '../ingredient.service';
import type { CreateRecipeInput } from '../../models/inputs';
import type { Ingredient } from '../../models/types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('expo-sqlite', () => ({}));

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

const mockIngredientRepository = {
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
      return mockIngredientRepository;
    }
  },
}));

vi.mock('../../database/database', () => ({
  withTransaction: vi.fn(
    async (_db: unknown, callback: (db: unknown) => Promise<unknown>) => {
      return callback(_db);
    }
  ),
  generateId: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2)),
}));

import * as recipeRepository from '../../repositories/recipe.repository';

// ─── Custom Generators ──────────────────────────────────────────────────────

/** Generates a positive float > 0 (valid quantity) */
const arbPositiveQuantity = fc.double({
  min: 0.01,
  max: 10000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Generates a non-positive float <= 0 (invalid quantity) */
const arbNonPositiveQuantity = fc.oneof(
  fc.constant(0),
  fc.double({
    min: -10000,
    max: 0,
    noNaN: true,
    noDefaultInfinity: true,
  })
);

/** Generates an ingredient name between 1 and 100 characters */
const arbIngredientName = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length > 0
);

/** Generates a non-empty substring of the given name */
function arbSubstring(name: string): fc.Arbitrary<string> {
  if (name.length === 0) {
    return fc.constant(name);
  }
  return fc
    .tuple(
      fc.integer({ min: 0, max: name.length - 1 }),
      fc.integer({ min: 1, max: name.length })
    )
    .filter(([start, end]) => start < end)
    .map(([start, end]) => name.substring(start, end));
}

// ─── Helper functions ───────────────────────────────────────────────────────

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function mockIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-' + Math.random().toString(36).slice(2),
    name: 'TestIngredient',
    unit: 'gramos',
    purchaseFormat: { description: 'pack', quantity: 500 },
    category: 'General',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Ingredient Service - Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIngredientRepository.getAll.mockResolvedValue([]);
  });

  /**
   * Property 5: Ingredient-recipe association requires positive quantity
   *
   * For any attempt to associate an Ingredient with a Recipe, the association
   * is accepted if and only if the quantity is a number strictly greater than zero.
   * Zero or negative quantities are rejected.
   *
   * **Validates: Requirements 2.3**
   */
  describe('Property 5: Ingredient-recipe association requires positive quantity', () => {
    it('should accept recipe creation when all ingredient quantities are strictly > 0', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbPositiveQuantity, { minLength: 1, maxLength: 10 }),
          async (quantities) => {
            vi.clearAllMocks();
            const mockDb = createMockDb();
            const service = createRecipeService(mockDb);

            // Setup mocks for successful creation
            vi.mocked(recipeRepository.getCount).mockResolvedValue(0);
            vi.mocked(recipeRepository.getAll).mockResolvedValue([]);
            vi.mocked(recipeRepository.create).mockResolvedValue({
              id: 'recipe-new',
              name: 'Test Recipe',
              mealType: 'comida',
              prepTime: 'rapido',
              ingredients: quantities.map((qty, i) => ({
                ingredientId: `ing-${i}`,
                quantity: qty,
              })),
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            const input: CreateRecipeInput = {
              name: 'Test Recipe',
              mealType: 'comida',
              prepTime: 'rapido',
              ingredients: quantities.map((qty, i) => ({
                ingredientId: `ing-${i}`,
                quantity: qty,
              })),
            };

            const result = await service.create(input);

            // With all positive quantities, creation should succeed
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject recipe creation when any ingredient has non-positive quantity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbPositiveQuantity, { minLength: 0, maxLength: 5 }),
          arbNonPositiveQuantity,
          fc.array(arbPositiveQuantity, { minLength: 0, maxLength: 5 }),
          async (before, invalidQty, after) => {
            vi.clearAllMocks();
            const mockDb = createMockDb();
            const service = createRecipeService(mockDb);

            // Setup mocks
            vi.mocked(recipeRepository.getCount).mockResolvedValue(0);
            vi.mocked(recipeRepository.getAll).mockResolvedValue([]);

            // Build ingredients array with one invalid quantity inserted
            const allQuantities = [...before, invalidQty, ...after];
            const ingredients = allQuantities.map((qty, i) => ({
              ingredientId: `ing-${i}`,
              quantity: qty,
            }));

            const input: CreateRecipeInput = {
              name: 'Test Recipe',
              mealType: 'comida',
              prepTime: 'rapido',
              ingredients,
            };

            const result = await service.create(input);

            // With any non-positive quantity, creation should be rejected
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error.type).toBe('validation');
              if (result.error.type === 'validation') {
                expect(result.error.fields).toContainEqual(
                  expect.objectContaining({ field: 'ingredients' })
                );
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Ingredient search matches partial names
   *
   * For any Ingredient with name N and any non-empty substring S of N,
   * searching ingredients with query S returns a result set that includes
   * the Ingredient with name N.
   *
   * **Validates: Requirements 2.7**
   */
  describe('Property 6: Ingredient search matches partial names', () => {
    it('should return the ingredient when searching with any non-empty substring of its name', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbIngredientName,
          async (ingredientName) => {
            // Generate a random non-empty substring of the name
            const subResult = fc.sample(arbSubstring(ingredientName), 1);
            if (subResult.length === 0) return; // skip if no valid substring generated
            const searchQuery = subResult[0];

            vi.clearAllMocks();
            const mockDb = createMockDb();
            const service = new IngredientService(mockDb);

            const ingredient = mockIngredient({ name: ingredientName });

            // Mock the repository search to simulate LIKE '%query%' behavior:
            // It returns the ingredient when the name contains the query (case-insensitive)
            mockIngredientRepository.search.mockImplementation(
              async (query: string) => {
                if (
                  ingredientName.toLowerCase().includes(query.toLowerCase())
                ) {
                  return [ingredient];
                }
                return [];
              }
            );

            const results = await service.search(searchQuery);

            // The ingredient must be in the results since searchQuery is a substring of ingredientName
            expect(results.some((r) => r.name === ingredientName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return the ingredient for every possible non-empty substring of its name', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbIngredientName.filter((n) => n.length >= 2),
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: 1, max: 100 }),
          async (ingredientName, rawStart, rawEnd) => {
            // Constrain start and end to produce a valid non-empty substring
            const start = rawStart % ingredientName.length;
            const end = Math.min(
              start + 1 + (rawEnd % (ingredientName.length - start)),
              ingredientName.length
            );
            const searchQuery = ingredientName.substring(start, end);

            if (searchQuery.length === 0) return;

            vi.clearAllMocks();
            const mockDb = createMockDb();
            const service = new IngredientService(mockDb);

            const ingredient = mockIngredient({ name: ingredientName });

            // Mock search to simulate LIKE '%query%' behavior
            mockIngredientRepository.search.mockImplementation(
              async (query: string) => {
                if (
                  ingredientName.toLowerCase().includes(query.toLowerCase())
                ) {
                  return [ingredient];
                }
                return [];
              }
            );

            const results = await service.search(searchQuery);

            // Substring of name should always match
            expect(results.some((r) => r.name === ingredientName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
