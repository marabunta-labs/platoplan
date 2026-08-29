/**
 * PlatoPlan - Data Migration Preservation Property Test
 *
 * Feature: platoplan-web-supabase, Property 8: Data migration preserves all entities and relationships
 *
 * **Validates: Requirements 7.2**
 *
 * For any local database state containing N entities across all tables, a successful
 * migration SHALL result in exactly N entities in the remote database with the same
 * IDs, field values, and foreign key relationships preserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { MigrationService, MIGRATION_TABLE_ORDER } from '../migration.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LocalIngredient {
  id: string;
  name: string;
  unit: string;
  purchase_format_desc: string;
  purchase_format_quantity: number;
  category: string;
  created_at: string;
  updated_at: string;
}

interface LocalRecipe {
  id: string;
  name: string;
  meal_type: string;
  prep_time: string;
  created_at: string;
  updated_at: string;
}

interface LocalRecipeIngredient {
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

interface LocalPantryEntry {
  id: string;
  ingredient_id: string;
  quantity: number;
  updated_at: string;
}

// ─── Custom Generators ──────────────────────────────────────────────────────

/** Generates a UUID-like string for entity IDs */
const arbId = fc.uuid();

/** Generates a valid ISO timestamp string using integer milliseconds to avoid invalid date issues */
const arbTimestamp = fc.integer({
  min: new Date('2020-01-01T00:00:00.000Z').getTime(),
  max: new Date('2025-12-31T23:59:59.999Z').getTime(),
}).map((ms) => new Date(ms).toISOString());

/** Generates a non-empty name string */
const arbName = fc.string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generates a valid unit */
const arbUnit = fc.constantFrom('gramos', 'mililitros', 'unidades');

/** Generates a valid meal_type */
const arbMealType = fc.constantFrom('comida', 'cena', 'desayuno');

/** Generates a valid prep_time */
const arbPrepTime = fc.constantFrom('rapido', 'normal', 'largo');

