/**
 * PlatoPlan - Supabase Shopping List Repository
 *
 * Implements IRepository for the shopping_lists and shopping_list_items tables
 * using Supabase client. Maps between snake_case DB columns and camelCase domain types.
 * All queries are scoped by user_id for data isolation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShoppingList, ShoppingListItem } from '../../models/types';
import type { IRepository } from '../interfaces';
import type {
  CreateShoppingListInput,
  UpdateShoppingListInput,
  CreateShoppingListItemInput,
} from '../shopping-list.repository';

/** Row shape from the Supabase shopping_lists table */
interface ShoppingListRow {
  id: string;
  user_id: string;
  plan_id: string;
  generated_at: string;
  is_stale: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

/** Row shape from the Supabase shopping_list_items table */
interface ShoppingListItemRow {
  id: string;
  user_id: string;
  list_id: string;
  ingredient_id: string;
  total_quantity_needed: number;
  pantry_quantity_deducted: number;
  net_quantity: number;
  purchase_units: number;
  is_manually_edited: boolean;
  is_removed: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

function mapRowToShoppingList(row: ShoppingListRow, items: ShoppingListItem[]): ShoppingList {
  return {
    id: row.id,
    planId: row.plan_id,
    generatedAt: new Date(row.generated_at),
    isStale: row.is_stale,
    items,
  };
}

function mapRowToItem(row: ShoppingListItemRow): ShoppingListItem {
  return {
    id: row.id,
    listId: row.list_id,
    ingredientId: row.ingredient_id,
    totalQuantityNeeded: row.total_quantity_needed,
    pantryQuantityDeducted: row.pantry_quantity_deducted,
    netQuantity: row.net_quantity,
    purchaseUnits: row.purchase_units,
    isManuallyEdited: row.is_manually_edited,
    isRemoved: row.is_removed,
  };
}

export class SupabaseShoppingListRepository
  implements IRepository<ShoppingList, CreateShoppingListInput, UpdateShoppingListInput>
{
  constructor(
    private client: SupabaseClient,
    private userId: string
  ) {}

  async getAll(): Promise<ShoppingList[]> {
    const { data: listRows, error: listError } = await this.client
      .from('shopping_lists')
      .select('*')
      .eq('user_id', this.userId)
      .order('generated_at', { ascending: false });

    if (listError) {
      throw new Error(`Failed to fetch shopping lists: ${listError.message}`);
    }

    const lists: ShoppingList[] = [];

    for (const listRow of listRows as ShoppingListRow[]) {
      const items = await this.fetchItems(listRow.id);
      lists.push(mapRowToShoppingList(listRow, items));
    }

    return lists;
  }

  async getById(id: string): Promise<ShoppingList | null> {
    const { data, error } = await this.client
      .from('shopping_lists')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch shopping list: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const items = await this.fetchItems(data.id);
    return mapRowToShoppingList(data as ShoppingListRow, items);
  }

  async create(input: CreateShoppingListInput): Promise<ShoppingList> {
    const now = new Date().toISOString();

    // Insert shopping list
    const { data: listData, error: listError } = await this.client
      .from('shopping_lists')
      .insert({
        user_id: this.userId,
        plan_id: input.planId,
        generated_at: now,
        is_stale: false,
        created_at: now,
        updated_at: now,
        synced_at: now,
      })
      .select()
      .single();

    if (listError) {
      throw new Error(`Failed to create shopping list: ${listError.message}`);
    }

    const listRow = listData as ShoppingListRow;

    // Insert items
    const items: ShoppingListItem[] = [];
    if (input.items.length > 0) {
      const itemRows = input.items.map((item) => ({
        user_id: this.userId,
        list_id: listRow.id,
        ingredient_id: item.ingredientId,
        total_quantity_needed: item.totalQuantityNeeded,
        pantry_quantity_deducted: item.pantryQuantityDeducted,
        net_quantity: item.netQuantity,
        purchase_units: item.purchaseUnits,
        is_manually_edited: false,
        is_removed: false,
        created_at: now,
        updated_at: now,
        synced_at: now,
      }));

      const { data: insertedItems, error: itemError } = await this.client
        .from('shopping_list_items')
        .insert(itemRows)
        .select();

      if (itemError) {
        throw new Error(`Failed to create shopping list items: ${itemError.message}`);
      }

      for (const row of insertedItems as ShoppingListItemRow[]) {
        items.push(mapRowToItem(row));
      }
    }

    return mapRowToShoppingList(listRow, items);
  }

  async update(id: string, input: UpdateShoppingListInput): Promise<ShoppingList> {
    const now = new Date().toISOString();

    // Update the is_stale flag if provided
    if (input.isStale !== undefined) {
      const { error } = await this.client
        .from('shopping_lists')
        .update({ is_stale: input.isStale, synced_at: now })
        .eq('id', id)
        .eq('user_id', this.userId);

      if (error) {
        throw new Error(`Failed to update shopping list: ${error.message}`);
      }
    }

    // Replace items if provided
    if (input.items !== undefined) {
      // Delete existing items
      const { error: deleteError } = await this.client
        .from('shopping_list_items')
        .delete()
        .eq('list_id', id)
        .eq('user_id', this.userId);

      if (deleteError) {
        throw new Error(`Failed to delete shopping list items: ${deleteError.message}`);
      }

      // Update generated_at and reset is_stale
      const { error: updateError } = await this.client
        .from('shopping_lists')
        .update({ generated_at: now, is_stale: false, synced_at: now })
        .eq('id', id)
        .eq('user_id', this.userId);

      if (updateError) {
        throw new Error(`Failed to update shopping list timestamp: ${updateError.message}`);
      }

      // Insert new items
      if (input.items.length > 0) {
        const itemRows = input.items.map((item: CreateShoppingListItemInput) => ({
          user_id: this.userId,
          list_id: id,
          ingredient_id: item.ingredientId,
          total_quantity_needed: item.totalQuantityNeeded,
          pantry_quantity_deducted: item.pantryQuantityDeducted,
          net_quantity: item.netQuantity,
          purchase_units: item.purchaseUnits,
          is_manually_edited: false,
          is_removed: false,
          created_at: now,
          updated_at: now,
          synced_at: now,
        }));

        const { error: insertError } = await this.client
          .from('shopping_list_items')
          .insert(itemRows);

        if (insertError) {
          throw new Error(`Failed to insert shopping list items: ${insertError.message}`);
        }
      }
    }

    // Fetch and return the full updated list
    const result = await this.getById(id);
    if (!result) {
      throw new Error(`Shopping list with id '${id}' not found`);
    }
    return result;
  }

  async delete(id: string): Promise<boolean> {
    // shopping_list_items are cascade-deleted via foreign key
    const { error, count } = await this.client
      .from('shopping_lists')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to delete shopping list: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  /**
   * Fetches all items for a given shopping list.
   */
  private async fetchItems(listId: string): Promise<ShoppingListItem[]> {
    const { data, error } = await this.client
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', listId)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to fetch shopping list items: ${error.message}`);
    }

    return (data as ShoppingListItemRow[]).map(mapRowToItem);
  }
}
