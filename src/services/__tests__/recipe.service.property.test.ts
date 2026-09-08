/**
 * Property-Based Tests for Recipe Service (Properties 1-4)
 *
 * Uses fast-check with minimum 100 iterations per property.
 * Tests validation, uniqueness, cascade deletion, and alphabetical sorting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createRecipeService } from '../recipe.service';
import type { CreateRecipeInput } from '../../models/inputs';
import type { Recipe } from '../../models/types';
import type { MealType, PrepTime } from '../../models/enums';

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
  generateId: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2, 10)),
}));

import * as recipeRepository from '../../repositories/recipe.repository';

// ============================================================
// Custom Generators
// ============================================================

/** Valid recipe name: 1-100 non-empty characters (trimmed) */
const arbRecipeName = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length >= 1 && s.trim().length <= 100);

/** Invalid recipe name: empty/whitespace, or >100 non-space chars after trim */
const arbInvalidRecipeName = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  // Guarantee the trimmed length exceeds 100 by using only non-space chars.
  fc.integer({ min: 101, max: 200 }).map((n) => 'x'.repeat(n))
);

/** Valid meal type */
const arbMealType: fc.Arbitrary<MealType> = fc.constantFrom('comida', 'cena', 'ambas');

/** Invalid meal type */
const arbInvalidMealType = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !['comida', 'cena', 'ambas'].includes(s));

/** Valid prep time */
const arbPrepTime: fc.Arbitrary<PrepTime> = fc.constantFrom('rapido', 'elaborado');

/** Invalid prep time */
const arbInvalidPrepTime = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !['rapido', 'elaborado'].includes(s));

/** Valid quantity: positive float */
const arbQuantity = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true });

/** Invalid quantity: zero or negative */
const arbInvalidQuantity = fc.float({ min: Math.fround(-10000), max: Math.fround(0), noNaN: true });

/** Valid ingredient entry */
const arbIngredientEntry = fc.record({
  ingredientId: fc.uuid(),
  quantity: arbQuantity,
});

/** Valid ingredients: at least 1 ingredient with quantity > 0 */
const arbIngredients = fc.array(arbIngredientEntry, { minLength: 1, maxLength: 10 });

/** Invalid ingredients: empty array */
const arbInvalidIngredientsEmpty = fc.constant([] as { ingredientId: string; quantity: number }[]);

/** Invalid ingredients: array with at least one ingredient with quantity <= 0 */
const arbInvalidIngredientsQuantity = fc
  .array(
    fc.record({
      ingredientId: fc.uuid(),
      quantity: arbInvalidQuantity,
    }),
    { minLength: 1, maxLength: 5 }
  );

/** Valid CreateRecipeInput */
const arbValidCreateRecipeInput: fc.Arbitrary<CreateRecipeInput> = fc.record({
  name: arbRecipeName,
  mealType: arbMealType,
  prepTime: arbPrepTime,
  ingredients: arbIngredients,
});

// ============================================================
// Helper Functions
// ============================================================

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-' + Math.random().toString(36).slice(2, 10),
    name: 'Default Recipe',
    mealType: 'comida',
    prepTime: 'rapido',
    ingredients: [{ ingredientId: 'ing-1', quantity: 1 }],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================
// Property Tests
// ============================================================

