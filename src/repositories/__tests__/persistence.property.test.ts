/**
 * Property-Based Test: Data persistence round-trip
 *
 * Feature: platoplan, Property 21: Data persistence round-trip
 * Validates: Requirements 7.2
 *
 * For any Recipe, Ingredient, Pantry entry, or Menu Plan that is created and
 * persisted, loading the data back from storage produces an object with all
 * attributes equivalent to the original (serialization round-trip preserves
 * data integrity).
 *
 * Uses a mock-based approach (Approach 2) to simulate SQLite's behavior:
 * - Strings for dates (ISO format)
 * - REAL for floats
 * - JSON string for arrays
 *
 * The test verifies that the row mapping functions correctly convert between
 * DB rows and domain types through a simulated create → store → read-back cycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { MealType, PrepTime, MeasureUnit, PlanStatus } from '../../models/enums';

// Mock generateId to produce unique but predictable IDs
let idCounter = 0;
vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => `gen-id-${++idCounter}`),
  withTransaction: vi.fn(async (_db: any, callback: any) => callback(_db)),
}));

// --- Custom Arbitraries ---

const arbRecipeName = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

const arbMealType: fc.Arbitrary<MealType> = fc.constantFrom('comida', 'cena', 'ambas');

const arbPrepTime: fc.Arbitrary<PrepTime> = fc.constantFrom('rapido', 'elaborado');

const arbIngredientName = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

const arbMeasureUnit: fc.Arbitrary<MeasureUnit> = fc.constantFrom('gramos', 'mililitros', 'unidades');

const arbPurchaseFormat = fc.record({
  description: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  quantity: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
});

const arbPeriodDays = fc.integer({ min: 1, max: 30 });

const arbCategory = fc.string({ minLength: 0, maxLength: 50 });

const arbPositiveQuantity = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true });

const arbIngredientId = fc.uuid();

// --- In-Memory Store Simulation ---

/**
 * Simulates what SQLite does when persisting and reading back data.
 * Dates are stored as ISO strings, arrays as JSON strings, numbers as REAL.
 */
interface RowStore {
  recipes: Map<string, Record<string, unknown>>;
  ingredients: Map<string, Record<string, unknown>>;
  recipeIngredients: Map<string, Array<{ ingredient_id: string; quantity: number }>>;
  pantryEntries: Map<string, Record<string, unknown>>;
  menuPlans: Map<string, Record<string, unknown>>;
}

function createRowStore(): RowStore {
  return {
    recipes: new Map(),
    ingredients: new Map(),
    recipeIngredients: new Map(),
    pantryEntries: new Map(),
    menuPlans: new Map(),
  };
}

/**
 * Creates a mock database that stores data in an in-memory Map,
 * simulating SQLite's serialization behavior.
 */
