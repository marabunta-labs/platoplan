/**
 * Shopping List Service - Business logic for generating and managing shopping lists.
 *
 * Aggregates ingredient quantities across all plan recipes, applies pantry deductions,
 * calculates purchase units, and groups items by category.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { ShoppingList, Ingredient } from '../models/types';
import type { ValidationError } from '../models/errors';
import { ShoppingListRepository, type CreateShoppingListItemInput } from '../repositories/shopping-list.repository';
import { PantryRepository } from '../repositories/pantry.repository';
import { IngredientRepository } from '../repositories/ingredient.repository';
import * as planRepository from '../repositories/plan.repository';
import * as recipeRepository from '../repositories/recipe.repository';

export interface IShoppingListService {
  generate(planId: string): Promise<ShoppingList>;
  generateCustom(customId: string, recipeCounts: Record<string, number>): Promise<ShoppingList>;
  editQuantity(listId: string, itemId: string, quantity: number): Promise<ShoppingList>;
  removeItem(listId: string, itemId: string): Promise<ShoppingList>;
  getByPlanId(planId: string): Promise<ShoppingList | null>;
  regenerate(listId: string): Promise<ShoppingList>;
  confirmPantryQuantity(listId: string, ingredientId: string, availableQuantity: number): Promise<ShoppingList>;
  markPlanModified(planId: string): Promise<void>;
}

/** Intermediate aggregation result for an ingredient */
interface AggregatedIngredient {
  ingredientId: string;
  totalQuantityNeeded: number;
}

