/**
 * Property-based tests for PantryService (Properties 7-8)
 * Feature: platoplan
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { PantryService } from '../pantry.service';
import type { PantryEntry, Recipe, RecipeIngredient } from '../../models/types';

// Mock the recipe repository
vi.mock('../../repositories/recipe.repository', () => ({
  getAll: vi.fn(),
}));

// Mock the PantryRepository with state tracking
let pantryState: Map<string, PantryEntry>;

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

// --- Custom Generators ---

/** Generates a non-empty string identifier for ingredient IDs */
const arbIngredientId = fc.stringMatching(/^[a-z0-9-]{1,36}$/);

/** Generates a positive quantity (float > 0) */
const arbPositiveQuantity = fc.double({ min: 0.01, max: 10000, noNaN: true });

/** Generates recipe ingredients array (1-10 items with unique ingredientIds) */
const arbRecipeIngredients = fc
  .uniqueArray(arbIngredientId, { minLength: 1, maxLength: 10 })
  .chain((ids) =>
    fc.tuple(
      fc.constant(ids),
      fc.array(arbPositiveQuantity, { minLength: ids.length, maxLength: ids.length })
    )
  )
  .map(([ids, quantities]): RecipeIngredient[] =>
    ids.map((ingredientId, i) => ({
      ingredientId,
      quantity: quantities[i],
    }))
  );

/** Generates a pantry state as a map of ingredientId -> quantity */
const arbPantryState = fc
  .uniqueArray(arbIngredientId, { minLength: 0, maxLength: 15 })
  .chain((ids) =>
    fc.tuple(
      fc.constant(ids),
      fc.array(arbPositiveQuantity, { minLength: ids.length, maxLength: ids.length })
    )
  )
  .map(([ids, quantities]): Map<string, number> => {
    const map = new Map<string, number>();
    ids.forEach((id, i) => map.set(id, quantities[i]));
    return map;
  });

