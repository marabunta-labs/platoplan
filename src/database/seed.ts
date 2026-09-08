/**
 * PlatoPlan - Sample data seeding
 *
 * Populates the local database with realistic Spanish sample data
 * (ingredients, recipes, pantry stock, a menu plan and its shopping list)
 * the first time the app runs on an empty database.
 *
 * Idempotent: it only seeds when there are no recipes yet, so it never
 * duplicates data on subsequent launches.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MealType, PrepTime, MeasureUnit } from '../models/enums';
import { IngredientService } from '../services/ingredient.service';
import { createRecipeService } from '../services/recipe.service';
import { createPlanningService } from '../services/planning.service';
import { PantryService } from '../services/pantry.service';
import { ShoppingListService } from '../services/shopping-list.service';

interface SeedIngredient {
  key: string;
  name: string;
  unit: MeasureUnit;
  purchaseFormat: { description: string; quantity: number };
  category: string;
  /** Optional pantry stock to preload. */
  pantry?: number;
}

interface SeedRecipe {
  name: string;
  mealType: MealType;
  prepTime: PrepTime;
  description: string;
  servings: number;
  ingredients: { key: string; quantity: number }[];
}

const INGREDIENTS: SeedIngredient[] = [
  { key: 'huevos', name: 'Huevos', unit: 'unidades', purchaseFormat: { description: 'docena', quantity: 12 }, category: 'Huevos y lácteos', pantry: 12 },
  { key: 'patata', name: 'Patata', unit: 'gramos', purchaseFormat: { description: 'malla', quantity: 2000 }, category: 'Verduras', pantry: 1500 },
  { key: 'cebolla', name: 'Cebolla', unit: 'unidades', purchaseFormat: { description: 'malla', quantity: 5 }, category: 'Verduras', pantry: 3 },
  { key: 'aceite', name: 'Aceite de oliva', unit: 'mililitros', purchaseFormat: { description: 'botella', quantity: 1000 }, category: 'Aceites y salsas', pantry: 800 },
  { key: 'arroz', name: 'Arroz', unit: 'gramos', purchaseFormat: { description: 'paquete', quantity: 1000 }, category: 'Pasta, arroz y legumbres', pantry: 500 },
  { key: 'tomate', name: 'Tomate', unit: 'gramos', purchaseFormat: { description: 'bandeja', quantity: 1000 }, category: 'Verduras' },
  { key: 'pollo', name: 'Pechuga de pollo', unit: 'gramos', purchaseFormat: { description: 'bandeja', quantity: 500 }, category: 'Carnes' },
  { key: 'pasta', name: 'Pasta', unit: 'gramos', purchaseFormat: { description: 'paquete', quantity: 500 }, category: 'Pasta, arroz y legumbres', pantry: 250 },
  { key: 'atun', name: 'Atún en lata', unit: 'gramos', purchaseFormat: { description: 'lata', quantity: 80 }, category: 'Conservas' },
  { key: 'lechuga', name: 'Lechuga', unit: 'unidades', purchaseFormat: { description: 'unidad', quantity: 1 }, category: 'Verduras' },
  { key: 'queso', name: 'Queso rallado', unit: 'gramos', purchaseFormat: { description: 'bolsa', quantity: 200 }, category: 'Huevos y lácteos' },
  { key: 'pan', name: 'Pan', unit: 'unidades', purchaseFormat: { description: 'barra', quantity: 1 }, category: 'Panadería' },
];