export class ShoppingListService implements IShoppingListService {
  private shoppingListRepo: ShoppingListRepository;
  private pantryRepo: PantryRepository;
  private ingredientRepo: IngredientRepository;
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
    this.shoppingListRepo = new ShoppingListRepository(db);
    this.pantryRepo = new PantryRepository(db);
    this.ingredientRepo = new IngredientRepository(db);
  }

  async generate(planId: string): Promise<ShoppingList> {
    const plan = await planRepository.getPlanById(this.db, planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const aggregated = await this.aggregateIngredients(
      plan.assignments.map((a) => a.recipeId),
      plan.servings
    );

    const items = await this.calculateShoppingItems(aggregated);
    const sortedItems = await this.sortItemsByCategoryAndName(items);

    const existing = await this.shoppingListRepo.getByPlanId(planId);
    const list = existing
      ? await this.shoppingListRepo.update(existing.id, sortedItems)
      : await this.shoppingListRepo.create(planId, sortedItems);
    
    return this.hydrateIngredients(list);
  }

  // NUEVO MÉTODO: Genera la lista basándose en un diccionario { recipeId: cantidad }
  async generateCustom(customId: string, recipeCounts: Record<string, number>): Promise<ShoppingList> {
    const recipeIds: string[] = [];
    
    // Multiplicamos los IDs de recetas según la cantidad seleccionada
    for (const [id, count] of Object.entries(recipeCounts)) {
      for (let i = 0; i < count; i++) {
        recipeIds.push(id);
      }
    }

    // TRUCO DB: Insertamos un "plan fantasma" para satisfacer la Foreign Key de SQLite/Supabase.
    // Usamos INSERT OR IGNORE para que no falle si ya lo habíamos creado antes.
    const now = new Date().toISOString();
    await this.db.runAsync(`
      INSERT OR IGNORE INTO plans (id, period_days, start_date, servings, status, created_at, updated_at)
      VALUES (?, 1, ?, 1, 'draft', ?, ?)
    `, [customId, now, now, now]);

    // Usamos 0 en servings para que aplique las raciones por defecto de cada receta
    const aggregated = await this.aggregateIngredients(recipeIds, 0);
    const items = await this.calculateShoppingItems(aggregated);
    const sortedItems = await this.sortItemsByCategoryAndName(items);

    const existing = await this.shoppingListRepo.getByPlanId(customId);
    const list = existing
      ? await this.shoppingListRepo.update(existing.id, sortedItems)
      : await this.shoppingListRepo.create(customId, sortedItems);
      
    return this.hydrateIngredients(list);
  }

  async editQuantity(listId: string, itemId: string, quantity: number): Promise<ShoppingList> {
    // CAMBIO: Ahora aceptamos quantity >= 0 en lugar de > 0
    if (quantity < 0 || quantity > 999 || !Number.isInteger(quantity)) {
      const error: ValidationError = {
        type: 'validation',
        fields: [{ field: 'quantity', message: 'Quantity must be an integer between 0 and 999' }],
      };
      throw error;
    }

    await this.shoppingListRepo.editQuantity(itemId, quantity);

    const list = await this.findListById(listId);
    if (!list) {
      throw new Error(`Shopping list not found: ${listId}`);
    }
    return list;
  }

  async removeItem(listId: string, itemId: string): Promise<ShoppingList> {
    await this.shoppingListRepo.removeItem(itemId);

    const list = await this.findListById(listId);
    if (!list) {
      throw new Error(`Shopping list not found: ${listId}`);
    }
    return list;
  }

  /**
   * Confirms how much of an ingredient the user actually has, writing it to the
   * pantry (the single source of truth), then recalculates the shopping list so
   * the pantry deduction is persistent and consistent.
   *
   * - availableQuantity > 0 -> upsert the pantry entry to that amount.
   * - availableQuantity <= 0 -> remove the pantry entry (i.e. "I have none").
   *
   * Because the deduction lives in the pantry, it survives future regenerations.
   */
  async confirmPantryQuantity(
    listId: string,
    ingredientId: string,
    availableQuantity: number
  ): Promise<ShoppingList> {
    const amount = Number.isFinite(availableQuantity) ? Math.max(0, availableQuantity) : 0;

    if (amount > 0) {
      await this.pantryRepo.addOrUpdate(ingredientId, amount);
    } else {
      await this.pantryRepo.remove(ingredientId);
    }

    return this.regenerate(listId);
  }

  async getByPlanId(planId: string): Promise<ShoppingList | null> {
    const list = await this.shoppingListRepo.getByPlanId(planId);
    return list ? this.hydrateIngredients(list) : null;
  }

  async regenerate(listId: string): Promise<ShoppingList> {
    const existingList = await this.findListById(listId);
    if (!existingList) {
      throw new Error(`Shopping list not found: ${listId}`);
    }

    const plan = await planRepository.getPlanById(this.db, existingList.planId);
    let aggregated: AggregatedIngredient[];

    // LÓGICA INTELIGENTE: Si el plan existe pero no tiene asignaciones (es el fantasma), 
    // reconstruimos desde la lista para que funcione correctamente la regeneración
    if (!plan || (plan.id === '00000000-0000-0000-0000-000000000000' && plan.assignments.length === 0)) {
      aggregated = existingList.items.map((item) => ({
        ingredientId: item.ingredientId,
        totalQuantityNeeded: item.totalQuantityNeeded,
      }));
    } else {
      aggregated = await this.aggregateIngredients(
        plan.assignments.map((a) => a.recipeId),
        plan.servings
      );
    }

    const items = await this.calculateShoppingItems(aggregated);
    const sortedItems = await this.sortItemsByCategoryAndName(items);

    return this.hydrateIngredients(await this.shoppingListRepo.update(listId, sortedItems));
  }

  private async aggregateIngredients(
    recipeIds: string[],
    planServings = 0
  ): Promise<AggregatedIngredient[]> {
    const aggregationMap = new Map<string, number>();

    for (const recipeId of recipeIds) {
      const recipe = await recipeRepository.getById(this.db, recipeId);
      if (!recipe) {
        continue;
      }

      const recipeServings = recipe.servings > 0 ? recipe.servings : 1;
      const scale = planServings > 0 ? planServings / recipeServings : 1;

      for (const recipeIngredient of recipe.ingredients) {
        const current = aggregationMap.get(recipeIngredient.ingredientId) ?? 0;
        aggregationMap.set(
          recipeIngredient.ingredientId,
          current + recipeIngredient.quantity * scale
        );
      }
    }

    return Array.from(aggregationMap.entries()).map(([ingredientId, totalQuantityNeeded]) => ({
      ingredientId,
      totalQuantityNeeded,
    }));
  }

  private async calculateShoppingItems(
    aggregated: AggregatedIngredient[]
  ): Promise<CreateShoppingListItemInput[]> {
    const items: CreateShoppingListItemInput[] = [];

    // Iteramos ÚNICAMENTE sobre los ingredientes resultantes de las recetas del plan
    for (const agg of aggregated) {
      const pantryEntry = await this.pantryRepo.getByIngredientId(agg.ingredientId);
      const pantryAvailable = pantryEntry ? pantryEntry.quantity : 0;
      
      // Cantidad neta real a comprar
      const netQuantity = Math.max(0, agg.totalQuantityNeeded - pantryAvailable);

      const ingredient = await this.ingredientRepo.getById(agg.ingredientId);
      if (!ingredient) {
        continue;
      }

      const purchaseUnits = ingredient.purchaseFormat?.quantity 
        ? Math.ceil(netQuantity / ingredient.purchaseFormat.quantity)
        : netQuantity;

      items.push({
        ingredientId: agg.ingredientId,
        totalQuantityNeeded: agg.totalQuantityNeeded,
        pantryQuantityDeducted: Math.min(pantryAvailable, agg.totalQuantityNeeded),
        netQuantity,
        purchaseUnits,
      });
    }

    return items;
  }

  private async sortItemsByCategoryAndName(
    items: CreateShoppingListItemInput[]
  ): Promise<CreateShoppingListItemInput[]> {
    const ingredientMap = new Map<string, Ingredient>();
    for (const item of items) {
      const ingredient = await this.ingredientRepo.getById(item.ingredientId);
      if (ingredient) {
        ingredientMap.set(item.ingredientId, ingredient);
      }
    }

    return [...items].sort((a, b) => {
      const ingA = ingredientMap.get(a.ingredientId);
      const ingB = ingredientMap.get(b.ingredientId);
      if (!ingA || !ingB) return 0;
      const categoryCompare = ingA.category.localeCompare(ingB.category);
      if (categoryCompare !== 0) return categoryCompare;
      return ingA.name.localeCompare(ingB.name);
    });
  }

  async markPlanModified(planId: string): Promise<void> {
    const list = await this.shoppingListRepo.getByPlanId(planId);
    if (list) {
      await this.shoppingListRepo.markStale(list.id);
    }
  }

  private async findListById(listId: string): Promise<ShoppingList | null> {
    const row = await this.db.getFirstAsync<{ plan_id: string }>(
      'SELECT plan_id FROM shopping_lists WHERE id = ?',
      [listId]
    );
    if (!row) return null;
    return this.shoppingListRepo.getByPlanId(row.plan_id);
  }

  private async hydrateIngredients(list: ShoppingList): Promise<ShoppingList> {
    const ingredients = await Promise.all(list.items.map((item) => this.ingredientRepo.getById(item.ingredientId)));
    return {
      ...list,
      items: list.items.map((item, index) => ({ ...item, ingredient: ingredients[index] ?? undefined })),
    };
  }
}