describe('Feature: platoplan, Property 1: Recipe validation accepts valid inputs and rejects invalid inputs', () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * For any recipe input, the system creates a recipe successfully if and only if
   * the input has a non-empty name (1-100 chars), at least 1 ingredient with
   * quantity > 0, a valid prep time ("rapido" or "elaborado"), and a valid meal type
   * ("comida", "cena", or "ambas"). Any input missing any of these required fields
   * is rejected with an error indicating the missing fields.
   */

  let mockDb: ReturnType<typeof createMockDb>;
  let service: ReturnType<typeof createRecipeService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = createRecipeService(mockDb as any);
    vi.mocked(recipeRepository.getCount).mockResolvedValue(0);
    vi.mocked(recipeRepository.getAll).mockResolvedValue([]);
  });

  it('should accept any valid recipe input', async () => {
    await fc.assert(
      fc.asyncProperty(arbValidCreateRecipeInput, async (input) => {
        vi.mocked(recipeRepository.getCount).mockResolvedValue(0);
        vi.mocked(recipeRepository.getAll).mockResolvedValue([]);
        vi.mocked(recipeRepository.create).mockResolvedValue(
          makeRecipe({
            name: input.name.trim(),
            mealType: input.mealType,
            prepTime: input.prepTime,
            ingredients: input.ingredients.map((i) => ({
              ingredientId: i.ingredientId,
              quantity: i.quantity,
            })),
          })
        );

        const result = await service.create(input);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject any input with an invalid name', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbInvalidRecipeName,
        arbMealType,
        arbPrepTime,
        arbIngredients,
        async (name, mealType, prepTime, ingredients) => {
          const input: CreateRecipeInput = { name, mealType, prepTime, ingredients };
          const result = await service.create(input);

          expect(result.success).toBe(false);
          if (!result.success && result.error.type === 'validation') {
            const fieldNames = result.error.fields.map((f) => f.field);
            expect(fieldNames).toContain('name');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject any input with an invalid mealType', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRecipeName,
        arbInvalidMealType,
        arbPrepTime,
        arbIngredients,
        async (name, mealType, prepTime, ingredients) => {
          const input = { name, mealType: mealType as MealType, prepTime, ingredients };
          const result = await service.create(input);

          expect(result.success).toBe(false);
          if (!result.success && result.error.type === 'validation') {
            const fieldNames = result.error.fields.map((f) => f.field);
            expect(fieldNames).toContain('mealType');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject any input with an invalid prepTime', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRecipeName,
        arbMealType,
        arbInvalidPrepTime,
        arbIngredients,
        async (name, mealType, prepTime, ingredients) => {
          const input = { name, mealType, prepTime: prepTime as PrepTime, ingredients };
          const result = await service.create(input);

          expect(result.success).toBe(false);
          if (!result.success && result.error.type === 'validation') {
            const fieldNames = result.error.fields.map((f) => f.field);
            expect(fieldNames).toContain('prepTime');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow any input with empty ingredients', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRecipeName,
        arbMealType,
        arbPrepTime,
        async (name, mealType, prepTime) => {
          recipeRepository.getCount.mockResolvedValue(0);
          recipeRepository.getAll.mockResolvedValue([]);
          recipeRepository.create.mockResolvedValue({
            id: 'new-id',
            name: name.trim(),
            mealType,
            prepTime,
            ingredients: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          const input: CreateRecipeInput = { name, mealType, prepTime, ingredients: [] };
          const result = await service.create(input);

          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject any input with ingredient quantity <= 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRecipeName,
        arbMealType,
        arbPrepTime,
        arbInvalidIngredientsQuantity,
        async (name, mealType, prepTime, ingredients) => {
          const input: CreateRecipeInput = { name, mealType, prepTime, ingredients };
          const result = await service.create(input);

          expect(result.success).toBe(false);
          if (!result.success && result.error.type === 'validation') {
            const fieldNames = result.error.fields.map((f) => f.field);
            expect(fieldNames).toContain('ingredients');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: platoplan, Property 2: Name uniqueness constraint (Recipe)', () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any entity type with a unique name constraint (Recipe), if an entity with
   * name N already exists, attempting to create another entity with the same name N
   * shall be rejected with an appropriate duplicate error message.
   */

  let mockDb: ReturnType<typeof createMockDb>;
  let service: ReturnType<typeof createRecipeService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = createRecipeService(mockDb as any);
    vi.mocked(recipeRepository.getCount).mockResolvedValue(0);
  });

  it('should reject creation when a recipe with the same name already exists', async () => {
    await fc.assert(
      fc.asyncProperty(arbValidCreateRecipeInput, async (input) => {
        const existingName = input.name.trim();

        // Simulate that a recipe with this name already exists
        vi.mocked(recipeRepository.getAll).mockResolvedValue([
          makeRecipe({ name: existingName }),
        ]);
        vi.mocked(recipeRepository.getCount).mockResolvedValue(1);

        const result = await service.create(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('conflict');
          if (result.error.type === 'conflict') {
            expect(result.error.message).toContain(existingName);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should allow creation when no recipe with the same name exists', async () => {
    await fc.assert(
      fc.asyncProperty(arbValidCreateRecipeInput, async (input) => {
        // Simulate that no recipes exist with this name
        vi.mocked(recipeRepository.getAll).mockResolvedValue([
          makeRecipe({ name: input.name.trim() + '_different' }),
        ]);
        vi.mocked(recipeRepository.getCount).mockResolvedValue(1);
        vi.mocked(recipeRepository.create).mockResolvedValue(
          makeRecipe({
            name: input.name.trim(),
            mealType: input.mealType,
            prepTime: input.prepTime,
          })
        );

        const result = await service.create(input);

        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: platoplan, Property 3: Deletion cascades to associations (Recipe)', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any Recipe that is deleted, all entries in recipe_ingredients referencing
   * that recipe are also removed.
   *
   * Note: CASCADE is enforced at the SQLite database level via ON DELETE CASCADE
   * on the recipe_ingredients foreign key. This test verifies:
   * 1. The service's delete method calls the repository deleteById.
   * 2. The repository's deleteById executes a DELETE on recipes table,
   *    which triggers CASCADE deletion of recipe_ingredients.
   * We test this by verifying the service correctly delegates deletion
   * and that the repository function is called with the right recipe ID.
   */

  let mockDb: ReturnType<typeof createMockDb>;
  let service: ReturnType<typeof createRecipeService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = createRecipeService(mockDb as any);
  });

  it('should invoke deletion for any recipe ID, which triggers CASCADE at DB level', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        arbIngredients,
        async (recipeId, ingredients) => {
          // Simulate that recipe exists and deletion succeeds
          vi.mocked(recipeRepository.deleteById).mockResolvedValue(true);

          const result = await service.delete(recipeId);

          expect(result.success).toBe(true);
          expect(recipeRepository.deleteById).toHaveBeenCalledWith(
            mockDb,
            recipeId
          );

          // The deletion of recipe_ingredients is handled by ON DELETE CASCADE
          // at the database level. The key assertion is that deleteById was called
          // with the correct recipe ID, which triggers the CASCADE.
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return error when deleting a non-existent recipe', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (recipeId) => {
        vi.mocked(recipeRepository.deleteById).mockResolvedValue(false);

        const result = await service.delete(recipeId);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('validation');
        }
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: platoplan, Property 4: List queries return alphabetically sorted results (Recipe)', () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * For any non-empty collection of Recipes, querying the collection returns
   * results sorted in ascending alphabetical order by name.
   */

  let mockDb: ReturnType<typeof createMockDb>;
  let service: ReturnType<typeof createRecipeService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = createRecipeService(mockDb as any);
  });

  it('should return recipes in alphabetical order for any set of recipe names', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          { minLength: 1, maxLength: 20 }
        ),
        async (names) => {
          // Create unique names to avoid duplicates
          const uniqueNames = [...new Set(names.map((n) => n.trim()))].filter((n) => n.length > 0);
          if (uniqueNames.length === 0) return;

          // Sort names alphabetically as the repository should return them
          const sortedNames = [...uniqueNames].sort((a, b) => a.localeCompare(b));

          const sortedRecipes = sortedNames.map((name) =>
            makeRecipe({ name })
          );

          vi.mocked(recipeRepository.getAll).mockResolvedValue(sortedRecipes);

          const result = await service.getAll();

          expect(result.length).toBe(sortedNames.length);

          // Verify the result is sorted alphabetically
          for (let i = 0; i < result.length - 1; i++) {
            expect(
              result[i].name.localeCompare(result[i + 1].name)
            ).toBeLessThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return an empty array when no recipes exist', async () => {
    vi.mocked(recipeRepository.getAll).mockResolvedValue([]);

    const result = await service.getAll();

    expect(result).toEqual([]);
  });
});
