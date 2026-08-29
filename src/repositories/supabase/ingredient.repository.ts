/**
 * PlatoPlan - Supabase Ingredient Repository
 *
 * Implements IRepository for the ingredients table using Supabase client.
 * Maps between snake_case DB columns and camelCase domain types.
 * All queries are scoped by user_id for data isolation (in addition to RLS).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Ingredient } from '../../models/types';
import type {
  CreateIngredientInput,
  UpdateIngredientInput,
} from '../../models/inputs';
import type { IRepository } from '../interfaces';

/** Row shape from the Supabase ingredients table */
interface IngredientRow {
  id: string;
  user_id: string;
  name: string;
  unit: string;
  purchase_format_desc: string;
  purchase_format_quantity: number;
  category: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

function parseCategories(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const categories = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (categories.length) return categories;
    }
  } catch {
    // Pre-multiple-category records store the category as plain text.
  }
  return value.trim() ? [value.trim()] : [];
}

function serializeCategories(input: CreateIngredientInput | UpdateIngredientInput): string | undefined {
  if (input.categories !== undefined) return JSON.stringify([...new Set(input.categories.map((category) => category.trim()).filter(Boolean))]);
  if (input.category !== undefined) return JSON.stringify([input.category.trim()]);
  return undefined;
}

/** Maps a Supabase row to the domain Ingredient type */
function mapRowToIngredient(row: IngredientRow): Ingredient {
  const categories = parseCategories(row.category);
  return {
    id: row.id,
    name: row.name,
    unit: row.unit as Ingredient['unit'],
    purchaseFormat: {
      description: row.purchase_format_desc,
      quantity: row.purchase_format_quantity,
    },
    category: categories[0] ?? '',
    categories,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SupabaseIngredientRepository
  implements IRepository<Ingredient, CreateIngredientInput, UpdateIngredientInput>
{
  constructor(
    private client: SupabaseClient,
    private userId: string
  ) {}

  async getAll(): Promise<Ingredient[]> {
    const { data, error } = await this.client
      .from('ingredients')
      .select('*')
      .eq('user_id', this.userId)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch ingredients: ${error.message}`);
    }

    return (data as IngredientRow[]).map(mapRowToIngredient);
  }

  async getById(id: string): Promise<Ingredient | null> {
    const { data, error } = await this.client
      .from('ingredients')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch ingredient: ${error.message}`);
    }

    return data ? mapRowToIngredient(data as IngredientRow) : null;
  }

  async create(input: CreateIngredientInput): Promise<Ingredient> {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('ingredients')
      .insert({
        user_id: this.userId,
        name: input.name,
        unit: input.unit,
        purchase_format_desc: input.purchaseFormat.description,
        purchase_format_quantity: input.purchaseFormat.quantity,
        category: serializeCategories(input),
        created_at: now,
        updated_at: now,
        synced_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create ingredient: ${error.message}`);
    }

    return mapRowToIngredient(data as IngredientRow);
  }

  async update(id: string, input: UpdateIngredientInput): Promise<Ingredient> {
    const updates: Record<string, unknown> = {};

    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (input.unit !== undefined) {
      updates.unit = input.unit;
    }
    if (input.purchaseFormat !== undefined) {
      updates.purchase_format_desc = input.purchaseFormat.description;
      updates.purchase_format_quantity = input.purchaseFormat.quantity;
    }
    const categories = serializeCategories(input);
    if (categories !== undefined) {
      updates.category = categories;
    }

    if (Object.keys(updates).length === 0) {
      const existing = await this.getById(id);
      if (!existing) {
        throw new Error(`Ingredient with id '${id}' not found`);
      }
      return existing;
    }

    updates.synced_at = new Date().toISOString();

    const { data, error } = await this.client
      .from('ingredients')
      .update(updates)
      .eq('id', id)
      .eq('user_id', this.userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update ingredient: ${error.message}`);
    }

    return mapRowToIngredient(data as IngredientRow);
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await this.client
      .from('ingredients')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to delete ingredient: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  async search(query: string): Promise<Ingredient[]> {
    const { data, error } = await this.client
      .from('ingredients')
      .select('*')
      .eq('user_id', this.userId)
      .ilike('name', `%${query}%`)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to search ingredients: ${error.message}`);
    }

    return (data as IngredientRow[]).map(mapRowToIngredient);
  }
}