/** Generates a positive quantity */
const arbPositiveQuantity = fc.double({
  min: 0.01,
  max: 10000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Generates a set of ingredients */
const arbIngredients = fc.array(
  fc.tuple(arbId, arbName, arbUnit, arbName, arbPositiveQuantity, arbName, arbTimestamp, arbTimestamp)
    .map(([id, name, unit, desc, qty, category, created, updated]): LocalIngredient => ({
      id,
      name,
      unit,
      purchase_format_desc: desc,
      purchase_format_quantity: qty,
      category,
      created_at: created,
      updated_at: updated,
    })),
  { minLength: 1, maxLength: 5 }
).filter((arr) => new Set(arr.map((i) => i.id)).size === arr.length); // Ensure unique IDs

/** Generates a set of recipes */
const arbRecipes = fc.array(
  fc.tuple(arbId, arbName, arbMealType, arbPrepTime, arbTimestamp, arbTimestamp)
    .map(([id, name, mealType, prepTime, created, updated]): LocalRecipe => ({
      id,
      name,
      meal_type: mealType,
      prep_time: prepTime,
      created_at: created,
      updated_at: updated,
    })),
  { minLength: 1, maxLength: 5 }
).filter((arr) => new Set(arr.map((r) => r.id)).size === arr.length); // Ensure unique IDs

/**
 * Generates recipe_ingredients that reference valid recipe and ingredient IDs.
 * Each pairing is unique to avoid duplicate composite keys.
 */
function arbRecipeIngredients(
  recipeIds: string[],
  ingredientIds: string[]
): fc.Arbitrary<LocalRecipeIngredient[]> {
  if (recipeIds.length === 0 || ingredientIds.length === 0) {
    return fc.constant([]);
  }

  // Generate valid pairings from available IDs
  const allPairings: Array<[string, string]> = [];
  for (const recipeId of recipeIds) {
    for (const ingredientId of ingredientIds) {
      allPairings.push([recipeId, ingredientId]);
    }
  }

  return fc.subarray(allPairings, { minLength: 1, maxLength: Math.min(allPairings.length, 5) })
    .chain((pairings) =>
      fc.tuple(
        ...pairings.map((pair) =>
          fc.tuple(arbPositiveQuantity, arbTimestamp, arbTimestamp).map(
            ([qty, created, updated]): LocalRecipeIngredient => ({
              recipe_id: pair[0],
              ingredient_id: pair[1],
              quantity: qty,
              created_at: created,
              updated_at: updated,
            })
          )
        )
      )
    );
}

/**
 * Generates pantry entries referencing valid ingredient IDs.
 */
function arbPantryEntries(ingredientIds: string[]): fc.Arbitrary<LocalPantryEntry[]> {
  if (ingredientIds.length === 0) {
    return fc.constant([]);
  }

  return fc.array(
    fc.tuple(arbId, fc.constantFrom(...ingredientIds), arbPositiveQuantity, arbTimestamp)
      .map(([id, ingredientId, quantity, updated]): LocalPantryEntry => ({
        id,
        ingredient_id: ingredientId,
        quantity,
        updated_at: updated,
      })),
    { minLength: 0, maxLength: 3 }
  ).filter((arr) => new Set(arr.map((e) => e.id)).size === arr.length); // Ensure unique IDs
}

// ─── Mock Helpers ───────────────────────────────────────────────────────────

/** Creates a mock SQLiteDatabase that returns the specified tables' data. */
function createMockDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('sqlite_master')) {
        const tableName = params[0] as string;
        if (tableName === '_sync_meta') {
          return { count: 0 }; // No sync meta — migration needed
        }
        return { count: tables[tableName] ? 1 : 0 };
      }
      if (sql.includes('COUNT(*)') && sql.includes('_sync_meta')) {
        return { count: 0 };
      }
      if (sql.includes('COUNT(*)')) {
        const match = sql.match(/FROM\s+(\w+)/i);
        if (match) {
          const rows = tables[match[1]] || [];
          return { count: rows.length };
        }
      }
      if (sql.includes('WHERE id = ?')) {
        const match = sql.match(/FROM\s+(\w+)/i);
        if (match) {
          const rows = tables[match[1]] || [];
          return rows.find((r) => r.id === params[0]) ?? null;
        }
      }
      if (sql.includes('WHERE recipe_id = ? AND ingredient_id = ?')) {
        const rows = tables['recipe_ingredients'] || [];
        return rows.find(
          (r) => r.recipe_id === params[0] && r.ingredient_id === params[1]
        ) ?? null;
      }
      return null;
    }),
    getAllAsync: vi.fn(async (sql: string) => {
      const match = sql.match(/FROM\s+(\w+)/i);
      if (match) {
        return tables[match[1]] || [];
      }
      return [];
    }),
    execAsync: vi.fn(async () => {}),
    runAsync: vi.fn(async () => ({ changes: 1 })),
  } as any;
}

