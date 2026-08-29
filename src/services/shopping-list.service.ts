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
  editQuantity(listId: string, itemId: string, quantity: number): Promise<ShoppingList>;
  removeItem(listId: string, itemId: string): Promise<ShoppingList>;
  getByPlanId(planId: string): Promise<ShoppingList | null>;
  regenerate(listId: string): Promise<ShoppingList>;
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

  /**
   * Generates a shopping list for a given plan.
   *
   * Algorithm:
   * 1. Get the plan with all assignments
   * 2. For each assignment, get the recipe's ingredients
   * 3. Aggregate: sum total quantities for each unique ingredient across all recipes
   * 4. For each aggregated ingredient, get pantry quantity available
   * 5. Calculate: netQuantity = max(0, totalNeeded - pantryAvailable)
   * 6. If netQuantity === 0, exclude the ingredient
   * 7. Calculate: purchaseUnits = ceil(netQuantity / purchaseFormat.quantity)
   * 8. Group items by category, sort alphabetically by name within each group
   * 9. Persist the shopping list
   */
  async generate(planId: string): Promise<ShoppingList> {
    // Step 1: Get plan with assignments
    const plan = await planRepository.getPlanById(this.db, planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Step 2 & 3: Aggregate ingredient quantities across all assigned recipes
    const aggregated = await this.aggregateIngredients(
      plan.assignments.map((a) => a.recipeId),
      plan.servings
    );

    // Steps 4-7: Apply pantry deductions and calculate purchase units
    const items = await this.calculateShoppingItems(aggregated);

    // Step 8: Group by category, sort alphabetically within groups
    const sortedItems = await this.sortItemsByCategoryAndName(items);

    // Step 9: Persist. Regenerating an already-created list must replace it;
    // otherwise the screen can read an older duplicate for the same plan.
    const existing = await this.shoppingListRepo.getByPlanId(planId);
    const list = existing
      ? await this.shoppingListRepo.update(existing.id, sortedItems)
      : await this.shoppingListRepo.create(planId, sortedItems);
    return list;
  }

  /**
   * Edits the purchase units for a specific item in the list.
   * Validates that quantity is between 1 and 999.
   * Returns the updated shopping list.
   */
  async editQuantity(listId: string, itemId: string, quantity: number): Promise<ShoppingList> {
    if (quantity < 1 || quantity > 999 || !Number.isInteger(quantity)) {
      const error: ValidationError = {
        type: 'validation',
        fields: [{ field: 'quantity', message: 'Quantity must be an integer between 1 and 999' }],
      };
      throw error;
    }

    await this.shoppingListRepo.editQuantity(itemId, quantity);

    // Fetch the list to find its planId
    const list = await this.findListById(listId);
    if (!list) {
      throw new Error(`Shopping list not found: ${listId}`);
    }
    return list;
  }

  /**
   * Removes an item from the shopping list (soft delete).
   * Returns the updated shopping list.
   */
  async removeItem(listId: string, itemId: string): Promise<ShoppingList> {
    await this.shoppingListRepo.removeItem(itemId);

    const list = await this.findListById(listId);
    if (!list) {
      throw new Error(`Shopping list not found: ${listId}`);
    }
    return list;
  }

  /**
   * Returns the shopping list for a given plan, or null if none exists.
   */
  async getByPlanId(planId: string): Promise<ShoppingList | null> {
    const list = await this.shoppingListRepo.getByPlanId(planId);
    return list ? this.hydrateIngredients(list) : null;
  }

  /**
   * Regenerates an existing shopping list by recomputing from the plan.
   * Replaces existing items with fresh calculations.
   */
  async regenerate(listId: string): Promise<ShoppingList> {
    const existingList = await this.findListById(listId);
    if (!existingList) {
      throw new Error(`Shopping list not found: ${listId}`);
    }

    const plan = await planRepository.getPlanById(this.db, existingList.planId);
    if (!plan) {
      throw new Error(`Plan not found: ${existingList.planId}`);
    }

    const aggregated = await this.aggregateIngredients(
      plan.assignments.map((a) => a.recipeId),
      plan.servings
    );

    const items = await this.calculateShoppingItems(aggregated);
    const sortedItems = await this.sortItemsByCategoryAndName(items);

    return this.hydrateIngredients(await this.shoppingListRepo.update(listId, sortedItems));
  }

  /**
   * Aggregates ingredient quantities across all provided recipe IDs.
   * If a recipe appears multiple times, its ingredients are counted multiple times.
   * Quantities are scaled by planServings / recipe.servings so a plan for more
   * diners buys proportionally more of each ingredient.
   */
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

  /**
   * Applies pantry deductions and calculates purchase units for each aggregated ingredient.
   * Excludes ingredients fully covered by pantry (netQuantity === 0).
   */
  private async calculateShoppingItems(
    aggregated: AggregatedIngredient[]
  ): Promise<CreateShoppingListItemInput[]> {
    const items: CreateShoppingListItemInput[] = [];

    for (const agg of aggregated) {
      // Get pantry quantity
      const pantryEntry = await this.pantryRepo.getByIngredientId(agg.ingredientId);
      const pantryAvailable = pantryEntry ? pantryEntry.quantity : 0;

      // Calculate net quantity
      const netQuantity = Math.max(0, agg.totalQuantityNeeded - pantryAvailable);

      // Exclude if fully covered by pantry
      if (netQuantity === 0) {
        continue;
      }

      // Get ingredient for purchase format
      const ingredient = await this.ingredientRepo.getById(agg.ingredientId);
      if (!ingredient) {
        continue;
      }

      // Calculate purchase units
      const purchaseUnits = Math.ceil(netQuantity / ingredient.purchaseFormat.quantity);

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

  /**
   * Sorts items by ingredient category (alphabetically), then by ingredient name
   * within each category group.
   */
  private async sortItemsByCategoryAndName(
    items: CreateShoppingListItemInput[]
  ): Promise<CreateShoppingListItemInput[]> {
    // Fetch ingredient details for sorting
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

      if (!ingA || !ingB) {
        return 0;
      }

      // First sort by category
      const categoryCompare = ingA.category.localeCompare(ingB.category);
      if (categoryCompare !== 0) {
        return categoryCompare;
      }

      // Then sort alphabetically by name within category
      return ingA.name.localeCompare(ingB.name);
    });
  }

  /**
   * Marks the shopping list associated with a plan as stale.
   * Called when the plan is modified (assignment added/removed/swapped) after list generation.
   * No-op if no shopping list exists for the plan.
   */
  async markPlanModified(planId: string): Promise<void> {
    const list = await this.shoppingListRepo.getByPlanId(planId);
    if (list) {
      await this.shoppingListRepo.markStale(list.id);
    }
  }

  /**
   * Finds a shopping list by its ID by querying all plans.
   * Since ShoppingListRepository uses getByPlanId, we need to find the list
   * through the plan association.
   */
  private async findListById(listId: string): Promise<ShoppingList | null> {
    // The repository doesn't have a getById method directly.
    // We use the database to find the plan_id for this list.
    const row = await this.db.getFirstAsync<{ plan_id: string }>(
      'SELECT plan_id FROM shopping_lists WHERE id = ?',
      [listId]
    );

    if (!row) {
      return null;
    }

    return this.shoppingListRepo.getByPlanId(row.plan_id);
  }

  /** The list repositories store IDs only. The UI needs the actual ingredient
   * data to render names, formats and categories. */
  private async hydrateIngredients(list: ShoppingList): Promise<ShoppingList> {
    const ingredients = await Promise.all(list.items.map((item) => this.ingredientRepo.getById(item.ingredientId)));
    return {
      ...list,
      items: list.items.map((item, index) => ({ ...item, ingredient: ingredients[index] ?? undefined })),
    };
  }
}
