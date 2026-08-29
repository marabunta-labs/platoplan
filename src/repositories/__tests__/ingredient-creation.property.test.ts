/**
 * Property-Based Test: Successful ingredient creation increases list size
 *
 * Feature: platoplan-web-supabase, Property 3: Successful ingredient creation increases list size
 * Validates: Requirements 1.4, 2.3
 *
 * For any valid ingredient input (non-empty name ≤ 100 chars, valid unit in
 * ['gramos','mililitros','unidades'], positive purchase quantity, non-empty category)
 * where the name does not already exist, creating the ingredient SHALL increase
 * the ingredient count by exactly one and the new ingredient SHALL be retrievable
 * by its name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { MeasureUnit } from '../../models/enums';

// Mock generateId to produce unique IDs for each creation
let idCounter = 0;
vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => `gen-id-${++idCounter}`),
}));

// --- Custom Arbitraries ---

/** Valid ingredient name: non-empty, max 100 chars, trimmed non-empty */
const arbIngredientName = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Valid unit: one of the allowed values */
const arbMeasureUnit: fc.Arbitrary<MeasureUnit> = fc.constantFrom('gramos', 'mililitros', 'unidades');

/** Valid purchase format: non-empty description, positive quantity */
const arbPurchaseFormat = fc.record({
  description: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  quantity: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
});

/** Valid category: non-empty string */
const arbCategory = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

// --- In-Memory Store ---

interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  purchase_format_desc: string;
  purchase_format_quantity: number;
  category: string;
  created_at: string;
  updated_at: string;
}

function createInMemoryStore() {
  const ingredients = new Map<string, IngredientRow>();

  return {
    ingredients,
    db: {
      runAsync: vi.fn(async (sql: string, ...params: any[]) => {
        if (sql.includes('INSERT INTO ingredients')) {
          const [id, name, unit, purchaseFormatDesc, purchaseFormatQty, category, createdAt, updatedAt] = params;
          ingredients.set(id, {
            id,
            name,
            unit,
            purchase_format_desc: purchaseFormatDesc,
            purchase_format_quantity: purchaseFormatQty,
            category,
            created_at: createdAt,
            updated_at: updatedAt,
          });
        }
        return { changes: 1, lastInsertRowId: 1 };
      }),
      getFirstAsync: vi.fn(async (sql: string, ...params: any[]) => {
        if (sql.includes('FROM ingredients WHERE id')) {
          const id = params[0] as string;
          return ingredients.get(id) ?? null;
        }
        if (sql.includes('FROM ingredients WHERE name')) {
          const name = params[0] as string;
          for (const row of ingredients.values()) {
            if (row.name.toLowerCase() === name.toLowerCase()) {
              return row;
            }
          }
          return null;
        }
        return null;
      }),
      getAllAsync: vi.fn(async (sql: string, ...params: any[]) => {
        if (sql.includes('FROM ingredients') && sql.includes('LIKE')) {
          // The search method wraps with %...% so strip only the leading/trailing %
          const rawPattern = params[0] as string;
          const searchTerm = rawPattern.startsWith('%') && rawPattern.endsWith('%')
            ? rawPattern.slice(1, -1)
            : rawPattern;
          return Array.from(ingredients.values()).filter((row) =>
            row.name.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }
        if (sql.includes('FROM ingredients')) {
          return Array.from(ingredients.values());
        }
        return [];
      }),
      execAsync: vi.fn().mockResolvedValue(undefined),
    } as any,
  };
}

// --- Property Test ---

describe('Property 3: Successful ingredient creation increases list size', () => {
  beforeEach(() => {
    idCounter = 0;
    vi.clearAllMocks();
  });

  it('creating a valid ingredient with a unique name increases the list count by exactly one', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredientName,
        arbMeasureUnit,
        arbPurchaseFormat,
        arbCategory,
        async (name, unit, purchaseFormat, category) => {
          const { db, ingredients } = createInMemoryStore();

          const { IngredientRepository } = await import('../ingredient.repository');
          const repo = new IngredientRepository(db);

          // Get initial count
          const initialCount = ingredients.size;
          expect(initialCount).toBe(0);

          // Create the ingredient with valid input
          const created = await repo.create({ name, unit, purchaseFormat, category });

          // Count increased by exactly one
          const afterCount = ingredients.size;
          expect(afterCount).toBe(initialCount + 1);

          // The new ingredient is retrievable by looking up its name in the store
          let foundByName = false;
          for (const row of ingredients.values()) {
            if (row.name === name) {
              foundByName = true;
              break;
            }
          }
          expect(foundByName).toBe(true);

          // The returned ingredient matches the input
          expect(created.name).toBe(name);
          expect(created.unit).toBe(unit);
          expect(created.purchaseFormat.description).toBe(purchaseFormat.description);
          expect(created.purchaseFormat.quantity).toBe(purchaseFormat.quantity);
          expect(created.category).toBe(category);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('creating multiple ingredients with distinct names increases count by exact number created', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: arbIngredientName,
            unit: arbMeasureUnit,
            purchaseFormat: arbPurchaseFormat,
            category: arbCategory,
          }),
          { minLength: 1, maxLength: 10 }
        ).filter((inputs) => {
          // Ensure all names are unique (case-insensitive)
          const lowerNames = inputs.map((i) => i.name.toLowerCase());
          return new Set(lowerNames).size === lowerNames.length;
        }),
        async (inputs) => {
          const { db, ingredients } = createInMemoryStore();

          const { IngredientRepository } = await import('../ingredient.repository');
          const repo = new IngredientRepository(db);

          const initialCount = ingredients.size;

          // Create all ingredients
          for (const input of inputs) {
            await repo.create(input);
          }

          // Count increased by exactly the number of unique ingredients created
          expect(ingredients.size).toBe(initialCount + inputs.length);

          // Each ingredient is retrievable by name in the store
          for (const input of inputs) {
            let found = false;
            for (const row of ingredients.values()) {
              if (row.name === input.name) {
                found = true;
                break;
              }
            }
            expect(found).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('created ingredient is retrievable via search by name', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredientName,
        arbMeasureUnit,
        arbPurchaseFormat,
        arbCategory,
        async (name, unit, purchaseFormat, category) => {
          const { db, ingredients } = createInMemoryStore();

          const { IngredientRepository } = await import('../ingredient.repository');
          const repo = new IngredientRepository(db);

          // Create the ingredient
          await repo.create({ name, unit, purchaseFormat, category });

          // Search for the ingredient by name — should find it
          const results = await repo.search(name);
          expect(results.length).toBeGreaterThanOrEqual(1);
          expect(results.some((r) => r.name === name)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