/** Creates a mock Supabase client that captures all uploaded rows. */
function createCapturingSupabaseClient() {
  const uploadedRows: Array<{ table: string; data: Record<string, unknown> }> = [];

  const client = {
    from: vi.fn((table: string) => ({
      upsert: vi.fn((data: Record<string, unknown>) => {
        uploadedRows.push({ table, data });
        return { error: null };
      }),
    })),
  };

  return { client: client as any, uploadedRows };
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Feature: platoplan-web-supabase, Property 8: Data migration preserves all entities and relationships', () => {
  let service: MigrationService;

  beforeEach(() => {
    service = new MigrationService();
  });

  /**
   * Property 8: Data migration preserves all entities and relationships
   *
   * For any local database state containing N entities across all tables,
   * a successful migration SHALL result in exactly N entities in the remote
   * database with the same IDs, field values, and foreign key relationships preserved.
   *
   * **Validates: Requirements 7.2**
   */
  it('should upload exactly N entities for N local entities (1:1 mapping)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredients,
        arbRecipes,
        async (ingredients, recipes) => {
          const recipeIds = recipes.map((r) => r.id);
          const ingredientIds = ingredients.map((i) => i.id);

          // Generate dependent entities
          const recipeIngredients = fc.sample(
            arbRecipeIngredients(recipeIds, ingredientIds),
            1
          )[0];
          const pantryEntries = fc.sample(
            arbPantryEntries(ingredientIds),
            1
          )[0];

          const tables: Record<string, Record<string, unknown>[]> = {
            ingredients: ingredients as unknown as Record<string, unknown>[],
            recipes: recipes as unknown as Record<string, unknown>[],
            recipe_ingredients: recipeIngredients as unknown as Record<string, unknown>[],
            pantry_entries: pantryEntries as unknown as Record<string, unknown>[],
            menu_plans: [],
            plan_assignments: [],
            free_days: [],
            shopping_lists: [],
            shopping_list_items: [],
          };

          const totalLocalEntities =
            ingredients.length +
            recipes.length +
            recipeIngredients.length +
            pantryEntries.length;

          const db = createMockDb(tables);
          const { client, uploadedRows } = createCapturingSupabaseClient();
          const userId = 'user-test-123';

          const result = await service.migrate(db, client, userId);

          // Exactly N entities uploaded
          expect(result.succeeded).toHaveLength(totalLocalEntities);
          expect(result.failed).toHaveLength(0);
          expect(uploadedRows).toHaveLength(totalLocalEntities);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve all original IDs in uploaded entities', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredients,
        arbRecipes,
        async (ingredients, recipes) => {
          const recipeIds = recipes.map((r) => r.id);
          const ingredientIds = ingredients.map((i) => i.id);
          const recipeIngredients = fc.sample(
            arbRecipeIngredients(recipeIds, ingredientIds),
            1
          )[0];

          const tables: Record<string, Record<string, unknown>[]> = {
            ingredients: ingredients as unknown as Record<string, unknown>[],
            recipes: recipes as unknown as Record<string, unknown>[],
            recipe_ingredients: recipeIngredients as unknown as Record<string, unknown>[],
            pantry_entries: [],
            menu_plans: [],
            plan_assignments: [],
            free_days: [],
            shopping_lists: [],
            shopping_list_items: [],
          };

          const db = createMockDb(tables);
          const { client, uploadedRows } = createCapturingSupabaseClient();
          const userId = 'user-test-456';

          await service.migrate(db, client, userId);

          // All ingredient IDs are preserved
          const uploadedIngredientIds = uploadedRows
            .filter((r) => r.table === 'ingredients')
            .map((r) => r.data.id);
          for (const ing of ingredients) {
            expect(uploadedIngredientIds).toContain(ing.id);
          }

          // All recipe IDs are preserved
          const uploadedRecipeIds = uploadedRows
            .filter((r) => r.table === 'recipes')
            .map((r) => r.data.id);
          for (const rec of recipes) {
            expect(uploadedRecipeIds).toContain(rec.id);
          }

          // recipe_ingredients composite keys are preserved
          const uploadedRI = uploadedRows.filter((r) => r.table === 'recipe_ingredients');
          for (const ri of recipeIngredients) {
            const found = uploadedRI.find(
              (u) => u.data.recipe_id === ri.recipe_id && u.data.ingredient_id === ri.ingredient_id
            );
            expect(found).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve all field values in uploaded entities', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredients,
        arbRecipes,
        async (ingredients, recipes) => {
          const tables: Record<string, Record<string, unknown>[]> = {
            ingredients: ingredients as unknown as Record<string, unknown>[],
            recipes: recipes as unknown as Record<string, unknown>[],
            recipe_ingredients: [],
            pantry_entries: [],
            menu_plans: [],
            plan_assignments: [],
            free_days: [],
            shopping_lists: [],
            shopping_list_items: [],
          };

          const db = createMockDb(tables);
          const { client, uploadedRows } = createCapturingSupabaseClient();
          const userId = 'user-test-789';

          await service.migrate(db, client, userId);

          // Verify ingredient field values
          for (const ing of ingredients) {
            const uploaded = uploadedRows.find(
              (r) => r.table === 'ingredients' && r.data.id === ing.id
            );
            expect(uploaded).toBeDefined();
            expect(uploaded!.data.name).toBe(ing.name);
            expect(uploaded!.data.unit).toBe(ing.unit);
            expect(uploaded!.data.purchase_format_desc).toBe(ing.purchase_format_desc);
            expect(uploaded!.data.purchase_format_quantity).toBe(ing.purchase_format_quantity);
            expect(uploaded!.data.category).toBe(ing.category);
            expect(uploaded!.data.created_at).toBe(ing.created_at);
            expect(uploaded!.data.updated_at).toBe(ing.updated_at);
          }

          // Verify recipe field values
          for (const rec of recipes) {
            const uploaded = uploadedRows.find(
              (r) => r.table === 'recipes' && r.data.id === rec.id
            );
            expect(uploaded).toBeDefined();
            expect(uploaded!.data.name).toBe(rec.name);
            expect(uploaded!.data.meal_type).toBe(rec.meal_type);
            expect(uploaded!.data.prep_time).toBe(rec.prep_time);
            expect(uploaded!.data.created_at).toBe(rec.created_at);
            expect(uploaded!.data.updated_at).toBe(rec.updated_at);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain foreign key relationships (recipe_ingredients reference valid IDs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredients,
        arbRecipes,
        async (ingredients, recipes) => {
          const recipeIds = recipes.map((r) => r.id);
          const ingredientIds = ingredients.map((i) => i.id);
          const recipeIngredients = fc.sample(
            arbRecipeIngredients(recipeIds, ingredientIds),
            1
          )[0];
          const pantryEntries = fc.sample(
            arbPantryEntries(ingredientIds),
            1
          )[0];

          const tables: Record<string, Record<string, unknown>[]> = {
            ingredients: ingredients as unknown as Record<string, unknown>[],
            recipes: recipes as unknown as Record<string, unknown>[],
            recipe_ingredients: recipeIngredients as unknown as Record<string, unknown>[],
            pantry_entries: pantryEntries as unknown as Record<string, unknown>[],
            menu_plans: [],
            plan_assignments: [],
            free_days: [],
            shopping_lists: [],
            shopping_list_items: [],
          };

          const db = createMockDb(tables);
          const { client, uploadedRows } = createCapturingSupabaseClient();
          const userId = 'user-fk-test';

          await service.migrate(db, client, userId);

          // Collect uploaded IDs by table
          const uploadedIngredientIds = new Set(
            uploadedRows.filter((r) => r.table === 'ingredients').map((r) => r.data.id as string)
          );
          const uploadedRecipeIds = new Set(
            uploadedRows.filter((r) => r.table === 'recipes').map((r) => r.data.id as string)
          );

          // Every recipe_ingredient references a valid recipe and ingredient
          const uploadedRI = uploadedRows.filter((r) => r.table === 'recipe_ingredients');
          for (const ri of uploadedRI) {
            expect(uploadedRecipeIds.has(ri.data.recipe_id as string)).toBe(true);
            expect(uploadedIngredientIds.has(ri.data.ingredient_id as string)).toBe(true);
          }

          // Every pantry_entry references a valid ingredient
          const uploadedPE = uploadedRows.filter((r) => r.table === 'pantry_entries');
          for (const pe of uploadedPE) {
            expect(uploadedIngredientIds.has(pe.data.ingredient_id as string)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should add user_id to all uploaded rows', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredients,
        arbRecipes,
        fc.uuid(),
        async (ingredients, recipes, userId) => {
          const recipeIds = recipes.map((r) => r.id);
          const ingredientIds = ingredients.map((i) => i.id);
          const recipeIngredients = fc.sample(
            arbRecipeIngredients(recipeIds, ingredientIds),
            1
          )[0];

          const tables: Record<string, Record<string, unknown>[]> = {
            ingredients: ingredients as unknown as Record<string, unknown>[],
            recipes: recipes as unknown as Record<string, unknown>[],
            recipe_ingredients: recipeIngredients as unknown as Record<string, unknown>[],
            pantry_entries: [],
            menu_plans: [],
            plan_assignments: [],
            free_days: [],
            shopping_lists: [],
            shopping_list_items: [],
          };

          const db = createMockDb(tables);
          const { client, uploadedRows } = createCapturingSupabaseClient();

          await service.migrate(db, client, userId);

          // Every uploaded row must have the correct user_id
          for (const row of uploadedRows) {
            expect(row.data.user_id).toBe(userId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