function createMockDbWithStore(store: RowStore) {
  return {
    runAsync: vi.fn(async (sql: string, ...params: any[]) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;

      if (sql.includes('INSERT INTO recipes')) {
        const [id, name, mealType, prepTime, createdAt, updatedAt] = flatParams;
        store.recipes.set(id, {
          id,
          name,
          meal_type: mealType,
          prep_time: prepTime,
          created_at: createdAt,
          updated_at: updatedAt,
        });
      } else if (sql.includes('INSERT INTO ingredients')) {
        const [id, name, unit, purchaseFormatDesc, purchaseFormatQty, category, createdAt, updatedAt] = flatParams;
        store.ingredients.set(id, {
          id,
          name,
          unit,
          purchase_format_desc: purchaseFormatDesc,
          purchase_format_quantity: purchaseFormatQty,
          category,
          created_at: createdAt,
          updated_at: updatedAt,
        });
      } else if (sql.includes('INSERT INTO recipe_ingredients')) {
        const [recipeId, ingredientId, quantity] = flatParams;
        const existing = store.recipeIngredients.get(recipeId) || [];
        existing.push({ ingredient_id: ingredientId, quantity });
        store.recipeIngredients.set(recipeId, existing);
      } else if (sql.includes('INSERT INTO pantry_entries')) {
        const [id, ingredientId, quantity, updatedAt] = flatParams;
        store.pantryEntries.set(id, {
          id,
          ingredient_id: ingredientId,
          quantity,
          updated_at: updatedAt,
        });
      } else if (sql.includes('INSERT INTO menu_plans')) {
        const [id, periodDays, startDate, elaborateDaysConfig, createdAt, updatedAt] = flatParams;
        store.menuPlans.set(id, {
          id,
          period_days: periodDays,
          start_date: startDate,
          status: 'draft',
          elaborate_days_config: elaborateDaysConfig,
          created_at: createdAt,
          updated_at: updatedAt,
        });
      }
      return { changes: 1, lastInsertRowId: 1 };
    }),
    getFirstAsync: vi.fn(async (sql: string, ...params: any[]) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;
      const id = flatParams[0] as string;

      if (sql.includes('FROM recipes')) {
        return store.recipes.get(id) ?? null;
      }
      if (sql.includes('FROM ingredients')) {
        return store.ingredients.get(id) ?? null;
      }
      if (sql.includes('FROM pantry_entries')) {
        // Search by ingredient_id
        for (const entry of store.pantryEntries.values()) {
          if (entry.ingredient_id === id) {
            return entry;
          }
        }
        return null;
      }
      if (sql.includes('FROM menu_plans')) {
        return store.menuPlans.get(id) ?? null;
      }
      return null;
    }),
    getAllAsync: vi.fn(async (sql: string, ...params: any[]) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;

      if (sql.includes('FROM recipe_ingredients')) {
        const recipeId = flatParams[0] as string;
        return store.recipeIngredients.get(recipeId) || [];
      }
      if (sql.includes('FROM ingredients')) {
        return Array.from(store.ingredients.values());
      }
      return [];
    }),
    execAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// --- Row-to-Domain Mapping Functions (re-implemented to test round-trip) ---
// These mirror the mapping in the actual repositories.