const RECIPES: SeedRecipe[] = [
  {
    name: 'Tortilla de patatas',
    mealType: 'ambas',
    prepTime: 'elaborado',
    description: 'Bate los huevos, fríe la patata y la cebolla, mezcla y cuaja la tortilla por ambos lados.',
    servings: 2,
    ingredients: [
      { key: 'huevos', quantity: 4 },
      { key: 'patata', quantity: 400 },
      { key: 'cebolla', quantity: 1 },
      { key: 'aceite', quantity: 50 },
    ],
  },
  {
    name: 'Arroz con pollo',
    mealType: 'comida',
    prepTime: 'elaborado',
    description: 'Sofríe el pollo y la cebolla, añade el arroz y el tomate, cubre con agua y cuece hasta que el arroz esté listo.',
    servings: 2,
    ingredients: [
      { key: 'arroz', quantity: 200 },
      { key: 'pollo', quantity: 300 },
      { key: 'tomate', quantity: 150 },
      { key: 'cebolla', quantity: 1 },
      { key: 'aceite', quantity: 30 },
    ],
  },
  {
    name: 'Pasta con tomate',
    mealType: 'ambas',
    prepTime: 'rapido',
    description: 'Cuece la pasta, calienta el tomate con un poco de aceite y mezcla. Añade queso al gusto.',
    servings: 2,
    ingredients: [
      { key: 'pasta', quantity: 200 },
      { key: 'tomate', quantity: 200 },
      { key: 'queso', quantity: 50 },
      { key: 'aceite', quantity: 20 },
    ],
  },
  {
    name: 'Ensalada de atún',
    mealType: 'cena',
    prepTime: 'rapido',
    description: 'Trocea la lechuga y el tomate, añade el atún escurrido y aliña con aceite.',
    servings: 2,
    ingredients: [
      { key: 'lechuga', quantity: 1 },
      { key: 'tomate', quantity: 150 },
      { key: 'atun', quantity: 160 },
      { key: 'aceite', quantity: 15 },
    ],
  },
  {
    name: 'Huevos revueltos',
    mealType: 'cena',
    prepTime: 'rapido',
    description: 'Bate los huevos y cuájalos a fuego suave removiendo. Sirve con pan.',
    servings: 2,
    ingredients: [
      { key: 'huevos', quantity: 4 },
      { key: 'aceite', quantity: 10 },
      { key: 'pan', quantity: 1 },
    ],
  },
  {
    name: 'Pollo al horno con patatas',
    mealType: 'comida',
    prepTime: 'elaborado',
    description: 'Coloca el pollo y las patatas en una bandeja, riega con aceite y hornea hasta que estén dorados.',
    servings: 2,
    ingredients: [
      { key: 'pollo', quantity: 400 },
      { key: 'patata', quantity: 500 },
      { key: 'cebolla', quantity: 1 },
      { key: 'aceite', quantity: 40 },
    ],
  },
];

/**
 * Seeds the database with sample data if it is empty (no recipes yet).
 * Safe to call on every launch; it no-ops once data exists.
 */
export async function seedSampleDataIfEmpty(db: SQLiteDatabase): Promise<void> {
  const recipeService = createRecipeService(db);
  const existing = await recipeService.getCount();
  if (existing > 0) {
    return; // Already has data — do not seed again.
  }

  const ingredientService = new IngredientService(db);
  const pantryService = new PantryService(db);
  const planningService = createPlanningService(db);
  const shoppingListService = new ShoppingListService(db);

  // 1. Ingredients + pantry stock
  const idByKey = new Map<string, string>();
  for (const ing of INGREDIENTS) {
    const created = await ingredientService.create({
      name: ing.name,
      unit: ing.unit,
      purchaseFormat: ing.purchaseFormat,
      category: ing.category,
    });
    idByKey.set(ing.key, created.id);
    if (ing.pantry && ing.pantry > 0) {
      await pantryService.addOrUpdate({ id: '', ingredientId: created.id, quantity: ing.pantry, updatedAt: new Date() });
    }
  }

  // 2. Recipes
  const recipeIdByName = new Map<string, string>();
  for (const recipe of RECIPES) {
    const result = await recipeService.create({
      name: recipe.name,
      mealType: recipe.mealType,
      prepTime: recipe.prepTime,
      description: recipe.description,
      servings: recipe.servings,
      ingredients: recipe.ingredients
        .map((ri) => ({ ingredientId: idByKey.get(ri.key)!, quantity: ri.quantity }))
        .filter((ri) => ri.ingredientId),
    });
    if (result.success) {
      recipeIdByName.set(recipe.name, result.data.id);
    }
  }

  // 3. A 7-day plan starting today, for 4 diners, with a couple of free slots.
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const planResult = await planningService.createPlan({
    name: 'Menú de la semana',
    periodDays: 7,
    startDate,
    servings: 4,
    elaborateDays: [5, 6], // weekend for elaborate dishes
    freeDays: [{ dayIndex: 6, type: 'comida' }], // eating out on day 7 lunch
  });

  if (planResult.success) {
    const planId = planResult.data.id;

    // Lunch assignments (comida) — skip day 6 lunch (marked free).
    const lunches = ['Arroz con pollo', 'Pasta con tomate', 'Tortilla de patatas', 'Pollo al horno con patatas', 'Pasta con tomate', 'Arroz con pollo'];
    const dinners = ['Ensalada de atún', 'Huevos revueltos', 'Ensalada de atún', 'Pasta con tomate', 'Huevos revueltos', 'Ensalada de atún', 'Huevos revueltos'];

    for (let day = 0; day < lunches.length; day++) {
      const recipeId = recipeIdByName.get(lunches[day]);
      if (recipeId) await planningService.assignRecipe(planId, day, 'comida', recipeId);
    }
    for (let day = 0; day < dinners.length; day++) {
      const recipeId = recipeIdByName.get(dinners[day]);
      if (recipeId) await planningService.assignRecipe(planId, day, 'cena', recipeId);
    }

    // Mark the plan confirmed and generate its shopping list.
    await planningService.updatePlan(planId, { status: 'confirmed', allowGaps: true });
    try {
      await shoppingListService.generate(planId);
    } catch {
      // Non-fatal: the list can be generated later from the UI.
    }
  }
}
