/**
 * Property-based tests for Shopping List Service (Properties 16-20)
 * Feature: platoplan
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ShoppingListService } from '../shopping-list.service';
import type {
  Ingredient,
  MenuPlan,
  PantryEntry,
  Recipe,
  RecipeIngredient,
  ShoppingList,
} from '../../models/types';
import type { CreateShoppingListItemInput } from '../../repositories/shopping-list.repository';

// --- Mock Repositories ---

const mockShoppingListRepo = {
  create: vi.fn(),
  getByPlanId: vi.fn(),
  update: vi.fn(),
  markStale: vi.fn(),
  editQuantity: vi.fn(),
  removeItem: vi.fn(),
};

const mockPantryRepo = {
  addOrUpdate: vi.fn(),
  remove: vi.fn(),
  getAll: vi.fn(),
  getByIngredientId: vi.fn(),
};

const mockIngredientRepo = {
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getById: vi.fn(),
  getAll: vi.fn(),
  search: vi.fn(),
  getRecipesUsingIngredient: vi.fn(),
};

vi.mock('../../repositories/shopping-list.repository', () => {
  return {
    ShoppingListRepository: class {
      create = mockShoppingListRepo.create;
      getByPlanId = mockShoppingListRepo.getByPlanId;
      update = mockShoppingListRepo.update;
      markStale = mockShoppingListRepo.markStale;
      editQuantity = mockShoppingListRepo.editQuantity;
      removeItem = mockShoppingListRepo.removeItem;
    },
  };
});

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

vi.mock('../../repositories/ingredient.repository', () => {
  return {
    IngredientRepository: class {
      create = mockIngredientRepo.create;
      update = mockIngredientRepo.update;
      delete = mockIngredientRepo.delete;
      getById = mockIngredientRepo.getById;
      getAll = mockIngredientRepo.getAll;
      search = mockIngredientRepo.search;
      getRecipesUsingIngredient = mockIngredientRepo.getRecipesUsingIngredient;
    },
  };
});

vi.mock('../../repositories/plan.repository', () => ({
  getPlanById: vi.fn(),
}));

vi.mock('../../repositories/recipe.repository', () => ({
  getById: vi.fn(),
}));

import * as planRepository from '../../repositories/plan.repository';
import * as recipeRepository from '../../repositories/recipe.repository';

// --- Custom Generators ---

/** Generates a positive float quantity (> 0) for ingredient amounts */
const arbIngredientQuantity = fc.double({ min: 0.01, max: 500, noNaN: true });

/** Generates a positive float quantity (> 0) for purchase format */
const arbPurchaseFormatQuantity = fc.double({ min: 0.1, max: 1000, noNaN: true });

/** Generates a non-negative quantity for pantry */
const arbPantryQuantity = fc.double({ min: 0, max: 1000, noNaN: true });

/** Generates a food category */
const arbCategory = fc.constantFrom(
  'Frutas',
  'Verduras',
  'Carnes',
  'Lácteos',
  'Cereales',
  'Pescados',
  'Condimentos',
  'Bebidas'
);