describe('PantryService - Property Tests', () => {
  let service: PantryService;
  const mockDb = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    pantryState = new Map();
    service = new PantryService(mockDb);
  });

  /**
   * Property 7: Pantry upsert idempotence
   * Feature: platoplan, Property 7: Pantry upsert idempotence
   *
   * For any Ingredient already registered in the Pantry with quantity Q1,
   * registering the same Ingredient again with quantity Q2 results in the
   * Pantry containing exactly one entry for that Ingredient with quantity Q2
   * (update, not duplicate).
   *
   * **Validates: Requirements 3.3**
   */
  describe('Property 7: Pantry upsert idempotence', () => {
    it('registering an ingredient twice results in a single entry with the second quantity', () => {
      fc.assert(
        fc.asyncProperty(
          arbIngredientId,
          arbPositiveQuantity,
          arbPositiveQuantity,
          async (ingredientId, q1, q2) => {
            // Setup: track pantry state in the mock
            const localPantryState = new Map<string, PantryEntry>();

            // Mock addOrUpdate to simulate upsert semantics
            mockPantryRepo.addOrUpdate.mockImplementation(
              async (ingId: string, quantity: number): Promise<PantryEntry> => {
                const existing = localPantryState.get(ingId);
                if (existing) {
                  // Update existing entry
                  const updated: PantryEntry = {
                    ...existing,
                    quantity,
                    updatedAt: new Date(),
                  };
                  localPantryState.set(ingId, updated);
                  return updated;
                } else {
                  // Create new entry
                  const newEntry: PantryEntry = {
                    id: `pantry-${ingId}`,
                    ingredientId: ingId,
                    quantity,
                    updatedAt: new Date(),
                  };
                  localPantryState.set(ingId, newEntry);
                  return newEntry;
                }
              }
            );

            // Act: First registration with Q1
            const entry1: PantryEntry = {
              id: 'entry-1',
              ingredientId,
              quantity: q1,
              updatedAt: new Date(),
            };
            await service.addOrUpdate(entry1);

            // Act: Second registration with Q2
            const entry2: PantryEntry = {
              id: 'entry-2',
              ingredientId,
              quantity: q2,
              updatedAt: new Date(),
            };
            const result = await service.addOrUpdate(entry2);

            // Assert: Only one entry in the state for that ingredient
            const entries = Array.from(localPantryState.values()).filter(
              (e) => e.ingredientId === ingredientId
            );
            expect(entries).toHaveLength(1);

            // Assert: The entry has the second quantity Q2
            expect(entries[0].quantity).toBe(q2);

            // Assert: The returned result also has Q2
            expect(result.quantity).toBe(q2);
            expect(result.ingredientId).toBe(ingredientId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 8: Pantry-based recipe availability classification
   * Feature: platoplan, Property 8: Pantry-based recipe availability classification
   *
   * For any set of Recipes and a given Pantry state, a Recipe is classified as
   * "fully preparable" if and only if every Ingredient in the Recipe has a Pantry
   * quantity >= the required quantity. A Recipe is classified as "partially preparable"
   * if and only if at least 50% of its Ingredients (rounded down) have sufficient
   * Pantry quantity, but not all do.
   *
   * **Validates: Requirements 3.8**
   */
  describe('Property 8: Pantry-based recipe availability classification', () => {
    it('classifies recipes correctly based on pantry state', () => {
      fc.assert(
        fc.asyncProperty(
          // Generate 1-5 recipes, each with 1-10 ingredients
          fc.array(arbRecipeIngredients, { minLength: 1, maxLength: 5 }),
          arbPantryState,
          async (recipeIngredientSets, pantryMap) => {
            // Build recipe objects
            const recipes: Recipe[] = recipeIngredientSets.map((ingredients, i) => ({
              id: `recipe-${i}`,
              name: `Recipe ${i}`,
              mealType: 'comida' as const,
              prepTime: 'rapido' as const,
              ingredients,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            // Build pantry entries from the pantry map
            const pantryEntries: PantryEntry[] = Array.from(pantryMap.entries()).map(
              ([ingredientId, quantity]) => ({
                id: `pantry-${ingredientId}`,
                ingredientId,
                quantity,
                updatedAt: new Date(),
              })
            );

            // Setup mocks
            vi.mocked(recipeRepository.getAll).mockResolvedValue(recipes);
            mockPantryRepo.getAll.mockResolvedValue(pantryEntries);

            // Act
            const result = await service.getPreparableRecipes();

            // Verify each recipe's classification independently
            for (const recipe of recipes) {
              if (recipe.ingredients.length === 0) {
                // Recipes with no ingredients should not appear in either list
                expect(result.full.find((r) => r.id === recipe.id)).toBeUndefined();
                expect(result.partial.find((r) => r.id === recipe.id)).toBeUndefined();
                continue;
              }

              const totalIngredients = recipe.ingredients.length;
              let sufficientCount = 0;

              for (const recipeIngredient of recipe.ingredients) {
                const available = pantryMap.get(recipeIngredient.ingredientId) ?? 0;
                if (available >= recipeIngredient.quantity) {
                  sufficientCount++;
                }
              }

              const isFullyPreparable = sufficientCount === totalIngredients;
              const threshold = Math.floor(totalIngredients * 0.5);
              const isPartiallyPreparable =
                !isFullyPreparable && sufficientCount >= threshold && threshold > 0;

              const inFull = result.full.some((r) => r.id === recipe.id);
              const inPartial = result.partial.some((r) => r.id === recipe.id);

              if (isFullyPreparable) {
                expect(inFull).toBe(true);
                expect(inPartial).toBe(false);
              } else if (isPartiallyPreparable) {
                expect(inFull).toBe(false);
                expect(inPartial).toBe(true);
              } else {
                expect(inFull).toBe(false);
                expect(inPartial).toBe(false);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
