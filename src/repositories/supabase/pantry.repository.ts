/**
 * PlatoPlan - Supabase Pantry Repository
 *
 * Implements IRepository for the pantry_entries table using Supabase client.
 * Maps between snake_case DB columns and camelCase domain types.
 * All queries are scoped by user_id for data isolation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PantryEntry, Ingredient } from '../../models/types';
import type { IRepository } from '../interfaces';
import type { CreatePantryInput, UpdatePantryInput } from '../pantry.repository';

function parseCategories(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  } catch {}
  return value.trim() ? [value] : [];
}

/** Row shape from a joined Supabase query on pantry_entries + ingredients */
interface PantryRowWithIngredient {
  id: string;
  user_id: string;
  ingredient_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  ingredients: {
    id: string;
    name: string;
    unit: string;
    purchase_format_desc: string;
    purchase_format_quantity: number;
    category: string;
    created_at: string;
    updated_at: string;
  } | null;
}

/** Row shape from a plain Supabase query on pantry_entries */
interface PantryRow {
  id: string;
  user_id: string;
  ingredient_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

/** Maps a Supabase row (with optional joined ingredient) to the domain PantryEntry type */
function mapRowToPantryEntry(row: PantryRowWithIngredient): PantryEntry {
  const entry: PantryEntry = {
    id: row.id,
    ingredientId: row.ingredient_id,
    quantity: row.quantity,
    updatedAt: new Date(row.updated_at),
  };

  if (row.ingredients) {
    const categories = parseCategories(row.ingredients.category);
    entry.ingredient = {
      id: row.ingredients.id,
      name: row.ingredients.name,
      unit: row.ingredients.unit as Ingredient['unit'],
      purchaseFormat: {
        description: row.ingredients.purchase_format_desc,
        quantity: row.ingredients.purchase_format_quantity,
      },
      category: categories[0] ?? '',
      categories,
      createdAt: new Date(row.ingredients.created_at),
      updatedAt: new Date(row.ingredients.updated_at),
    };
  }

  return entry;
}

export class SupabasePantryRepository
  implements IRepository<PantryEntry, CreatePantryInput, UpdatePantryInput>
{
  constructor(
    private client: SupabaseClient,
    private userId: string
  ) {}

  async getAll(): Promise<PantryEntry[]> {
    const { data, error } = await this.client
      .from('pantry_entries')
      .select(`
        id, user_id, ingredient_id, quantity, created_at, updated_at, synced_at,
        ingredients (id, name, unit, purchase_format_desc, purchase_format_quantity, category, created_at, updated_at)
      `)
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch pantry entries: ${error.message}`);
    }

    return (data as PantryRowWithIngredient[]).map(mapRowToPantryEntry);
  }

  async getById(id: string): Promise<PantryEntry | null> {
    const { data, error } = await this.client
      .from('pantry_entries')
      .select(`
        id, user_id, ingredient_id, quantity, created_at, updated_at, synced_at,
        ingredients (id, name, unit, purchase_format_desc, purchase_format_quantity, category, created_at, updated_at)
      `)
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch pantry entry: ${error.message}`);
    }

    return data ? mapRowToPantryEntry(data as PantryRowWithIngredient) : null;
  }

  async create(input: CreatePantryInput): Promise<PantryEntry> {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('pantry_entries')
      .insert({
        user_id: this.userId,
        ingredient_id: input.ingredientId,
        quantity: input.quantity,
        created_at: now,
        updated_at: now,
        synced_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create pantry entry: ${error.message}`);
    }

    const row = data as PantryRow;
    return {
      id: row.id,
      ingredientId: row.ingredient_id,
      quantity: row.quantity,
      updatedAt: new Date(row.updated_at),
    };
  }

  async update(id: string, input: UpdatePantryInput): Promise<PantryEntry> {
    if (input.quantity === undefined) {
      const existing = await this.getById(id);
      if (!existing) {
        throw new Error(`Pantry entry with id '${id}' not found`);
      }
      return existing;
    }

    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('pantry_entries')
      .update({
        quantity: input.quantity,
        synced_at: now,
      })
      .eq('id', id)
      .eq('user_id', this.userId)
      .select(`
        id, user_id, ingredient_id, quantity, created_at, updated_at, synced_at,
        ingredients (id, name, unit, purchase_format_desc, purchase_format_quantity, category, created_at, updated_at)
      `)
      .single();

    if (error) {
      throw new Error(`Failed to update pantry entry: ${error.message}`);
    }

    return mapRowToPantryEntry(data as PantryRowWithIngredient);
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await this.client
      .from('pantry_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to delete pantry entry: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }
}
