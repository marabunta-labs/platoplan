/**
 * Integration tests for PlatoPlan end-to-end workflows.
 *
 * Since we cannot use the actual SQLite database (native module) in vitest,
 * these tests verify that the service layer composes correctly by mocking
 * the repository layer with in-memory Maps that simulate persistence.
 *
 * Validates: Requirements 7.2, 7.3, 7.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Ingredient, Recipe, PantryEntry, MenuPlan, ShoppingList } from '../models/types';
import type { CreateIngredientInput, CreateRecipeInput, PlanConfig } from '../models/inputs';
import type { ValidationError, ConflictError, ConstraintError } from '../models/errors';

// ─── In-memory stores that simulate persistence ────────────────────────────────

let ingredientStore: Map<string, Ingredient>;
let recipeStore: Map<string, Recipe>;
let pantryStore: Map<string, PantryEntry>;
let planStore: Map<string, MenuPlan>;
let shoppingListStore: Map<string, ShoppingList>;
let idCounter: number;

function generateId(): string {
  return `id-${++idCounter}`;
}

// ─── Mock setup ────────────────────────────────────────────────────────────────

// Mock database utilities
vi.mock('../database/database', () => ({
  withTransaction: vi.fn(
    async (_db: unknown, callback: (db: unknown) => Promise<unknown>) => {
      return callback(_db);
    }
  ),
  generateId: vi.fn(() => `id-${++idCounter}`),
}));

// Mock expo-sqlite
vi.mock('expo-sqlite', () => ({}));

// ─── Ingredient Repository Mock ────────────────────────────────────────────────

const mockIngredientRepo = {
  create: vi.fn(async (input: CreateIngredientInput): Promise<Ingredient> => {
    const id = generateId();
    const now = new Date();
    const ingredient: Ingredient = {
      id,
      name: input.name,
      unit: input.unit,
      purchaseFormat: input.purchaseFormat,
      category: input.category,
      createdAt: now,
      updatedAt: now,
    };
    ingredientStore.set(id, ingredient);
    return ingredient;
  }),
  update: vi.fn(),
  delete: vi.fn(),
  getById: vi.fn(async (id: string): Promise<Ingredient | null> => {
    return ingredientStore.get(id) ?? null;
  }),
  getAll: vi.fn(async (): Promise<Ingredient[]> => {
    return Array.from(ingredientStore.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }),
  search: vi.fn(async (query: string): Promise<Ingredient[]> => {
    const lower = query.toLowerCase();
    return Array.from(ingredientStore.values()).filter((i) =>
      i.name.toLowerCase().includes(lower)
    );
  }),
  getRecipesUsingIngredient: vi.fn(async (): Promise<string[]> => []),
};

vi.mock('../repositories/ingredient.repository', () => ({
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

// ─── Recipe Repository Mock ────────────────────────────────────────────────────

vi.mock('../repositories/recipe.repository', () => ({
  create: vi.fn(async (_db: unknown, input: CreateRecipeInput): Promise<Recipe> => {
    const id = generateId();
    const now = new Date();
    const recipe: Recipe = {
      id,
      name: input.name.trim(),
      mealType: input.mealType,
      prepTime: input.prepTime,
      ingredients: input.ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        quantity: i.quantity,
      })),
      createdAt: now,
      updatedAt: now,
    };
    recipeStore.set(id, recipe);
    return recipe;
  }),
  update: vi.fn(),
  deleteById: vi.fn(),
  getById: vi.fn(async (_db: unknown, id: string): Promise<Recipe | null> => {
    return recipeStore.get(id) ?? null;
  }),
  getAll: vi.fn(async (_db: unknown): Promise<Recipe[]> => {
    return Array.from(recipeStore.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }),
  getByMealType: vi.fn(async (_db: unknown, type: string): Promise<Recipe[]> => {
    return Array.from(recipeStore.values()).filter(
      (r) => r.mealType === type || r.mealType === 'ambas'
    );
  }),
  getCount: vi.fn(async (): Promise<number> => recipeStore.size),
  search: vi.fn(),
}));

// ─── Pantry Repository Mock ────────────────────────────────────────────────────

const mockPantryRepo = {
  addOrUpdate: vi.fn(async (ingredientId: string, quantity: number): Promise<PantryEntry> => {
    const existing = Array.from(pantryStore.values()).find(
      (e) => e.ingredientId === ingredientId
    );
    if (existing) {
      existing.quantity = quantity;
      existing.updatedAt = new Date();
      return existing;
    }
    const id = generateId();
    const entry: PantryEntry = {
      id,
      ingredientId,
      quantity,
      updatedAt: new Date(),
    };
    pantryStore.set(id, entry);
    return entry;
  }),
  remove: vi.fn(async (ingredientId: string) => {
    for (const [key, entry] of pantryStore) {
      if (entry.ingredientId === ingredientId) {
        pantryStore.delete(key);
        break;
      }
    }
  }),
  getAll: vi.fn(async (): Promise<PantryEntry[]> => {
    return Array.from(pantryStore.values());
  }),
  getByIngredientId: vi.fn(async (ingredientId: string): Promise<PantryEntry | null> => {
    return (
      Array.from(pantryStore.values()).find(
        (e) => e.ingredientId === ingredientId
      ) ?? null
    );
  }),
};

vi.mock('../repositories/pantry.repository', () => ({
  PantryRepository: class {
    addOrUpdate = mockPantryRepo.addOrUpdate;
    remove = mockPantryRepo.remove;
    getAll = mockPantryRepo.getAll;
    getByIngredientId = mockPantryRepo.getByIngredientId;
  },
}));

// ─── Plan Repository Mock ──────────────────────────────────────────────────────

vi.mock('../repositories/plan.repository', () => ({
  createPlan: vi.fn(async (_db: unknown, config: { periodDays: number; startDate: Date; elaborateDays?: number[] }): Promise<MenuPlan> => {
    const id = generateId();
    const now = new Date();
    const plan: MenuPlan = {
      id,
      periodDays: config.periodDays,
      startDate: config.startDate,
      status: 'draft',
      elaborateDays: config.elaborateDays ?? [5, 6],
      assignments: [],
      freeDays: [],
      createdAt: now,
      updatedAt: now,
    };
    planStore.set(id, plan);
    return plan;
  }),
  getPlanById: vi.fn(async (_db: unknown, id: string): Promise<MenuPlan | null> => {
    return planStore.get(id) ?? null;
  }),
  getActivePlan: vi.fn(async (): Promise<MenuPlan | null> => null),
  updatePlan: vi.fn(async (_db: unknown, id: string, changes: Record<string, unknown>) => {
    const plan = planStore.get(id);
    if (plan && changes.status) {
      plan.status = changes.status as 'draft' | 'confirmed';
    }
  }),
}));

// ─── Assignment Repository Mock ────────────────────────────────────────────────

vi.mock('../repositories/assignment.repository', () => ({
  createAssignment: vi.fn(async (_db: unknown, planId: string, dayIndex: number, slot: string, recipeId: string) => {
    const plan = planStore.get(planId);
    if (plan) {
      plan.assignments.push({
        id: generateId(),
        planId,
        dayIndex,
        slot: slot as 'comida' | 'cena',
        recipeId,
      });
    }
  }),
  addFreeDay: vi.fn(async (_db: unknown, planId: string, dayIndex: number, type: string) => {
    const plan = planStore.get(planId);
    if (plan) {
      plan.freeDays.push({
        id: generateId(),
        planId,
        dayIndex,
        type: type as 'comida' | 'cena' | 'ambas',
      });
    }
  }),
  swapAssignments: vi.fn(),
}));

// ─── Shopping List Repository Mock ─────────────────────────────────────────────

const mockShoppingListRepo = {
  create: vi.fn(async (planId: string, items: Array<{
    ingredientId: string;
    totalQuantityNeeded: number;
    pantryQuantityDeducted: number;
    netQuantity: number;
    purchaseUnits: number;
  }>): Promise<ShoppingList> => {
    const id = generateId();
    const list: ShoppingList = {
      id,
      planId,
      items: items.map((item) => ({
        id: generateId(),
        listId: id,
        ingredientId: item.ingredientId,
        totalQuantityNeeded: item.totalQuantityNeeded,
        pantryQuantityDeducted: item.pantryQuantityDeducted,
        netQuantity: item.netQuantity,
        purchaseUnits: item.purchaseUnits,
        isManuallyEdited: false,
        isRemoved: false,
      })),
      generatedAt: new Date(),
      isStale: false,
    };
    shoppingListStore.set(id, list);
    return list;
  }),
  getByPlanId: vi.fn(async (planId: string): Promise<ShoppingList | null> => {
    return (
      Array.from(shoppingListStore.values()).find(
        (l) => l.planId === planId
      ) ?? null
    );
  }),
  update: vi.fn(),
  markStale: vi.fn(async (listId: string) => {
    const list = shoppingListStore.get(listId);
    if (list) {
      list.isStale = true;
    }
  }),
  editQuantity: vi.fn(),
  removeItem: vi.fn(),
};

vi.mock('../repositories/shopping-list.repository', () => ({
  ShoppingListRepository: class {
    create = mockShoppingListRepo.create;
    getByPlanId = mockShoppingListRepo.getByPlanId;
    update = mockShoppingListRepo.update;
    markStale = mockShoppingListRepo.markStale;
    editQuantity = mockShoppingListRepo.editQuantity;
    removeItem = mockShoppingListRepo.removeItem;
  },
}));

// ─── Service imports (after mocks are set up) ──────────────────────────────────

import { IngredientService } from '../services/ingredient.service';
import { createRecipeService } from '../services/recipe.service';
import { PantryService } from '../services/pantry.service';
import { createPlanningService } from '../services/planning.service';
import { ShoppingListService } from '../services/shopping-list.service';
import { withRetry, classifyError } from '../utils/persistence';

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('Integration Tests - End-to-End Workflows', () => {
  const mockDb = {} as any;
  let ingredientService: IngredientService;
  let recipeService: ReturnType<typeof createRecipeService>;
  let pantryService: PantryService;
  let planningService: ReturnType<typeof createPlanningService>;
  let shoppingListService: ShoppingListService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset stores
    ingredientStore = new Map();
    recipeStore = new Map();
    pantryStore = new Map();
    planStore = new Map();
    shoppingListStore = new Map();
    idCounter = 0;

    // Initialize services
    ingredientService = new IngredientService(mockDb);
    recipeService = createRecipeService(mockDb);
    pantryService = new PantryService(mockDb);
    planningService = createPlanningService(mockDb);
    shoppingListService = new ShoppingListService(mockDb);
  });

  // ─── Test 1: Full workflow ─────────────────────────────────────────────────

  describe('Full workflow: recipes → ingredients → pantry → plan → shopping list', () => {
    it('should compose all services correctly in an end-to-end flow', async () => {
      // Step 1: Create ingredients via IngredientService
      const tomato = await ingredientService.create({
        name: 'Tomate',
        unit: 'gramos',
        purchaseFormat: { description: 'Bandeja 500g', quantity: 500 },
        category: 'Verduras',
      });
      expect(tomato.id).toBeDefined();
      expect(tomato.name).toBe('Tomate');

      const pasta = await ingredientService.create({
        name: 'Pasta',
        unit: 'gramos',
        purchaseFormat: { description: 'Paquete 500g', quantity: 500 },
        category: 'Cereales',
      });
      expect(pasta.id).toBeDefined();

      const aceite = await ingredientService.create({
        name: 'Aceite de oliva',
        unit: 'mililitros',
        purchaseFormat: { description: 'Botella 1L', quantity: 1000 },
        category: 'Aceites',
      });

      // Step 2: Create a recipe using those ingredients via RecipeService
      const recipeResult = await recipeService.create({
        name: 'Pasta con Tomate',
        mealType: 'comida',
        prepTime: 'rapido',
        ingredients: [
          { ingredientId: tomato.id, quantity: 200 },
          { ingredientId: pasta.id, quantity: 250 },
          { ingredientId: aceite.id, quantity: 30 },
        ],
      });
      expect(recipeResult.success).toBe(true);
      const recipe = recipeResult.success ? recipeResult.data : null;
      expect(recipe).not.toBeNull();
      expect(recipe!.name).toBe('Pasta con Tomate');
      expect(recipe!.ingredients).toHaveLength(3);

      // Step 3: Add some ingredients to pantry via PantryService
      await pantryService.addOrUpdate({
        id: '',
        ingredientId: tomato.id,
        quantity: 300, // User has 300g of tomato
        updatedAt: new Date(),
      });
      await pantryService.addOrUpdate({
        id: '',
        ingredientId: aceite.id,
        quantity: 500, // User has 500ml of olive oil
        updatedAt: new Date(),
      });

      // Verify pantry data
      const tomatoQty = await pantryService.getAvailableQuantity(tomato.id);
      expect(tomatoQty).toBe(300);

      // Step 4: Create a plan with the recipe assigned to 3 days (comida)
      const planConfig: PlanConfig = {
        periodDays: 3,
        startDate: new Date('2024-01-15'),
        freeDays: [],
        selectedLunchRecipes: [{ recipeId: recipe!.id, count: 3 }],
        selectedDinnerRecipes: [],
      };

      // Since our planning service requires matching counts, let's create a simpler plan
      // with the recipe selected 3 times for 3 days of lunches, no dinners required.
      // But planning service validates that dinner counts match too.
      // Let's use free days for all dinners to simplify.
      const simplePlanConfig: PlanConfig = {
        periodDays: 3,
        startDate: new Date('2024-01-15'),
        freeDays: [
          { dayIndex: 0, type: 'cena' },
          { dayIndex: 1, type: 'cena' },
          { dayIndex: 2, type: 'cena' },
        ],
        selectedLunchRecipes: [{ recipeId: recipe!.id, count: 3 }],
        selectedDinnerRecipes: [],
      };

      const planResult = await planningService.createPlan(simplePlanConfig);
      expect(planResult.success).toBe(true);
      const plan = planResult.success ? planResult.data : null;
      expect(plan).not.toBeNull();
      expect(plan!.periodDays).toBe(3);

      // Manually add assignments to the plan store (simulating distribution)
      plan!.assignments = [
        { id: generateId(), planId: plan!.id, dayIndex: 0, slot: 'comida', recipeId: recipe!.id },
        { id: generateId(), planId: plan!.id, dayIndex: 1, slot: 'comida', recipeId: recipe!.id },
        { id: generateId(), planId: plan!.id, dayIndex: 2, slot: 'comida', recipeId: recipe!.id },
      ];

      // Step 5: Generate shopping list via ShoppingListService
      const shoppingList = await shoppingListService.generate(plan!.id);
      expect(shoppingList).toBeDefined();
      expect(shoppingList.planId).toBe(plan!.id);

      // Step 6: Verify pantry deduction
      // Recipe uses 200g tomato * 3 = 600g total needed
      // Pantry has 300g tomato → net = 600 - 300 = 300g → ceil(300/500) = 1 purchase unit
      const tomatoItem = shoppingList.items.find(
        (item) => item.ingredientId === tomato.id
      );
      expect(tomatoItem).toBeDefined();
      expect(tomatoItem!.totalQuantityNeeded).toBe(600);
      expect(tomatoItem!.pantryQuantityDeducted).toBe(300);
      expect(tomatoItem!.netQuantity).toBe(300);
      expect(tomatoItem!.purchaseUnits).toBe(1);

      // Pasta: 250g * 3 = 750g total, no pantry → ceil(750/500) = 2 units
      const pastaItem = shoppingList.items.find(
        (item) => item.ingredientId === pasta.id
      );
      expect(pastaItem).toBeDefined();
      expect(pastaItem!.totalQuantityNeeded).toBe(750);
      expect(pastaItem!.netQuantity).toBe(750);
      expect(pastaItem!.purchaseUnits).toBe(2);

      // Aceite: 30ml * 3 = 90ml total, pantry has 500ml → fully covered, excluded
      const aceiteItem = shoppingList.items.find(
        (item) => item.ingredientId === aceite.id
      );
      expect(aceiteItem).toBeUndefined();
    });

    it('should handle multiple recipes sharing ingredients', async () => {
      // Create shared ingredient
      const arroz = await ingredientService.create({
        name: 'Arroz',
        unit: 'gramos',
        purchaseFormat: { description: 'Paquete 1kg', quantity: 1000 },
        category: 'Cereales',
      });

      const pollo = await ingredientService.create({
        name: 'Pollo',
        unit: 'gramos',
        purchaseFormat: { description: 'Bandeja 600g', quantity: 600 },
        category: 'Carnes',
      });

      const cebolla = await ingredientService.create({
        name: 'Cebolla',
        unit: 'gramos',
        purchaseFormat: { description: 'Malla 1kg', quantity: 1000 },
        category: 'Verduras',
      });

      // Recipe 1: Arroz con pollo (uses arroz + pollo)
      const recipe1Result = await recipeService.create({
        name: 'Arroz con Pollo',
        mealType: 'comida',
        prepTime: 'elaborado',
        ingredients: [
          { ingredientId: arroz.id, quantity: 300 },
          { ingredientId: pollo.id, quantity: 400 },
        ],
      });
      const recipe1 = recipe1Result.success ? recipe1Result.data : null;

      // Recipe 2: Arroz frito (uses arroz + cebolla)
      const recipe2Result = await recipeService.create({
        name: 'Arroz Frito',
        mealType: 'cena',
        prepTime: 'rapido',
        ingredients: [
          { ingredientId: arroz.id, quantity: 250 },
          { ingredientId: cebolla.id, quantity: 100 },
        ],
      });
      const recipe2 = recipe2Result.success ? recipe2Result.data : null;

      // Create a 2-day plan with both recipes
      const planConfig: PlanConfig = {
        periodDays: 2,
        startDate: new Date('2024-01-20'),
        freeDays: [
          { dayIndex: 1, type: 'comida' },
        ],
        selectedLunchRecipes: [{ recipeId: recipe1!.id, count: 1 }],
        selectedDinnerRecipes: [{ recipeId: recipe2!.id, count: 2 }],
      };

      const planResult = await planningService.createPlan(planConfig);
      expect(planResult.success).toBe(true);
      const plan = planResult.success ? planResult.data : null;

      // Add assignments
      plan!.assignments = [
        { id: generateId(), planId: plan!.id, dayIndex: 0, slot: 'comida', recipeId: recipe1!.id },
        { id: generateId(), planId: plan!.id, dayIndex: 0, slot: 'cena', recipeId: recipe2!.id },
        { id: generateId(), planId: plan!.id, dayIndex: 1, slot: 'cena', recipeId: recipe2!.id },
      ];

      // Generate shopping list
      const shoppingList = await shoppingListService.generate(plan!.id);

      // Arroz: 300 (recipe1 x 1) + 250 (recipe2 x 2) = 800g → ceil(800/1000) = 1 unit
      const arrozItem = shoppingList.items.find(
        (item) => item.ingredientId === arroz.id
      );
      expect(arrozItem).toBeDefined();
      expect(arrozItem!.totalQuantityNeeded).toBe(800);
      expect(arrozItem!.purchaseUnits).toBe(1);

      // Pollo: 400g → ceil(400/600) = 1 unit
      const polloItem = shoppingList.items.find(
        (item) => item.ingredientId === pollo.id
      );
      expect(polloItem).toBeDefined();
      expect(polloItem!.totalQuantityNeeded).toBe(400);
      expect(polloItem!.purchaseUnits).toBe(1);

      // Cebolla: 100 * 2 = 200g → ceil(200/1000) = 1 unit
      const cebollaItem = shoppingList.items.find(
        (item) => item.ingredientId === cebolla.id
      );
      expect(cebollaItem).toBeDefined();
      expect(cebollaItem!.totalQuantityNeeded).toBe(200);
      expect(cebollaItem!.purchaseUnits).toBe(1);
    });
  });

  // ─── Test 2: Persistence round-trip ────────────────────────────────────────

  describe('Persistence round-trip: create data → read back → verify integrity', () => {
    it('should preserve all ingredient fields through create → read cycle', async () => {
      const input: CreateIngredientInput = {
        name: 'Leche entera',
        unit: 'mililitros',
        purchaseFormat: { description: 'Brick 1L', quantity: 1000 },
        category: 'Lácteos',
      };

      const created = await ingredientService.create(input);
      expect(created.id).toBeDefined();

      // Read back all ingredients
      const allIngredients = await ingredientService.getAll();
      const readBack = allIngredients.find((i) => i.id === created.id);

      expect(readBack).toBeDefined();
      expect(readBack!.name).toBe(input.name);
      expect(readBack!.unit).toBe(input.unit);
      expect(readBack!.purchaseFormat.description).toBe(input.purchaseFormat.description);
      expect(readBack!.purchaseFormat.quantity).toBe(input.purchaseFormat.quantity);
      expect(readBack!.category).toBe(input.category);
      expect(readBack!.createdAt).toBeInstanceOf(Date);
      expect(readBack!.updatedAt).toBeInstanceOf(Date);
    });

    it('should preserve all recipe fields through create → read cycle', async () => {
      // Create an ingredient first for the recipe
      const ingredient = await ingredientService.create({
        name: 'Huevos',
        unit: 'unidades',
        purchaseFormat: { description: 'Docena', quantity: 12 },
        category: 'Huevos',
      });

      const input: CreateRecipeInput = {
        name: 'Tortilla Francesa',
        mealType: 'cena',
        prepTime: 'rapido',
        ingredients: [{ ingredientId: ingredient.id, quantity: 3 }],
      };

      const result = await recipeService.create(input);
      expect(result.success).toBe(true);
      const created = result.success ? result.data : null;

      // Read back
      const readBack = await recipeService.getById(created!.id);
      expect(readBack).not.toBeNull();
      expect(readBack!.name).toBe(input.name);
      expect(readBack!.mealType).toBe(input.mealType);
      expect(readBack!.prepTime).toBe(input.prepTime);
      expect(readBack!.ingredients).toHaveLength(1);
      expect(readBack!.ingredients[0].ingredientId).toBe(ingredient.id);
      expect(readBack!.ingredients[0].quantity).toBe(3);
    });

    it('should preserve pantry data through addOrUpdate → read cycle', async () => {
      const ingredient = await ingredientService.create({
        name: 'Harina',
        unit: 'gramos',
        purchaseFormat: { description: 'Paquete 1kg', quantity: 1000 },
        category: 'Cereales',
      });

      await pantryService.addOrUpdate({
        id: '',
        ingredientId: ingredient.id,
        quantity: 750,
        updatedAt: new Date(),
      });

      const quantity = await pantryService.getAvailableQuantity(ingredient.id);
      expect(quantity).toBe(750);

      // Update quantity
      await pantryService.addOrUpdate({
        id: '',
        ingredientId: ingredient.id,
        quantity: 500,
        updatedAt: new Date(),
      });

      const updatedQuantity = await pantryService.getAvailableQuantity(ingredient.id);
      expect(updatedQuantity).toBe(500);
    });

    it('should maintain consistency when creating multiple entities', async () => {
      // Create several ingredients
      const ingredients = await Promise.all([
        ingredientService.create({
          name: 'Sal',
          unit: 'gramos',
          purchaseFormat: { description: 'Bote 500g', quantity: 500 },
          category: 'Condimentos',
        }),
        ingredientService.create({
          name: 'Pimienta',
          unit: 'gramos',
          purchaseFormat: { description: 'Bote 50g', quantity: 50 },
          category: 'Condimentos',
        }),
        ingredientService.create({
          name: 'Azúcar',
          unit: 'gramos',
          purchaseFormat: { description: 'Paquete 1kg', quantity: 1000 },
          category: 'Condimentos',
        }),
      ]);

      const all = await ingredientService.getAll();
      expect(all).toHaveLength(3);

      // Verify all created ingredients are retrievable
      for (const ingredient of ingredients) {
        const found = all.find((i) => i.id === ingredient.id);
        expect(found).toBeDefined();
        expect(found!.name).toBe(ingredient.name);
      }
    });
  });

  // ─── Test 3: Error flows ───────────────────────────────────────────────────

  describe('Error flows: validation rejections, duplicates, and persistence failures', () => {
    it('should reject recipe creation with empty name (validation error)', async () => {
      const result = await recipeService.create({
        name: '',
        mealType: 'comida',
        prepTime: 'rapido',
        ingredients: [{ ingredientId: 'ing-1', quantity: 100 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        const validationError = result.error as ValidationError;
        expect(validationError.fields.some((f) => f.field === 'name')).toBe(true);
      }
    });

    it('should reject recipe creation with invalid ingredient quantity', async () => {
        name: 'Receta con cantidad inválida',
        mealType: 'comida',
        ingredients: [{ ingredientId: 'ing-1', quantity: 0 }],
      });

      if (!result.success) {
        expect(result.error.type).toBe('validation');
        const validationError = result.error as ValidationError;
        expect(validationError.fields.some((f) => f.field === 'ingredients')).toBe(true);
      }
    });

    it('should reject duplicate recipe names (conflict error)', async () => {
      const input: CreateRecipeInput = {
        name: 'Gazpacho',
        mealType: 'comida',
        prepTime: 'rapido',
        ingredients: [{ ingredientId: 'ing-1', quantity: 200 }],
      };

      const first = await recipeService.create(input);
      expect(first.success).toBe(true);

      const duplicate = await recipeService.create(input);
      expect(duplicate.success).toBe(false);
      if (!duplicate.success) {
        expect(duplicate.error.type).toBe('conflict');
      }
    });

    it('should reject duplicate ingredient names (conflict error)', async () => {
      await ingredientService.create({
        name: 'Ajo',
        unit: 'unidades',
        purchaseFormat: { description: 'Cabeza', quantity: 1 },
        category: 'Verduras',
      });

      try {
        await ingredientService.create({
          name: 'Ajo',
          unit: 'unidades',
          purchaseFormat: { description: 'Cabeza grande', quantity: 1 },
          category: 'Verduras',
        });
        expect.fail('Should have thrown a conflict error');
      } catch (error) {
        const conflictError = error as ConflictError;
        expect(conflictError.type).toBe('conflict');
        expect(conflictError.message).toContain('Ajo');
      }
    });

    it('should reject plan confirmation with wrong recipe count (constraint error)', async () => {
      // Period of 3 days, no free days → needs 3 lunches and 3 dinners
      const ingredient = await ingredientService.create({
        name: 'Pan',
        unit: 'gramos',
        purchaseFormat: { description: 'Barra', quantity: 250 },
        category: 'Panadería',
      });

      const recipeResult = await recipeService.create({
        name: 'Bocadillo',
        mealType: 'ambas',
        prepTime: 'rapido',
        ingredients: [{ ingredientId: ingredient.id, quantity: 100 }],
      });
      const recipe = recipeResult.success ? recipeResult.data : null;

      const planConfig: PlanConfig = {
        periodDays: 3,
        startDate: new Date('2024-02-01'),
        freeDays: [],
      };

      // Draft creation should succeed
      const planResult = await planningService.createPlan(planConfig);
      expect(planResult.success).toBe(true);

      // Trying to confirm without enough assignments should fail
      const confirmResult = await planningService.updatePlan(
        (planResult as any).data.id,
        { status: 'confirmed' }
      );
      expect(confirmResult.success).toBe(false);
      if (!confirmResult.success) {
        expect(confirmResult.error.type).toBe('constraint');
        expect((confirmResult.error as any).message).toContain('Faltan');
      }
    });

    it('should reject pantry entry with quantity <= 0', async () => {
      try {
        await pantryService.addOrUpdate({
          id: '',
          ingredientId: 'some-id',
          quantity: 0,
          updatedAt: new Date(),
        });
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.type).toBe('validation');
        expect(validationError.fields.some((f) => f.field === 'quantity')).toBe(true);
      }
    });

    it('should reject plan with invalid period', async () => {
      const planConfig: PlanConfig = {
        periodDays: 0,
        startDate: new Date('2024-02-01'),
        freeDays: [],
        selectedLunchRecipes: [],
        selectedDinnerRecipes: [],
      };

      const result = await planningService.createPlan(planConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        const validationError = result.error as ValidationError;
        expect(validationError.fields.some((f) => f.field === 'periodDays')).toBe(true);
      }
    });
  });

  // ─── Test 4: Persistence retry logic ───────────────────────────────────────

  describe('Persistence retry mechanism', () => {
    it('should succeed after retries on transient failure', async () => {
      let attempts = 0;
      const operation = async (): Promise<string> => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary write failure');
        }
        return 'success-data';
      };

      const result = await withRetry(operation, 3);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success-data');
      expect(attempts).toBe(3);
    });

    it('should fail after exhausting all retries', async () => {
      const operation = async (): Promise<string> => {
        throw new Error('Persistent failure');
      };

      const result = await withRetry(operation, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.type).toBe('write_failure');
      expect(result.error!.retryable).toBe(true);
      expect(result.retriesRemaining).toBe(0);
    });

    it('should not retry on non-retryable errors (constraint violations)', async () => {
      let attempts = 0;
      const operation = async (): Promise<string> => {
        attempts++;
        throw new Error('UNIQUE constraint failed: recipes.name');
      };

      const result = await withRetry(operation, 3);

      expect(result.success).toBe(false);
      expect(result.error!.type).toBe('constraint_violation');
      expect(result.error!.retryable).toBe(false);
      // Should have stopped after first attempt
      expect(attempts).toBe(1);
    });

    it('should classify database corruption as non-retryable', () => {
      const error = new Error('database disk image is malformed');
      const classified = classifyError(error);

      expect(classified.type).toBe('corruption');
      expect(classified.retryable).toBe(false);
    });

    it('should classify unknown errors as retryable write failures', () => {
      const error = new Error('something went wrong');
      const classified = classifyError(error);

      expect(classified.type).toBe('write_failure');
      expect(classified.retryable).toBe(true);
    });
  });
});
