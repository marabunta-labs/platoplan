/**
 * PlatoPlan - Ingredient Repository
 *
 * Encapsulates all SQLite operations for the `ingredients` table.
 * Returns domain types (Ingredient) and accepts input types
 * (CreateIngredientInput, UpdateIngredientInput).
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { Ingredient } from '../models/types';
import type {
  CreateIngredientInput,
  UpdateIngredientInput,
} from '../models/inputs';
import type { IRepository } from './interfaces';
import { generateId } from '../database/database';

/** Raw row shape returned from SQLite queries on the ingredients table */
interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  purchase_format_desc: string;
  purchase_format_quantity: number;
  category: string;
  created_at: string;
  updated_at: string;
}

function parseCategories(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const categories = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (categories.length > 0) return categories;
    }
  } catch {
    // Legacy rows store one plain-text category.
  }
  return value.trim() ? [value.trim()] : [];
}

function serializeCategories(input: CreateIngredientInput | UpdateIngredientInput, fallback?: string[]): string | undefined {
  if (input.categories !== undefined) {
    return JSON.stringify([...new Set(input.categories.map((category) => category.trim()).filter(Boolean))]);
  }
  if (input.category !== undefined) return JSON.stringify([input.category.trim()]);
  return fallback === undefined ? undefined : JSON.stringify(fallback);
}

/** Maps a raw SQLite row to the domain Ingredient type */
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

export class IngredientRepository
  implements IRepository<Ingredient, CreateIngredientInput, UpdateIngredientInput>
{
  constructor(private db: SQLiteDatabase) {}

  /**
   * Creates a new ingredient.
   * Throws if name already exists (UNIQUE constraint).
   */
  async create(input: CreateIngredientInput): Promise<Ingredient> {
    const id = generateId();
    const now = new Date().toISOString();

    await this.db.runAsync(
      `INSERT INTO ingredients (id, name, unit, purchase_format_desc, purchase_format_quantity, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      input.unit,
      input.purchaseFormat.description,
      input.purchaseFormat.quantity,
      serializeCategories(input)!,
      now,
      now
    );

    return {
      id,
      name: input.name,
      unit: input.unit,
      purchaseFormat: input.purchaseFormat,
      category: input.categories?.[0]?.trim() || input.category,
      categories: JSON.parse(serializeCategories(input)!),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Updates an existing ingredient by ID.
   * Only provided fields are updated. Returns the updated ingredient.
   * Throws if ingredient not found.
   */
  async update(
    id: string,
    input: UpdateIngredientInput
  ): Promise<Ingredient> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Ingredient with id '${id}' not found`);
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.unit !== undefined) {
      updates.push('unit = ?');
      values.push(input.unit);
    }
    if (input.purchaseFormat !== undefined) {
      updates.push('purchase_format_desc = ?');
      values.push(input.purchaseFormat.description);
      updates.push('purchase_format_quantity = ?');
      values.push(input.purchaseFormat.quantity);
    }
    const serializedCategories = serializeCategories(input);
    if (serializedCategories !== undefined) {
      updates.push('category = ?');
      values.push(serializedCategories);
    }

    if (updates.length === 0) {
      return existing;
    }

    const now = new Date().toISOString();
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db.runAsync(
      `UPDATE ingredients SET ${updates.join(', ')} WHERE id = ?`,
      ...values
    );

    const updated = await this.getById(id);
    return updated!;
  }

  /**
   * Deletes an ingredient by ID.
   * ON DELETE CASCADE on recipe_ingredients handles cleanup.
   * Returns true if the ingredient was found and deleted, false otherwise.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.runAsync(
      'DELETE FROM ingredients WHERE id = ?',
      id
    );
    return result.changes > 0;
  }

  /**
   * Returns a single ingredient by ID, or null if not found.
   */
  async getById(id: string): Promise<Ingredient | null> {
    const row = await this.db.getFirstAsync<IngredientRow>(
      'SELECT * FROM ingredients WHERE id = ?',
      id
    );
    return row ? mapRowToIngredient(row) : null;
  }

  /**
   * Returns all ingredients sorted alphabetically by name.
   */
  async getAll(): Promise<Ingredient[]> {
    const rows = await this.db.getAllAsync<IngredientRow>(
      'SELECT * FROM ingredients ORDER BY name ASC'
    );
    return rows.map(mapRowToIngredient);
  }

  /**
   * Searches ingredients by partial name match (case-insensitive).
   * Uses LIKE '%query%' pattern.
   */
  async search(query: string): Promise<Ingredient[]> {
    const rows = await this.db.getAllAsync<IngredientRow>(
      'SELECT * FROM ingredients WHERE name LIKE ? ORDER BY name ASC',
      `%${query}%`
    );
    return rows.map(mapRowToIngredient);
  }

  /**
   * Returns the names of recipes that use a given ingredient.
   * Used for the deletion confirmation flow (Requirement 2.5).
   */
  async getRecipesUsingIngredient(ingredientId: string): Promise<string[]> {
    const rows = await this.db.getAllAsync<{ name: string }>(
      `SELECT r.name
       FROM recipes r
       INNER JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       WHERE ri.ingredient_id = ?
       ORDER BY r.name ASC`,
      ingredientId
    );
    return rows.map((row) => row.name);
  }
}