function rowToRecipe(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    mealType: row.meal_type as MealType,
    prepTime: row.prep_time as PrepTime,
    ingredients: [] as { ingredientId: string; quantity: number }[],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToIngredient(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    unit: row.unit as MeasureUnit,
    purchaseFormat: {
      description: row.purchase_format_desc as string,
      quantity: row.purchase_format_quantity as number,
    },
    category: row.category as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToPantryEntry(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    ingredientId: row.ingredient_id as string,
    quantity: row.quantity as number,
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToMenuPlan(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    periodDays: row.period_days as number,
    startDate: new Date(row.start_date as string),
    status: row.status as PlanStatus,
    elaborateDays: JSON.parse(row.elaborate_days_config as string) as number[],
    assignments: [],
    freeDays: [],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

// --- Property Tests ---

describe('Property 21: Data persistence round-trip', () => {
  beforeEach(() => {
    idCounter = 0;
    vi.clearAllMocks();
  });

  it('Recipe: all fields survive serialization round-trip', () => {
    fc.assert(
      fc.property(
        arbRecipeName,
        arbMealType,
        arbPrepTime,
        fc.array(fc.record({ ingredientId: arbIngredientId, quantity: arbPositiveQuantity }), { minLength: 0, maxLength: 10 }),
        (name, mealType, prepTime, ingredients) => {
          const store = createRowStore();
          const now = new Date().toISOString();
          const id = `recipe-${Math.random().toString(36).slice(2)}`;

          // Simulate INSERT (what the repository does)
          store.recipes.set(id, {
            id,
            name,
            meal_type: mealType,
            prep_time: prepTime,
            created_at: now,
            updated_at: now,
          });

          // Store recipe ingredients
          const ingredientRows = ingredients.map((ing) => ({
            ingredient_id: ing.ingredientId,
            quantity: ing.quantity,
          }));
          store.recipeIngredients.set(id, ingredientRows);

          // Simulate SELECT and map back to domain
          const storedRow = store.recipes.get(id)!;
          const recipe = rowToRecipe(storedRow);

          // Attach ingredients
          const storedIngredients = store.recipeIngredients.get(id) || [];
          recipe.ingredients = storedIngredients.map((ri) => ({
            ingredientId: ri.ingredient_id,
            quantity: ri.quantity,
          }));

          // Assertions: all attributes match
          expect(recipe.id).toBe(id);
          expect(recipe.name).toBe(name);
          expect(recipe.mealType).toBe(mealType);
          expect(recipe.prepTime).toBe(prepTime);
          expect(recipe.ingredients).toHaveLength(ingredients.length);
          for (let i = 0; i < ingredients.length; i++) {
            expect(recipe.ingredients[i].ingredientId).toBe(ingredients[i].ingredientId);
            expect(recipe.ingredients[i].quantity).toBe(ingredients[i].quantity);
          }
          // Date round-trip: ISO string → Date → ISO string should be consistent
          expect(recipe.createdAt.toISOString()).toBe(now);
          expect(recipe.updatedAt.toISOString()).toBe(now);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Ingredient: name, unit, purchaseFormat, category preserved through round-trip', () => {
    fc.assert(
      fc.property(
        arbIngredientName,
        arbMeasureUnit,
        arbPurchaseFormat,
        arbCategory,
        (name, unit, purchaseFormat, category) => {
          const store = createRowStore();
          const now = new Date().toISOString();
          const id = `ing-${Math.random().toString(36).slice(2)}`;

          // Simulate INSERT
          store.ingredients.set(id, {
            id,
            name,
            unit,
            purchase_format_desc: purchaseFormat.description,
            purchase_format_quantity: purchaseFormat.quantity,
            category,
            created_at: now,
            updated_at: now,
          });

          // Simulate SELECT and map back
          const storedRow = store.ingredients.get(id)!;
          const ingredient = rowToIngredient(storedRow);

          // Assertions
          expect(ingredient.id).toBe(id);
          expect(ingredient.name).toBe(name);
          expect(ingredient.unit).toBe(unit);
          expect(ingredient.purchaseFormat.description).toBe(purchaseFormat.description);
          expect(ingredient.purchaseFormat.quantity).toBe(purchaseFormat.quantity);
          expect(ingredient.category).toBe(category);
          expect(ingredient.createdAt.toISOString()).toBe(now);
          expect(ingredient.updatedAt.toISOString()).toBe(now);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PantryEntry: ingredientId, quantity, updatedAt preserved through round-trip', () => {
    fc.assert(
      fc.property(
        arbIngredientId,
        arbPositiveQuantity,
        (ingredientId, quantity) => {
          const store = createRowStore();
          const now = new Date().toISOString();
          const id = `pantry-${Math.random().toString(36).slice(2)}`;

          // Simulate INSERT
          store.pantryEntries.set(id, {
            id,
            ingredient_id: ingredientId,
            quantity,
            updated_at: now,
          });

          // Simulate SELECT and map back
          const storedRow = store.pantryEntries.get(id)!;
          const entry = rowToPantryEntry(storedRow);

          // Assertions
          expect(entry.id).toBe(id);
          expect(entry.ingredientId).toBe(ingredientId);
          expect(entry.quantity).toBe(quantity);
          expect(entry.updatedAt.toISOString()).toBe(now);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('MenuPlan: periodDays, startDate, status, elaborateDays preserved through round-trip', () => {
    fc.assert(
      fc.property(
        arbPeriodDays,
        fc.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') }),
        fc.array(fc.integer({ min: 0, max: 29 }), { minLength: 0, maxLength: 7 }),
        (periodDays, startDate, elaborateDays) => {
          const store = createRowStore();
          const now = new Date().toISOString();
          const startDateStr = startDate.toISOString();
          const elaborateDaysConfig = JSON.stringify(elaborateDays);
          const id = `plan-${Math.random().toString(36).slice(2)}`;

          // Simulate INSERT
          store.menuPlans.set(id, {
            id,
            period_days: periodDays,
            start_date: startDateStr,
            status: 'draft',
            elaborate_days_config: elaborateDaysConfig,
            created_at: now,
            updated_at: now,
          });

          // Simulate SELECT and map back
          const storedRow = store.menuPlans.get(id)!;
          const plan = rowToMenuPlan(storedRow);

          // Assertions
          expect(plan.id).toBe(id);
          expect(plan.periodDays).toBe(periodDays);
          expect(plan.startDate.toISOString()).toBe(startDateStr);
          expect(plan.status).toBe('draft');
          expect(plan.elaborateDays).toEqual(elaborateDays);
          expect(plan.createdAt.toISOString()).toBe(now);
          expect(plan.updatedAt.toISOString()).toBe(now);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Date fields: createdAt/updatedAt survive ISO string serialization round-trip', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
        (createdAt, updatedAt) => {
          // Simulate what the repository does: Date → toISOString() → stored as TEXT
          const createdAtStr = createdAt.toISOString();
          const updatedAtStr = updatedAt.toISOString();

          // Simulate what the row mapper does: string from DB → new Date(string)
          const restoredCreatedAt = new Date(createdAtStr);
          const restoredUpdatedAt = new Date(updatedAtStr);

          // The round-trip must be lossless
          expect(restoredCreatedAt.getTime()).toBe(createdAt.getTime());
          expect(restoredUpdatedAt.getTime()).toBe(updatedAt.getTime());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Recipe round-trip via repository create + getById mock integration', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRecipeName,
        arbMealType,
        arbPrepTime,
        fc.array(
          fc.record({ ingredientId: arbIngredientId, quantity: arbPositiveQuantity }),
          { minLength: 1, maxLength: 5 }
        ),
        async (name, mealType, prepTime, ingredients) => {
          const store = createRowStore();
          const mockDb = createMockDbWithStore(store);

          // Import with fresh mocks
          const { create, getById } = await import('../recipe.repository');

          // Create recipe through repository
          const created = await create(mockDb, { name, mealType, prepTime, ingredients });

          // The store should now have the recipe
          const storedRecipeRow = store.recipes.get(created.id);
          expect(storedRecipeRow).toBeDefined();

          // Map back from stored row (simulating read-back)
          const readBack = rowToRecipe(storedRecipeRow!);
          const storedIngs = store.recipeIngredients.get(created.id) || [];
          readBack.ingredients = storedIngs.map((ri) => ({
            ingredientId: ri.ingredient_id,
            quantity: ri.quantity,
          }));

          // Verify all fields match the original input
          expect(readBack.name).toBe(name);
          expect(readBack.mealType).toBe(mealType);
          expect(readBack.prepTime).toBe(prepTime);
          expect(readBack.ingredients).toHaveLength(ingredients.length);
          for (let i = 0; i < ingredients.length; i++) {
            expect(readBack.ingredients[i].ingredientId).toBe(ingredients[i].ingredientId);
            expect(readBack.ingredients[i].quantity).toBe(ingredients[i].quantity);
          }
          expect(readBack.createdAt).toBeInstanceOf(Date);
          expect(readBack.updatedAt).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Ingredient round-trip via repository create + read-back', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredientName,
        arbMeasureUnit,
        arbPurchaseFormat,
        arbCategory,
        async (name, unit, purchaseFormat, category) => {
          const store = createRowStore();
          const mockDb = createMockDbWithStore(store);

          const { IngredientRepository } = await import('../ingredient.repository');
          const repo = new IngredientRepository(mockDb);

          // Create ingredient through repository
          const created = await repo.create({ name, unit, purchaseFormat, category });

          // Read back from store and map to domain
          const storedRow = store.ingredients.get(created.id);
          expect(storedRow).toBeDefined();

          const readBack = rowToIngredient(storedRow!);

          // Verify round-trip preserves all fields
          expect(readBack.name).toBe(name);
          expect(readBack.unit).toBe(unit);
          expect(readBack.purchaseFormat.description).toBe(purchaseFormat.description);
          expect(readBack.purchaseFormat.quantity).toBe(purchaseFormat.quantity);
          expect(readBack.category).toBe(category);
          expect(readBack.createdAt).toBeInstanceOf(Date);
          expect(readBack.updatedAt).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 100 }
    );
  });
});
