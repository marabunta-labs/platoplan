/**
 * Unit tests for ShoppingListService
 * Tests shopping list generation, pantry deduction, purchase unit calculation,
 * and category-based sorting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShoppingListService } from '../shopping-list.service';
import type { MenuPlan, Recipe, Ingredient, ShoppingList } from '../../models/types';

// Mock plan repository
vi.mock('../../repositories/plan.repository', () => ({
  getPlanById: vi.fn(),
}));

// Mock recipe repository
vi.mock('../../repositories/recipe.repository', () => ({
  getById: vi.fn(),
}));

// Mock the repositories that are instantiated in the constructor
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

vi.mock('../../repositories/shopping-list.repository', () => ({
  ShoppingListRepository: class {
    create = mockShoppingListRepo.create;
    getByPlanId = mockShoppingListRepo.getByPlanId;
    update = mockShoppingListRepo.update;
    markStale = mockShoppingListRepo.markStale;
    editQuantity = mockShoppingListRepo.editQuantity;
    removeItem = mockShoppingListRepo.removeItem;
  },
}));

vi.mock('../../repositories/pantry.repository', () => ({
  PantryRepository: class {
    addOrUpdate = mockPantryRepo.addOrUpdate;
    remove = mockPantryRepo.remove;
    getAll = mockPantryRepo.getAll;
    getByIngredientId = mockPantryRepo.getByIngredientId;
  },
}));

vi.mock('../../repositories/ingredient.repository', () => ({
  IngredientRepository: class {
    create = mockIngredientRepo.create;
    update = mockIngredientRepo.update;
    delete = mockIngredientRepo.delete;
    getById = mockIngredientRepo.getById;
    getAll = mockIngredientRepo.getAll;
    search = mockIngredientRepo.search;
    getRecipesUsingIngredient = mockIngredientRepo.getRecipesUsingIngredient;
  },
}));

import * as planRepository from '../../repositories/plan.repository';
import * as recipeRepository from '../../repositories/recipe.repository';

// Helper factories
function makeIngredient(overrides: Partial<Ingredient> & { id: string; name: string }): Ingredient {
  return {
    unit: 'gramos',
    purchaseFormat: { description: 'paquete 500g', quantity: 500 },
    category: 'otros',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRecipe(
  id: string,
  name: string,
  ingredients: { ingredientId: string; quantity: number }[]
): Recipe {
  return {
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
  };
}

function makePlan(planId: string, recipeIds: string[]): MenuPlan {
  return {
    id: planId,
    periodDays: 7,
    startDate: new Date(),
    status: 'confirmed',
    elaborateDays: [5, 6],
    assignments: recipeIds.map((recipeId, index) => ({
      id: `assignment-${index}`,
      planId,
      dayIndex: index,
      slot: 'comida' as const,
      recipeId,
    })),
    freeDays: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ShoppingListService', () => {
  let service: ShoppingListService;
  const mockDb = {
    getFirstAsync: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ShoppingListService(mockDb);
  });

  describe('generate', () => {
    it('should throw error when plan is not found', async () => {
      vi.mocked(planRepository.getPlanById).mockResolvedValue(null);

      await expect(service.generate('non-existent')).rejects.toThrow(
        'Plan not found: non-existent'
      );
    });

    it('should generate empty list when plan has no assignments', async () => {
      const plan = makePlan('plan-1', []);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const expectedList: ShoppingList = {
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      };
      mockShoppingListRepo.create.mockResolvedValue(expectedList);

      const result = await service.generate('plan-1');

      expect(mockShoppingListRepo.create).toHaveBeenCalledWith('plan-1', []);
      expect(result).toEqual(expectedList);
    });

    it('should aggregate quantities for same ingredient across multiple recipes', async () => {
      const plan = makePlan('plan-1', ['recipe-1', 'recipe-2']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      // Both recipes use the same ingredient (tomato) with different quantities
      const recipe1 = makeRecipe('recipe-1', 'Salsa', [
        { ingredientId: 'ing-tomato', quantity: 200 },
      ]);
      const recipe2 = makeRecipe('recipe-2', 'Ensalada', [
        { ingredientId: 'ing-tomato', quantity: 300 },
      ]);
      vi.mocked(recipeRepository.getById)
        .mockResolvedValueOnce(recipe1)
        .mockResolvedValueOnce(recipe2);

      // No pantry stock
      mockPantryRepo.getByIngredientId.mockResolvedValue(null);

      // Ingredient with purchase format
      const tomato = makeIngredient({
        id: 'ing-tomato',
        name: 'Tomate',
        purchaseFormat: { description: 'kg', quantity: 1000 },
        category: 'verduras',
      });
      mockIngredientRepo.getById.mockResolvedValue(tomato);

      const expectedList: ShoppingList = {
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      };
      mockShoppingListRepo.create.mockResolvedValue(expectedList);

      await service.generate('plan-1');

      // Total needed: 200 + 300 = 500g, purchase format: 1000g, ceil(500/1000) = 1
      expect(mockShoppingListRepo.create).toHaveBeenCalledWith('plan-1', [
        {
          ingredientId: 'ing-tomato',
          totalQuantityNeeded: 500,
          pantryQuantityDeducted: 0,
          netQuantity: 500,
          purchaseUnits: 1,
        },
      ]);
    });

    it('should aggregate same recipe appearing multiple times in plan', async () => {
      // Same recipe assigned twice (repetition)
      const plan = makePlan('plan-1', ['recipe-1', 'recipe-1']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const recipe = makeRecipe('recipe-1', 'Pasta', [
        { ingredientId: 'ing-pasta', quantity: 250 },
      ]);
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      mockPantryRepo.getByIngredientId.mockResolvedValue(null);

      const pasta = makeIngredient({
        id: 'ing-pasta',
        name: 'Pasta',
        purchaseFormat: { description: 'paquete 500g', quantity: 500 },
        category: 'cereales',
      });
      mockIngredientRepo.getById.mockResolvedValue(pasta);

      mockShoppingListRepo.create.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.generate('plan-1');

      // 250 * 2 = 500, ceil(500/500) = 1
      expect(mockShoppingListRepo.create).toHaveBeenCalledWith('plan-1', [
        {
          ingredientId: 'ing-pasta',
          totalQuantityNeeded: 500,
          pantryQuantityDeducted: 0,
          netQuantity: 500,
          purchaseUnits: 1,
        },
      ]);
    });

    it('should apply pantry deduction: netQuantity = max(0, totalNeeded - pantryAvailable)', async () => {
      const plan = makePlan('plan-1', ['recipe-1']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const recipe = makeRecipe('recipe-1', 'Arroz', [
        { ingredientId: 'ing-rice', quantity: 400 },
      ]);
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      // Pantry has 150g of rice
      mockPantryRepo.getByIngredientId.mockResolvedValue({
        id: 'pantry-1',
        ingredientId: 'ing-rice',
        quantity: 150,
        updatedAt: new Date(),
      });

      const rice = makeIngredient({
        id: 'ing-rice',
        name: 'Arroz',
        purchaseFormat: { description: 'paquete 1kg', quantity: 1000 },
        category: 'cereales',
      });
      mockIngredientRepo.getById.mockResolvedValue(rice);

      mockShoppingListRepo.create.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.generate('plan-1');

      // net = max(0, 400 - 150) = 250, ceil(250/1000) = 1
      expect(mockShoppingListRepo.create).toHaveBeenCalledWith('plan-1', [
        {
          ingredientId: 'ing-rice',
          totalQuantityNeeded: 400,
          pantryQuantityDeducted: 150,
          netQuantity: 250,
          purchaseUnits: 1,
        },
      ]);
    });

    it('should keep fully-covered ingredient with net 0 (shown as "already at home")', async () => {
      const plan = makePlan('plan-1', ['recipe-1']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const recipe = makeRecipe('recipe-1', 'Tortilla', [
        { ingredientId: 'ing-eggs', quantity: 6 },
        { ingredientId: 'ing-potato', quantity: 500 },
      ]);
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      // Pantry has enough eggs but not enough potatoes
      mockPantryRepo.getByIngredientId
        .mockResolvedValueOnce({
          id: 'p1',
          ingredientId: 'ing-eggs',
          quantity: 12, // More than needed
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'p2',
          ingredientId: 'ing-potato',
          quantity: 200, // Less than needed
          updatedAt: new Date(),
        });

      const eggs = makeIngredient({
        id: 'ing-eggs',
        name: 'Huevos',
        unit: 'unidades',
        purchaseFormat: { description: 'docena', quantity: 12 },
        category: 'huevos y lácteos',
      });
      const potato = makeIngredient({
        id: 'ing-potato',
        name: 'Patata',
        purchaseFormat: { description: 'malla 2kg', quantity: 2000 },
        category: 'verduras',
      });
      // Ingredients are looked up in calculateShoppingItems and again in sorting.
      mockIngredientRepo.getById.mockImplementation(async (id: string) =>
        id === 'ing-eggs' ? eggs : id === 'ing-potato' ? potato : null
      );

      mockShoppingListRepo.create.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.generate('plan-1');

      // Both ingredients appear. The fully-covered one (eggs) stays with
      // netQuantity 0 / purchaseUnits 0 so it can be shown as "Todo listo",
      // while the partially-covered one (potato) still needs buying.
      const createCall = mockShoppingListRepo.create.mock.calls[0];
      expect(createCall[1]).toHaveLength(2);

      const eggsItem = createCall[1].find((i: any) => i.ingredientId === 'ing-eggs');
      const potatoItem = createCall[1].find((i: any) => i.ingredientId === 'ing-potato');

      expect(eggsItem).toBeDefined();
      expect(eggsItem.netQuantity).toBe(0);
      expect(eggsItem.purchaseUnits).toBe(0);

      expect(potatoItem).toBeDefined();
      expect(potatoItem.netQuantity).toBe(300); // 500 needed - 200 pantry
      expect(potatoItem.purchaseUnits).toBe(1); // ceil(300 / 2000)
    });

    it('should calculate purchaseUnits = ceil(netQuantity / purchaseFormat.quantity)', async () => {
      const plan = makePlan('plan-1', ['recipe-1']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const recipe = makeRecipe('recipe-1', 'Gazpacho', [
        { ingredientId: 'ing-oil', quantity: 750 },
      ]);
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      mockPantryRepo.getByIngredientId.mockResolvedValue(null);

      // Oil is sold in 1L bottles (1000ml)
      const oil = makeIngredient({
        id: 'ing-oil',
        name: 'Aceite de oliva',
        unit: 'mililitros',
        purchaseFormat: { description: 'botella 1L', quantity: 1000 },
        category: 'aceites',
      });
      mockIngredientRepo.getById.mockResolvedValue(oil);

      mockShoppingListRepo.create.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.generate('plan-1');

      // ceil(750 / 1000) = 1 bottle
      expect(mockShoppingListRepo.create).toHaveBeenCalledWith('plan-1', [
        expect.objectContaining({
          netQuantity: 750,
          purchaseUnits: 1,
        }),
      ]);
    });

    it('should round up purchase units when not exactly divisible', async () => {
      const plan = makePlan('plan-1', ['recipe-1']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const recipe = makeRecipe('recipe-1', 'Pan con leche', [
        { ingredientId: 'ing-milk', quantity: 1500 },
      ]);
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      mockPantryRepo.getByIngredientId.mockResolvedValue(null);

      // Milk sold in 1L bricks (1000ml each)
      const milk = makeIngredient({
        id: 'ing-milk',
        name: 'Leche',
        unit: 'mililitros',
        purchaseFormat: { description: 'brick 1L', quantity: 1000 },
        category: 'lácteos',
      });
      mockIngredientRepo.getById.mockResolvedValue(milk);

      mockShoppingListRepo.create.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.generate('plan-1');

      // ceil(1500 / 1000) = 2 bricks
      expect(mockShoppingListRepo.create).toHaveBeenCalledWith('plan-1', [
        expect.objectContaining({
          netQuantity: 1500,
          purchaseUnits: 2,
        }),
      ]);
    });

    it('should group items by category and sort alphabetically within groups', async () => {
      const plan = makePlan('plan-1', ['recipe-1']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const recipe = makeRecipe('recipe-1', 'Completo', [
        { ingredientId: 'ing-tomato', quantity: 200 },
        { ingredientId: 'ing-apple', quantity: 3 },
        { ingredientId: 'ing-carrot', quantity: 300 },
        { ingredientId: 'ing-banana', quantity: 2 },
      ]);
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      mockPantryRepo.getByIngredientId.mockResolvedValue(null);

      const tomato = makeIngredient({
        id: 'ing-tomato',
        name: 'Tomate',
        purchaseFormat: { description: 'kg', quantity: 1000 },
        category: 'verduras',
      });
      const apple = makeIngredient({
        id: 'ing-apple',
        name: 'Manzana',
        unit: 'unidades',
        purchaseFormat: { description: 'bolsa', quantity: 6 },
        category: 'frutas',
      });
      const carrot = makeIngredient({
        id: 'ing-carrot',
        name: 'Zanahoria',
        purchaseFormat: { description: 'manojo', quantity: 500 },
        category: 'verduras',
      });
      const banana = makeIngredient({
        id: 'ing-banana',
        name: 'Plátano',
        unit: 'unidades',
        purchaseFormat: { description: 'manojo', quantity: 6 },
        category: 'frutas',
      });

      // getById is called in calculateShoppingItems for each ingredient,
      // then again in sortItemsByCategoryAndName
      mockIngredientRepo.getById
        .mockImplementation(async (id: string) => {
          const map: Record<string, Ingredient> = {
            'ing-tomato': tomato,
            'ing-apple': apple,
            'ing-carrot': carrot,
            'ing-banana': banana,
          };
          return map[id] ?? null;
        });

      mockShoppingListRepo.create.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.generate('plan-1');

      const createCall = mockShoppingListRepo.create.mock.calls[0];
      const items = createCall[1];

      // Should be sorted: frutas (Manzana, Plátano), then verduras (Tomate, Zanahoria)
      expect(items[0].ingredientId).toBe('ing-apple'); // Manzana (frutas)
      expect(items[1].ingredientId).toBe('ing-banana'); // Plátano (frutas)
      expect(items[2].ingredientId).toBe('ing-tomato'); // Tomate (verduras)
      expect(items[3].ingredientId).toBe('ing-carrot'); // Zanahoria (verduras)
    });

    it('should record pantryQuantityDeducted as min(pantryAvailable, totalNeeded)', async () => {
      const plan = makePlan('plan-1', ['recipe-1']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const recipe = makeRecipe('recipe-1', 'Sopa', [
        { ingredientId: 'ing-salt', quantity: 30 },
      ]);
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      // Pantry has 10g of salt (less than needed)
      mockPantryRepo.getByIngredientId.mockResolvedValue({
        id: 'p1',
        ingredientId: 'ing-salt',
        quantity: 10,
        updatedAt: new Date(),
      });

      const salt = makeIngredient({
        id: 'ing-salt',
        name: 'Sal',
        purchaseFormat: { description: 'paquete 1kg', quantity: 1000 },
        category: 'especias',
      });
      mockIngredientRepo.getById.mockResolvedValue(salt);

      mockShoppingListRepo.create.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.generate('plan-1');

      expect(mockShoppingListRepo.create).toHaveBeenCalledWith('plan-1', [
        expect.objectContaining({
          totalQuantityNeeded: 30,
          pantryQuantityDeducted: 10,
          netQuantity: 20,
        }),
      ]);
    });

    it('should skip recipes that are not found', async () => {
      const plan = makePlan('plan-1', ['recipe-1', 'recipe-missing']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      const recipe = makeRecipe('recipe-1', 'Tortilla', [
        { ingredientId: 'ing-egg', quantity: 6 },
      ]);
      vi.mocked(recipeRepository.getById)
        .mockResolvedValueOnce(recipe)
        .mockResolvedValueOnce(null); // Missing recipe

      mockPantryRepo.getByIngredientId.mockResolvedValue(null);

      const egg = makeIngredient({
        id: 'ing-egg',
        name: 'Huevo',
        unit: 'unidades',
        purchaseFormat: { description: 'docena', quantity: 12 },
        category: 'huevos',
      });
      mockIngredientRepo.getById.mockResolvedValue(egg);

      mockShoppingListRepo.create.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.generate('plan-1');

      // Should only have the egg from recipe-1
      const createCall = mockShoppingListRepo.create.mock.calls[0];
      expect(createCall[1]).toHaveLength(1);
      expect(createCall[1][0].ingredientId).toBe('ing-egg');
    });
  });

  describe('editQuantity', () => {
    it('should call repository editQuantity and return updated list', async () => {
      mockShoppingListRepo.editQuantity.mockResolvedValue(undefined);
      mockDb.getFirstAsync.mockResolvedValue({ plan_id: 'plan-1' });

      const updatedList: ShoppingList = {
        id: 'list-1',
        planId: 'plan-1',
        items: [
          {
            id: 'item-1',
            listId: 'list-1',
            ingredientId: 'ing-1',
            totalQuantityNeeded: 500,
            pantryQuantityDeducted: 0,
            netQuantity: 500,
            purchaseUnits: 3,
            isManuallyEdited: true,
            isRemoved: false,
          },
        ],
        generatedAt: new Date(),
        isStale: false,
      };
      mockShoppingListRepo.getByPlanId.mockResolvedValue(updatedList);

      const result = await service.editQuantity('list-1', 'item-1', 3);

      expect(mockShoppingListRepo.editQuantity).toHaveBeenCalledWith('item-1', 3);
      expect(result).toEqual(updatedList);
    });

    it('should throw error when list is not found', async () => {
      mockShoppingListRepo.editQuantity.mockResolvedValue(undefined);
      mockDb.getFirstAsync.mockResolvedValue(null);

      await expect(service.editQuantity('non-existent', 'item-1', 3)).rejects.toThrow(
        'Shopping list not found: non-existent'
      );
    });

    it('should accept quantity of 0 (marking an item as fully covered / not needed)', async () => {
      mockShoppingListRepo.editQuantity.mockResolvedValue(undefined);
      mockDb.getFirstAsync.mockResolvedValue({ plan_id: 'plan-1' });
      mockShoppingListRepo.getByPlanId.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.editQuantity('list-1', 'item-1', 0);
      expect(mockShoppingListRepo.editQuantity).toHaveBeenCalledWith('item-1', 0);
    });

    it('should throw ValidationError when quantity is negative', async () => {
      try {
        await service.editQuantity('list-1', 'item-1', -1);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe('validation');
        expect(error.fields).toEqual([
          { field: 'quantity', message: 'Quantity must be an integer between 0 and 999' },
        ]);
      }
      // Should not call repo
      expect(mockShoppingListRepo.editQuantity).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when quantity is greater than 999', async () => {
      try {
        await service.editQuantity('list-1', 'item-1', 1000);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe('validation');
        expect(error.fields).toEqual([
          { field: 'quantity', message: 'Quantity must be an integer between 0 and 999' },
        ]);
      }
      expect(mockShoppingListRepo.editQuantity).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when quantity is not an integer', async () => {
      try {
        await service.editQuantity('list-1', 'item-1', 2.5);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe('validation');
        expect(error.fields).toEqual([
          { field: 'quantity', message: 'Quantity must be an integer between 0 and 999' },
        ]);
      }
      expect(mockShoppingListRepo.editQuantity).not.toHaveBeenCalled();
    });

    it('should accept quantity of 1 (lower boundary)', async () => {
      mockShoppingListRepo.editQuantity.mockResolvedValue(undefined);
      mockDb.getFirstAsync.mockResolvedValue({ plan_id: 'plan-1' });
      mockShoppingListRepo.getByPlanId.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.editQuantity('list-1', 'item-1', 1);
      expect(mockShoppingListRepo.editQuantity).toHaveBeenCalledWith('item-1', 1);
    });

    it('should accept quantity of 999 (upper boundary)', async () => {
      mockShoppingListRepo.editQuantity.mockResolvedValue(undefined);
      mockDb.getFirstAsync.mockResolvedValue({ plan_id: 'plan-1' });
      mockShoppingListRepo.getByPlanId.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      });

      await service.editQuantity('list-1', 'item-1', 999);
      expect(mockShoppingListRepo.editQuantity).toHaveBeenCalledWith('item-1', 999);
    });

    it('should throw ValidationError for negative quantity', async () => {
      try {
        await service.editQuantity('list-1', 'item-1', -5);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe('validation');
        expect(error.fields[0].field).toBe('quantity');
      }
      expect(mockShoppingListRepo.editQuantity).not.toHaveBeenCalled();
    });
  });

  describe('removeItem', () => {
    it('should call repository removeItem and return updated list', async () => {
      mockShoppingListRepo.removeItem.mockResolvedValue(undefined);
      mockDb.getFirstAsync.mockResolvedValue({ plan_id: 'plan-1' });

      const updatedList: ShoppingList = {
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      };
      mockShoppingListRepo.getByPlanId.mockResolvedValue(updatedList);

      const result = await service.removeItem('list-1', 'item-1');

      expect(mockShoppingListRepo.removeItem).toHaveBeenCalledWith('item-1');
      expect(result).toEqual(updatedList);
    });

    it('should throw error when list is not found', async () => {
      mockShoppingListRepo.removeItem.mockResolvedValue(undefined);
      mockDb.getFirstAsync.mockResolvedValue(null);

      await expect(service.removeItem('non-existent', 'item-1')).rejects.toThrow(
        'Shopping list not found: non-existent'
      );
    });
  });

  describe('getByPlanId', () => {
    it('should return shopping list when it exists', async () => {
      const list: ShoppingList = {
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      };
      mockShoppingListRepo.getByPlanId.mockResolvedValue(list);

      const result = await service.getByPlanId('plan-1');

      expect(result).toEqual(list);
    });

    it('should return null when no list exists for plan', async () => {
      mockShoppingListRepo.getByPlanId.mockResolvedValue(null);

      const result = await service.getByPlanId('plan-no-list');

      expect(result).toBeNull();
    });
  });

  describe('regenerate', () => {
    it('should regenerate shopping list with fresh calculations', async () => {
      // Existing list
      mockDb.getFirstAsync.mockResolvedValue({ plan_id: 'plan-1' });
      mockShoppingListRepo.getByPlanId.mockResolvedValue({
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: true,
      });

      // Plan
      const plan = makePlan('plan-1', ['recipe-1']);
      vi.mocked(planRepository.getPlanById).mockResolvedValue(plan);

      // Recipe
      const recipe = makeRecipe('recipe-1', 'Sopa', [
        { ingredientId: 'ing-1', quantity: 200 },
      ]);
      vi.mocked(recipeRepository.getById).mockResolvedValue(recipe);

      // No pantry
      mockPantryRepo.getByIngredientId.mockResolvedValue(null);

      // Ingredient
      const ingredient = makeIngredient({
        id: 'ing-1',
        name: 'Cebolla',
        purchaseFormat: { description: 'malla', quantity: 1000 },
        category: 'verduras',
      });
      mockIngredientRepo.getById.mockResolvedValue(ingredient);

      const updatedList: ShoppingList = {
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      };
      mockShoppingListRepo.update.mockResolvedValue(updatedList);

      const result = await service.regenerate('list-1');

      expect(mockShoppingListRepo.update).toHaveBeenCalledWith('list-1', [
        expect.objectContaining({
          ingredientId: 'ing-1',
          totalQuantityNeeded: 200,
          netQuantity: 200,
          purchaseUnits: 1,
        }),
      ]);
      expect(result).toEqual(updatedList);
    });

    it('should throw error when list is not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await expect(service.regenerate('non-existent')).rejects.toThrow(
        'Shopping list not found: non-existent'
      );
    });

    it('should rebuild from existing items when the plan is missing (custom lists / deleted plan)', async () => {
      // Custom lists use a virtual/ghost plan that may not resolve to a real
      // plan with assignments. In that case regenerate must reconstruct the
      // aggregate from the list's own items instead of throwing.
      mockDb.getFirstAsync.mockResolvedValue({ plan_id: 'custom_list_current' });
      mockShoppingListRepo.getByPlanId.mockResolvedValue({
        id: 'list-1',
        planId: 'custom_list_current',
        items: [
          {
            id: 'item-1',
            listId: 'list-1',
            ingredientId: 'ing-1',
            totalQuantityNeeded: 300,
            pantryQuantityDeducted: 0,
            netQuantity: 300,
            purchaseUnits: 1,
            isManuallyEdited: false,
            isRemoved: false,
          },
        ],
        generatedAt: new Date(),
        isStale: true,
      });
      vi.mocked(planRepository.getPlanById).mockResolvedValue(null);
      mockPantryRepo.getByIngredientId.mockResolvedValue(null);
      const ing1 = makeIngredient({ id: 'ing-1', name: 'Ingrediente', purchaseFormat: { description: 'paquete', quantity: 250 } });
      mockIngredientRepo.getById.mockResolvedValue(ing1);
      const updatedList = { id: 'list-1', planId: 'custom_list_current', items: [], generatedAt: new Date(), isStale: false };
      mockShoppingListRepo.update.mockResolvedValue(updatedList);

      await service.regenerate('list-1');

      // It rebuilds from the existing item's totalQuantityNeeded (300) instead of throwing.
      expect(mockShoppingListRepo.update).toHaveBeenCalledWith('list-1', [
        expect.objectContaining({
          ingredientId: 'ing-1',
          totalQuantityNeeded: 300,
          netQuantity: 300,
          purchaseUnits: 2, // ceil(300 / 250)
        }),
      ]);
    });
  });

  describe('markPlanModified', () => {
    it('should mark shopping list as stale when a list exists for the plan', async () => {
      const existingList: ShoppingList = {
        id: 'list-1',
        planId: 'plan-1',
        items: [],
        generatedAt: new Date(),
        isStale: false,
      };
      mockShoppingListRepo.getByPlanId.mockResolvedValue(existingList);
      mockShoppingListRepo.markStale.mockResolvedValue(undefined);

      await service.markPlanModified('plan-1');

      expect(mockShoppingListRepo.getByPlanId).toHaveBeenCalledWith('plan-1');
      expect(mockShoppingListRepo.markStale).toHaveBeenCalledWith('list-1');
    });

    it('should do nothing when no shopping list exists for the plan', async () => {
      mockShoppingListRepo.getByPlanId.mockResolvedValue(null);

      await service.markPlanModified('plan-no-list');

      expect(mockShoppingListRepo.getByPlanId).toHaveBeenCalledWith('plan-no-list');
      expect(mockShoppingListRepo.markStale).not.toHaveBeenCalled();
    });
  });
});