/** Helper: builds a full Ingredient object with given properties */
function buildIngredient(
  id: string,
  name: string,
  category: string,
  purchaseFormatQty: number
): Ingredient {
  return {
    id,
    name,
    unit: 'gramos',
    purchaseFormat: {
      description: `paquete de ${purchaseFormatQty}g`,
      quantity: purchaseFormatQty,
    },
    category,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Resets all mocks before each property iteration */
function resetMocks(): void {
  mockShoppingListRepo.create.mockReset();
  mockShoppingListRepo.getByPlanId.mockReset();
  mockShoppingListRepo.update.mockReset();
  mockShoppingListRepo.markStale.mockReset();
  mockShoppingListRepo.editQuantity.mockReset();
  mockShoppingListRepo.removeItem.mockReset();
  mockPantryRepo.addOrUpdate.mockReset();
  mockPantryRepo.remove.mockReset();
  mockPantryRepo.getAll.mockReset();
  mockPantryRepo.getByIngredientId.mockReset();
  mockIngredientRepo.create.mockReset();
  mockIngredientRepo.update.mockReset();
  mockIngredientRepo.delete.mockReset();
  mockIngredientRepo.getById.mockReset();
  mockIngredientRepo.getAll.mockReset();
  mockIngredientRepo.search.mockReset();
  mockIngredientRepo.getRecipesUsingIngredient.mockReset();
  vi.mocked(planRepository.getPlanById).mockReset();
  vi.mocked(recipeRepository.getById).mockReset();
}

describe('ShoppingListService - Property Tests', () => {
  let service: ShoppingListService;
  const mockDb = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ShoppingListService(mockDb);
  });

  /**
   * Property 16: Shopping list aggregates ingredient quantities across all plan recipes
   * Feature: platoplan, Property 16: Shopping list aggregates ingredient quantities across all plan recipes
   *
   * For any confirmed menu plan, the shopping list total quantity for each ingredient
   * equals the sum of that ingredient's quantity across all assigned recipes in the plan
   * (accounting for recipe repetitions).
   *
   * **Validates: Requirements 6.1**
   */
  describe('Property 16: Shopping list aggregates ingredient quantities across all plan recipes', () => {
    it('total quantity per ingredient equals sum across all assigned recipes (including repetitions)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 2-4 ingredient count
          fc.integer({ min: 2, max: 4 }),
          // Generate 2-4 recipe count
          fc.integer({ min: 2, max: 4 }),
          // Generate number of assignments (2-6)
          fc.integer({ min: 2, max: 6 }),
          arbPurchaseFormatQuantity,
          async (numIngredients, numRecipes, numAssignments, purchaseFmtQty) => {
            resetMocks();

            // Build ingredients
            const ingredientMap = new Map<string, Ingredient>();
            for (let i = 0; i < numIngredients; i++) {
              const id = `ing-${i}`;
              const ing = buildIngredient(id, `Ingredient${i}`, 'Frutas', purchaseFmtQty);
              ingredientMap.set(id, ing);
            }

            // Build recipes: each recipe uses all ingredients with deterministic quantities
            const recipes: Recipe[] = [];
            for (let r = 0; r < numRecipes; r++) {
              const recipeIngredients: RecipeIngredient[] = [];
              for (let i = 0; i < numIngredients; i++) {
                recipeIngredients.push({
                  ingredientId: `ing-${i}`,
                  quantity: (r + 1) * (i + 1) * 0.5,
                });
              }
              recipes.push({
                id: `recipe-${r}`,
                name: `Recipe ${r}`,
                mealType: 'comida',
                prepTime: 'rapido',
                ingredients: recipeIngredients,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            }

            // Build assignments (pick recipes cyclically)
            const assignments = Array.from({ length: numAssignments }, (_, i) => ({
              id: `assignment-${i}`,
              planId: 'plan-1',
              dayIndex: i,
              slot: 'comida' as const,
              recipeId: `recipe-${i % numRecipes}`,
            }));

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays: numAssignments,
              startDate: new Date(),
              status: 'confirmed',
              elaborateDays: [],
              assignments,
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Manually compute expected aggregation
            const expectedTotals = new Map<string, number>();
            for (const assignment of assignments) {
              const recipe = recipes.find((r) => r.id === assignment.recipeId)!;
              for (const ri of recipe.ingredients) {
                const current = expectedTotals.get(ri.ingredientId) ?? 0;
                expectedTotals.set(ri.ingredientId, current + ri.quantity);
              }
            }

            // Setup mocks
            vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);
            vi.mocked(recipeRepository.getById).mockImplementation(
              async (_db: any, id: string) => recipes.find((r) => r.id === id) ?? null
            );
            mockPantryRepo.getByIngredientId.mockResolvedValue(null);
            mockIngredientRepo.getById.mockImplementation(async (id: string) =>
              ingredientMap.get(id) ?? null
            );

            let capturedItems: CreateShoppingListItemInput[] = [];
            mockShoppingListRepo.create.mockImplementation(
              async (_planId: string, items: CreateShoppingListItemInput[]) => {
                capturedItems = items;
                return {
                  id: 'list-1',
                  planId: _planId,
                  items: items.map((item, idx) => ({
                    id: `item-${idx}`,
                    listId: 'list-1',
                    ...item,
                    isManuallyEdited: false,
                    isRemoved: false,
                  })),
                  generatedAt: new Date(),
                  isStale: false,
                };
              }
            );

            // Act
            await service.generate('plan-1');

            // Assert: each ingredient's totalQuantityNeeded matches expected sum
            for (const item of capturedItems) {
              const expected = expectedTotals.get(item.ingredientId) ?? 0;
              expect(item.totalQuantityNeeded).toBeCloseTo(expected, 5);
            }

            // Assert: all ingredients with non-zero totals are present
            for (const [ingId, total] of expectedTotals) {
              if (total > 0 && ingredientMap.has(ingId)) {
                const found = capturedItems.find((item) => item.ingredientId === ingId);
                expect(found).toBeDefined();
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 17: Purchase format conversion rounds up to next whole unit
   * Feature: platoplan, Property 17: Purchase format conversion rounds up to next whole unit
   *
   * For any ingredient with a net quantity Q and purchase format quantity P,
   * the number of purchase units = ceil(Q / P) — always rounding up.
   *
   * **Validates: Requirements 6.2**
   */
  describe('Property 17: Purchase format conversion rounds up to next whole unit', () => {
    it('purchase units always equals ceil(netQuantity / purchaseFormatQuantity)', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbIngredientQuantity,
          arbPurchaseFormatQuantity,
          async (ingredientQty, purchaseFmtQty) => {
            resetMocks();

            const ingredientId = 'ing-test';
            const recipe: Recipe = {
              id: 'recipe-1',
              name: 'Test Recipe',
              mealType: 'comida',
              prepTime: 'rapido',
              ingredients: [{ ingredientId, quantity: ingredientQty }],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const ingredient = buildIngredient(ingredientId, 'Test Ingredient', 'Frutas', purchaseFmtQty);

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays: 1,
              startDate: new Date(),
              status: 'confirmed',
              elaborateDays: [],
              assignments: [
                { id: 'a-1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'recipe-1' },
              ],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Setup mocks
            vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);
            vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);
            mockPantryRepo.getByIngredientId.mockResolvedValue(null);
            mockIngredientRepo.getById.mockResolvedValue(ingredient);

            let capturedItems: CreateShoppingListItemInput[] = [];
            mockShoppingListRepo.create.mockImplementation(
              async (_planId: string, items: CreateShoppingListItemInput[]) => {
                capturedItems = items;
                return {
                  id: 'list-1',
                  planId: _planId,
                  items: items.map((item, idx) => ({
                    id: `item-${idx}`,
                    listId: 'list-1',
                    ...item,
                    isManuallyEdited: false,
                    isRemoved: false,
                  })),
                  generatedAt: new Date(),
                  isStale: false,
                };
              }
            );

            // Act
            await service.generate('plan-1');

            // Assert
            expect(capturedItems).toHaveLength(1);
            const item = capturedItems[0];
            const expectedPurchaseUnits = Math.ceil(ingredientQty / purchaseFmtQty);
            expect(item.purchaseUnits).toBe(expectedPurchaseUnits);
            expect(item.netQuantity).toBeCloseTo(ingredientQty, 5);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 18: Pantry deduction reduces or eliminates shopping list items
   * Feature: platoplan, Property 18: Pantry deduction reduces or eliminates shopping list items
   *
   * For any ingredient in both the plan and pantry,
   * netQuantity = max(0, totalNeeded - pantryAvailable).
   * If pantryAvailable >= totalNeeded, the ingredient is excluded entirely.
   *
   * **Validates: Requirements 6.3, 6.4**
   */
  describe('Property 18: Pantry deduction reduces or eliminates shopping list items', () => {
    it('net quantity is max(0, totalNeeded - pantryAvailable) and eliminates when pantry covers need', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbIngredientQuantity,
          arbPantryQuantity,
          arbPurchaseFormatQuantity,
          async (ingredientQty, pantryQty, purchaseFmtQty) => {
            resetMocks();

            const ingredientId = 'ing-test';
            const recipe: Recipe = {
              id: 'recipe-1',
              name: 'Test Recipe',
              mealType: 'comida',
              prepTime: 'rapido',
              ingredients: [{ ingredientId, quantity: ingredientQty }],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const ingredient = buildIngredient(ingredientId, 'Test Ingredient', 'Frutas', purchaseFmtQty);

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays: 1,
              startDate: new Date(),
              status: 'confirmed',
              elaborateDays: [],
              assignments: [
                { id: 'a-1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'recipe-1' },
              ],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Setup: pantry has pantryQty of this ingredient
            const pantryEntry: PantryEntry | null =
              pantryQty > 0
                ? { id: 'p-1', ingredientId, quantity: pantryQty, updatedAt: new Date() }
                : null;

            vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);
            vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);
            mockPantryRepo.getByIngredientId.mockResolvedValue(pantryEntry);
            mockIngredientRepo.getById.mockResolvedValue(ingredient);

            let capturedItems: CreateShoppingListItemInput[] = [];
            mockShoppingListRepo.create.mockImplementation(
              async (_planId: string, items: CreateShoppingListItemInput[]) => {
                capturedItems = items;
                return {
                  id: 'list-1',
                  planId: _planId,
                  items: items.map((item, idx) => ({
                    id: `item-${idx}`,
                    listId: 'list-1',
                    ...item,
                    isManuallyEdited: false,
                    isRemoved: false,
                  })),
                  generatedAt: new Date(),
                  isStale: false,
                };
              }
            );

            // Act
            await service.generate('plan-1');

            // Compute expected
            const expectedNet = Math.max(0, ingredientQty - pantryQty);

            // The ingredient is always present (fully-covered items stay with
            // net 0 so they can be shown as "already at home"), with the net
            // quantity clamped at 0.
            expect(capturedItems).toHaveLength(1);
            const item = capturedItems[0];
            expect(item.ingredientId).toBe(ingredientId);
            expect(item.netQuantity).toBeCloseTo(expectedNet, 5);
            expect(item.pantryQuantityDeducted).toBeCloseTo(
              Math.min(pantryQty, ingredientQty),
              5
            );
            if (expectedNet === 0) {
              expect(item.purchaseUnits).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 19: Shopping list grouped by category and sorted alphabetically within groups
   * Feature: platoplan, Property 19: Shopping list grouped by category and sorted alphabetically within groups
   *
   * For any generated shopping list with multiple items, items are grouped by
   * ingredient category and sorted alphabetically by name within each group.
   *
   * **Validates: Requirements 6.7**
   */
  describe('Property 19: Shopping list grouped by category and sorted alphabetically within groups', () => {
    it('items are ordered by category then alphabetically by name within category', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 3-6 ingredients
          fc.integer({ min: 3, max: 6 }),
          // Generate categories for each ingredient (up to 6)
          fc.array(arbCategory, { minLength: 6, maxLength: 6 }),
          async (numIngredients, categories) => {
            resetMocks();

            // Use fixed names that are easily sortable
            const names = ['Arroz', 'Banana', 'Cebolla', 'Durazno', 'Espinaca', 'Fresa'];
            const ingredientMap = new Map<string, Ingredient>();

            for (let i = 0; i < numIngredients; i++) {
              const id = `ing-${i}`;
              const ing = buildIngredient(id, names[i], categories[i], 100);
              ingredientMap.set(id, ing);
            }

            // Single recipe that uses all these ingredients
            const ingredientIds = Array.from(ingredientMap.keys());
            const recipe: Recipe = {
              id: 'recipe-1',
              name: 'Multi-Ingredient Recipe',
              mealType: 'comida',
              prepTime: 'rapido',
              ingredients: ingredientIds.map((id) => ({ ingredientId: id, quantity: 50 })),
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const plan: MenuPlan = {
              id: 'plan-1',
              periodDays: 1,
              startDate: new Date(),
              status: 'confirmed',
              elaborateDays: [],
              assignments: [
                { id: 'a-1', planId: 'plan-1', dayIndex: 0, slot: 'comida', recipeId: 'recipe-1' },
              ],
              freeDays: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Setup mocks
            vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);
            vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);
            mockPantryRepo.getByIngredientId.mockResolvedValue(null);
            mockIngredientRepo.getById.mockImplementation(async (id: string) =>
              ingredientMap.get(id) ?? null
            );

            let capturedItems: CreateShoppingListItemInput[] = [];
            mockShoppingListRepo.create.mockImplementation(
              async (_planId: string, items: CreateShoppingListItemInput[]) => {
                capturedItems = items;
                return {
                  id: 'list-1',
                  planId: _planId,
                  items: items.map((item, idx) => ({
                    id: `item-${idx}`,
                    listId: 'list-1',
                    ...item,
                    isManuallyEdited: false,
                    isRemoved: false,
                  })),
                  generatedAt: new Date(),
                  isStale: false,
                };
              }
            );

            // Act
            await service.generate('plan-1');

            // Assert: all ingredients present
            expect(capturedItems.length).toBe(numIngredients);

            // Assert: items are sorted by category, then by name within category
            for (let i = 1; i < capturedItems.length; i++) {
              const prevIng = ingredientMap.get(capturedItems[i - 1].ingredientId)!;
              const currIng = ingredientMap.get(capturedItems[i].ingredientId)!;

              const catCompare = prevIng.category.localeCompare(currIng.category);

              if (catCompare === 0) {
                // Same category: name should be in ascending alphabetical order
                expect(prevIng.name.localeCompare(currIng.name)).toBeLessThanOrEqual(0);
              } else {
                // Different category: categories should be in ascending order
                expect(catCompare).toBeLessThan(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 20: Plan modification marks shopping list as stale
   * Feature: platoplan, Property 20: Plan modification marks shopping list as stale
   *
   * For any menu plan with an associated shopping list, modifying the plan
   * causes isStale = true.
   *
   * **Validates: Requirements 6.9**
   */
  describe('Property 20: Plan modification marks shopping list as stale', () => {
    it('markPlanModified calls markStale on the repository when a list exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^plan-[a-z0-9]{1,8}$/),
          fc.stringMatching(/^list-[a-z0-9]{1,8}$/),
          async (planId, listId) => {
            resetMocks();

            // Setup: shopping list exists for this plan
            const existingList: ShoppingList = {
              id: listId,
              planId,
              items: [],
              generatedAt: new Date(),
              isStale: false,
            };

            mockShoppingListRepo.getByPlanId.mockResolvedValue(existingList);
            mockShoppingListRepo.markStale.mockResolvedValue(undefined);

            // Act
            await service.markPlanModified(planId);

            // Assert: markStale was called with the list's ID
            expect(mockShoppingListRepo.markStale).toHaveBeenCalledWith(listId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('markPlanModified is a no-op when no shopping list exists for the plan', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^plan-[a-z0-9]{1,8}$/),
          async (planId) => {
            resetMocks();

            // Setup: no shopping list for this plan
            mockShoppingListRepo.getByPlanId.mockResolvedValue(null);

            // Act
            await service.markPlanModified(planId);

            // Assert: markStale was NOT called
            expect(mockShoppingListRepo.markStale).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
