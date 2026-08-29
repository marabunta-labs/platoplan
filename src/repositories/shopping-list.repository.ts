/**
 * PlatoPlan - Shopping List Repository
 *
 * Encapsulates all SQLite operations for the `shopping_lists` and
 * `shopping_list_items` tables.
 * Implements IRepository for consistent interface with other repositories.
 */
import type * as SQLite from 'expo-sqlite';
import type { ShoppingList, ShoppingListItem } from '../models/types';
import type { IRepository } from './interfaces';
import { generateId, withTransaction } from '../database/database';

/** Input type for creating shopping list items */
export interface CreateShoppingListItemInput {
  ingredientId: string;
  totalQuantityNeeded: number;
  pantryQuantityDeducted: number;
  netQuantity: number;
  purchaseUnits: number;
}

/** Input for creating a shopping list (IRepository interface) */
export interface CreateShoppingListInput {
  planId: string;
  items: CreateShoppingListItemInput[];
}

/** Input for updating a shopping list (IRepository interface) */
export interface UpdateShoppingListInput {
  items?: CreateShoppingListItemInput[];
  isStale?: boolean;
}

export class ShoppingListRepository
  implements IRepository<ShoppingList, CreateShoppingListInput, UpdateShoppingListInput>
{
  constructor(private db: SQLite.SQLiteDatabase) {}

  /**
   * Returns all shopping lists.
   */
  async getAll(): Promise<ShoppingList[]> {
    const listRows = await this.db.getAllAsync<{
      id: string;
      plan_id: string;
      generated_at: string;
      is_stale: number;
    }>(
      `SELECT id, plan_id, generated_at, is_stale FROM shopping_lists ORDER BY generated_at DESC`
    );

    const lists: ShoppingList[] = [];
    for (const listRow of listRows) {
      const itemRows = await this.db.getAllAsync<{
        id: string;
        list_id: string;
        ingredient_id: string;
        total_quantity_needed: number;
        pantry_quantity_deducted: number;
        net_quantity: number;
        purchase_units: number;
        is_manually_edited: number;
        is_removed: number;
      }>(
        `SELECT id, list_id, ingredient_id, total_quantity_needed, pantry_quantity_deducted, net_quantity, purchase_units, is_manually_edited, is_removed
         FROM shopping_list_items WHERE list_id = ?`,
        [listRow.id]
      );

      lists.push({
        id: listRow.id,
        planId: listRow.plan_id,
        generatedAt: new Date(listRow.generated_at),
        isStale: listRow.is_stale === 1,
        items: itemRows.map((row) => this.mapRowToItem(row)),
      });
    }

    return lists;
  }

  /**
   * Returns a shopping list by ID, or null if not found.
   */
  async getById(id: string): Promise<ShoppingList | null> {
    const listRow = await this.db.getFirstAsync<{
      id: string;
      plan_id: string;
      generated_at: string;
      is_stale: number;
    }>(
      `SELECT id, plan_id, generated_at, is_stale FROM shopping_lists WHERE id = ?`,
      [id]
    );

    if (!listRow) {
      return null;
    }

    const itemRows = await this.db.getAllAsync<{
      id: string;
      list_id: string;
      ingredient_id: string;
      total_quantity_needed: number;
      pantry_quantity_deducted: number;
      net_quantity: number;
      purchase_units: number;
      is_manually_edited: number;
      is_removed: number;
    }>(
      `SELECT id, list_id, ingredient_id, total_quantity_needed, pantry_quantity_deducted, net_quantity, purchase_units, is_manually_edited, is_removed
       FROM shopping_list_items WHERE list_id = ?`,
      [listRow.id]
    );

    return {
      id: listRow.id,
      planId: listRow.plan_id,
      generatedAt: new Date(listRow.generated_at),
      isStale: listRow.is_stale === 1,
      items: itemRows.map((row) => this.mapRowToItem(row)),
    };
  }

  /**
   * Creates a new shopping list for a plan with the given items.
   * Supports both the IRepository interface signature and the legacy 2-arg signature.
   * Runs inside a transaction to ensure atomicity.
   */
  async create(inputOrPlanId: CreateShoppingListInput | string, items?: CreateShoppingListItemInput[]): Promise<ShoppingList> {
    if (typeof inputOrPlanId === 'string') {
      return this.createForPlan(inputOrPlanId, items ?? []);
    }
    return this.createForPlan(inputOrPlanId.planId, inputOrPlanId.items);
  }

  /**
   * Updates a shopping list by ID.
   * Supports both the IRepository interface signature and the legacy 2-arg signature.
   */
  async update(idOrListId: string, inputOrItems: UpdateShoppingListInput | CreateShoppingListItemInput[]): Promise<ShoppingList> {
    // Legacy 2-arg signature: update(listId, items[])
    if (Array.isArray(inputOrItems)) {
      return this.updateItems(idOrListId, inputOrItems);
    }

    // IRepository signature: update(id, { items?, isStale? })
    const input = inputOrItems;
    if (input.items !== undefined) {
      return this.updateItems(idOrListId, input.items);
    }

    if (input.isStale !== undefined) {
      await this.db.runAsync(
        `UPDATE shopping_lists SET is_stale = ? WHERE id = ?`,
        [input.isStale ? 1 : 0, idOrListId]
      );
    }

    const result = await this.getById(idOrListId);
    if (!result) {
      throw new Error(`Shopping list with id '${idOrListId}' not found`);
    }
    return result;
  }

  /**
   * Deletes a shopping list by ID.
   * Returns true if deleted, false if not found.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.runAsync(
      `DELETE FROM shopping_lists WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  }

  /**
   * Creates a new shopping list for a plan with the given items.
   * Runs inside a transaction to ensure atomicity.
   * (Original method signature preserved for backward compatibility)
   */
  async createForPlan(
    planId: string,
    items: CreateShoppingListItemInput[]
  ): Promise<ShoppingList> {
    return withTransaction(this.db, async (db) => {
      const listId = generateId();
      const now = new Date().toISOString();

      await db.runAsync(
        `INSERT INTO shopping_lists (id, plan_id, generated_at, is_stale) VALUES (?, ?, ?, 0)`,
        [listId, planId, now]
      );

      const shoppingItems: ShoppingListItem[] = [];

      for (const item of items) {
        const itemId = generateId();
        await db.runAsync(
          `INSERT INTO shopping_list_items (id, list_id, ingredient_id, total_quantity_needed, pantry_quantity_deducted, net_quantity, purchase_units, is_manually_edited, is_removed, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
          [
            itemId,
            listId,
            item.ingredientId,
            item.totalQuantityNeeded,
            item.pantryQuantityDeducted,
            item.netQuantity,
            item.purchaseUnits,
            now,
          ]
        );

        shoppingItems.push({
          id: itemId,
          listId,
          ingredientId: item.ingredientId,
          totalQuantityNeeded: item.totalQuantityNeeded,
          pantryQuantityDeducted: item.pantryQuantityDeducted,
          netQuantity: item.netQuantity,
          purchaseUnits: item.purchaseUnits,
          isManuallyEdited: false,
          isRemoved: false,
        });
      }

      return {
        id: listId,
        planId,
        items: shoppingItems,
        generatedAt: new Date(now),
        isStale: false,
      };
    });
  }

  /**
   * Returns the shopping list for a given plan (with items populated), or null if none exists.
   */
  async getByPlanId(planId: string): Promise<ShoppingList | null> {
    const listRow = await this.db.getFirstAsync<{
      id: string;
      plan_id: string;
      generated_at: string;
      is_stale: number;
    }>(
      `SELECT id, plan_id, generated_at, is_stale FROM shopping_lists WHERE plan_id = ? ORDER BY generated_at DESC LIMIT 1`,
      [planId]
    );

    if (!listRow) {
      return null;
    }

    const itemRows = await this.db.getAllAsync<{
      id: string;
      list_id: string;
      ingredient_id: string;
      total_quantity_needed: number;
      pantry_quantity_deducted: number;
      net_quantity: number;
      purchase_units: number;
      is_manually_edited: number;
      is_removed: number;
    }>(
      `SELECT id, list_id, ingredient_id, total_quantity_needed, pantry_quantity_deducted, net_quantity, purchase_units, is_manually_edited, is_removed
       FROM shopping_list_items WHERE list_id = ?`,
      [listRow.id]
    );

    return {
      id: listRow.id,
      planId: listRow.plan_id,
      generatedAt: new Date(listRow.generated_at),
      isStale: listRow.is_stale === 1,
      items: itemRows.map((row) => this.mapRowToItem(row)),
    };
  }

  /**
   * Replaces all items in a shopping list (delete existing + insert new).
   * Runs inside a transaction.
   * (Original method signature preserved for backward compatibility)
   */
  async updateItems(
    listId: string,
    items: CreateShoppingListItemInput[]
  ): Promise<ShoppingList> {
    return withTransaction(this.db, async (db) => {
      // Delete existing items
      await db.runAsync(
        `DELETE FROM shopping_list_items WHERE list_id = ?`,
        [listId]
      );

      // Update generated_at and reset is_stale
      const now = new Date().toISOString();
      await db.runAsync(
        `UPDATE shopping_lists SET generated_at = ?, is_stale = 0 WHERE id = ?`,
        [now, listId]
      );

      // Insert new items
      const shoppingItems: ShoppingListItem[] = [];
      for (const item of items) {
        const itemId = generateId();
        await db.runAsync(
          `INSERT INTO shopping_list_items (id, list_id, ingredient_id, total_quantity_needed, pantry_quantity_deducted, net_quantity, purchase_units, is_manually_edited, is_removed, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
          [
            itemId,
            listId,
            item.ingredientId,
            item.totalQuantityNeeded,
            item.pantryQuantityDeducted,
            item.netQuantity,
            item.purchaseUnits,
            now,
          ]
        );

        shoppingItems.push({
          id: itemId,
          listId,
          ingredientId: item.ingredientId,
          totalQuantityNeeded: item.totalQuantityNeeded,
          pantryQuantityDeducted: item.pantryQuantityDeducted,
          netQuantity: item.netQuantity,
          purchaseUnits: item.purchaseUnits,
          isManuallyEdited: false,
          isRemoved: false,
        });
      }

      // Fetch the list record to return full ShoppingList
      const listRow = await db.getFirstAsync<{
        plan_id: string;
        generated_at: string;
        is_stale: number;
      }>(
        `SELECT plan_id, generated_at, is_stale FROM shopping_lists WHERE id = ?`,
        [listId]
      );

      return {
        id: listId,
        planId: listRow!.plan_id,
        generatedAt: new Date(listRow!.generated_at),
        isStale: listRow!.is_stale === 1,
        items: shoppingItems,
      };
    });
  }

  /**
   * Marks a shopping list as stale (is_stale = 1).
   * Called when the associated plan is modified after list generation.
   */
  async markStale(listId: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE shopping_lists SET is_stale = 1 WHERE id = ?`,
      [listId]
    );
  }

  /**
   * Updates the purchase_units on a specific item and marks it as manually edited.
   */
  async editQuantity(itemId: string, purchaseUnits: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE shopping_list_items SET purchase_units = ?, is_manually_edited = 1 WHERE id = ?`,
      [purchaseUnits, itemId]
    );
  }

  /**
   * Soft-deletes an item by setting is_removed = 1.
   */
  async removeItem(itemId: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE shopping_list_items SET is_removed = 1 WHERE id = ?`,
      [itemId]
    );
  }

  /**
   * Maps a database row to a ShoppingListItem domain object.
   */
  private mapRowToItem(row: {
    id: string;
    list_id: string;
    ingredient_id: string;
    total_quantity_needed: number;
    pantry_quantity_deducted: number;
    net_quantity: number;
    purchase_units: number;
    is_manually_edited: number;
    is_removed: number;
  }): ShoppingListItem {
    return {
      id: row.id,
      listId: row.list_id,
      ingredientId: row.ingredient_id,
      totalQuantityNeeded: row.total_quantity_needed,
      pantryQuantityDeducted: row.pantry_quantity_deducted,
      netQuantity: row.net_quantity,
      purchaseUnits: row.purchase_units,
      isManuallyEdited: row.is_manually_edited === 1,
      isRemoved: row.is_removed === 1,
    };
  }
}
