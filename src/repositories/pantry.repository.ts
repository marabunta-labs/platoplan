/**
 * PlatoPlan - Pantry Repository
 *
 * Encapsulates all SQLite operations for the `pantry_entries` table.
 * Implements IRepository for consistent interface with other repositories.
 */

import type * as SQLite from 'expo-sqlite';
import type { PantryEntry } from '../models/types';
import type { IRepository } from './interfaces';
import { generateId } from '../database/database';

function parseCategories(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  } catch {}
  return [value];
}

/** Input type for creating a new pantry entry */
export interface CreatePantryInput {
  ingredientId: string;
  quantity: number;
}

/** Input type for updating a pantry entry */
export interface UpdatePantryInput {
  quantity?: number;
}

/**
 * Repository for managing pantry entries in the database.
 * Handles CRUD operations for the pantry_entries table.
 */
export class PantryRepository
  implements IRepository<PantryEntry, CreatePantryInput, UpdatePantryInput>
{
  constructor(private db: SQLite.SQLiteDatabase) {}

  /**
   * Returns all pantry entries, sorted alphabetically by ingredient name.
   * Joins with the ingredients table to get the ingredient name for sorting
   * and to populate the ingredient field.
   */
  async getAll(): Promise<PantryEntry[]> {
    const rows = await this.db.getAllAsync<{
      id: string;
      ingredient_id: string;
      quantity: number;
      updated_at: string;
      ingredient_name: string;
      ingredient_unit: string;
      ingredient_purchase_format_desc: string;
      ingredient_purchase_format_quantity: number;
      ingredient_category: string;
      ingredient_created_at: string;
      ingredient_updated_at: string;
    }>(
      `SELECT 
        pe.id,
        pe.ingredient_id,
        pe.quantity,
        pe.updated_at,
        i.name AS ingredient_name,
        i.unit AS ingredient_unit,
        i.purchase_format_desc AS ingredient_purchase_format_desc,
        i.purchase_format_quantity AS ingredient_purchase_format_quantity,
        i.category AS ingredient_category,
        i.created_at AS ingredient_created_at,
        i.updated_at AS ingredient_updated_at
      FROM pantry_entries pe
      JOIN ingredients i ON pe.ingredient_id = i.id
      ORDER BY i.name ASC`
    );

    return rows.map((row) => this.mapRowToPantryEntry(row));
  }

  /**
   * Returns a single pantry entry by ID, or null if not found.
   */
  async getById(id: string): Promise<PantryEntry | null> {
    const row = await this.db.getFirstAsync<{
      id: string;
      ingredient_id: string;
      quantity: number;
      updated_at: string;
      ingredient_name: string | null;
      ingredient_unit: string | null;
      ingredient_purchase_format_desc: string | null;
      ingredient_purchase_format_quantity: number | null;
      ingredient_category: string | null;
      ingredient_created_at: string | null;
      ingredient_updated_at: string | null;
    }>(
      `SELECT 
        pe.id,
        pe.ingredient_id,
        pe.quantity,
        pe.updated_at,
        i.name AS ingredient_name,
        i.unit AS ingredient_unit,
        i.purchase_format_desc AS ingredient_purchase_format_desc,
        i.purchase_format_quantity AS ingredient_purchase_format_quantity,
        i.category AS ingredient_category,
        i.created_at AS ingredient_created_at,
        i.updated_at AS ingredient_updated_at
      FROM pantry_entries pe
      LEFT JOIN ingredients i ON pe.ingredient_id = i.id
      WHERE pe.id = ?`,
      [id]
    );

    if (!row) {
      return null;
    }

    return this.mapRowToPantryEntry(row);
  }

  /**
   * Creates a new pantry entry.
   */
  async create(input: CreatePantryInput): Promise<PantryEntry> {
    const id = generateId();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO pantry_entries (id, ingredient_id, quantity, updated_at) VALUES (?, ?, ?, ?)`,
      [id, input.ingredientId, input.quantity, now]
    );
    return {
      id,
      ingredientId: input.ingredientId,
      quantity: input.quantity,
      updatedAt: new Date(now),
    };
  }

  /**
   * Updates an existing pantry entry by ID.
   */
  async update(id: string, input: UpdatePantryInput): Promise<PantryEntry> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Pantry entry with id '${id}' not found`);
    }

    if (input.quantity !== undefined) {
      const now = new Date().toISOString();
      await this.db.runAsync(
        `UPDATE pantry_entries SET quantity = ?, updated_at = ? WHERE id = ?`,
        [input.quantity, now, id]
      );
      return {
        ...existing,
        quantity: input.quantity,
        updatedAt: new Date(now),
      };
    }

    return existing;
  }

  /**
   * Deletes a pantry entry by ID.
   * Returns true if deleted, false if not found.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.runAsync(
      `DELETE FROM pantry_entries WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  }

  /**
   * Adds a new pantry entry or updates an existing one for the given ingredient.
   * Uses upsert semantics: if an entry for the ingredient_id already exists,
   * the quantity is updated; otherwise a new entry is inserted.
   */
  async addOrUpdate(ingredientId: string, quantity: number): Promise<PantryEntry> {
    const existing = await this.getByIngredientId(ingredientId);

    if (existing) {
      // Update existing entry
      const now = new Date().toISOString();
      await this.db.runAsync(
        `UPDATE pantry_entries SET quantity = ?, updated_at = ? WHERE ingredient_id = ?`,
        [quantity, now, ingredientId]
      );
      return {
        ...existing,
        quantity,
        updatedAt: new Date(now),
      };
    } else {
      // Insert new entry
      const id = generateId();
      const now = new Date().toISOString();
      await this.db.runAsync(
        `INSERT INTO pantry_entries (id, ingredient_id, quantity, updated_at) VALUES (?, ?, ?, ?)`,
        [id, ingredientId, quantity, now]
      );
      return {
        id,
        ingredientId,
        quantity,
        updatedAt: new Date(now),
      };
    }
  }

  /**
   * Removes the pantry entry for the given ingredient.
   */
  async remove(ingredientId: string): Promise<void> {
    await this.db.runAsync(
      `DELETE FROM pantry_entries WHERE ingredient_id = ?`,
      [ingredientId]
    );
  }

  /**
   * Returns the pantry entry for a specific ingredient, or null if not found.
   */
  async getByIngredientId(ingredientId: string): Promise<PantryEntry | null> {
    const row = await this.db.getFirstAsync<{
      id: string;
      ingredient_id: string;
      quantity: number;
      updated_at: string;
      ingredient_name: string | null;
      ingredient_unit: string | null;
      ingredient_purchase_format_desc: string | null;
      ingredient_purchase_format_quantity: number | null;
      ingredient_category: string | null;
      ingredient_created_at: string | null;
      ingredient_updated_at: string | null;
    }>(
      `SELECT 
        pe.id,
        pe.ingredient_id,
        pe.quantity,
        pe.updated_at,
        i.name AS ingredient_name,
        i.unit AS ingredient_unit,
        i.purchase_format_desc AS ingredient_purchase_format_desc,
        i.purchase_format_quantity AS ingredient_purchase_format_quantity,
        i.category AS ingredient_category,
        i.created_at AS ingredient_created_at,
        i.updated_at AS ingredient_updated_at
      FROM pantry_entries pe
      LEFT JOIN ingredients i ON pe.ingredient_id = i.id
      WHERE pe.ingredient_id = ?`,
      [ingredientId]
    );

    if (!row) {
      return null;
    }

    return this.mapRowToPantryEntry(row);
  }

  /**
   * Maps a database row to a PantryEntry domain object.
   */
  private mapRowToPantryEntry(row: {
    id: string;
    ingredient_id: string;
    quantity: number;
    updated_at: string;
    ingredient_name: string | null;
    ingredient_unit: string | null;
    ingredient_purchase_format_desc: string | null;
    ingredient_purchase_format_quantity: number | null;
    ingredient_category: string | null;
    ingredient_created_at: string | null;
    ingredient_updated_at: string | null;
  }): PantryEntry {
    const entry: PantryEntry = {
      id: row.id,
      ingredientId: row.ingredient_id,
      quantity: row.quantity,
      updatedAt: new Date(row.updated_at),
    };

    // Populate ingredient if data is available from JOIN
    if (row.ingredient_name !== null) {
      const categories = parseCategories(row.ingredient_category);
      entry.ingredient = {
        id: row.ingredient_id,
        name: row.ingredient_name,
        unit: row.ingredient_unit as 'gramos' | 'mililitros' | 'unidades',
        purchaseFormat: {
          description: row.ingredient_purchase_format_desc!,
          quantity: row.ingredient_purchase_format_quantity!,
        },
        category: categories[0] ?? '',
        categories,
        createdAt: new Date(row.ingredient_created_at!),
        updatedAt: new Date(row.ingredient_updated_at!),
      };
    }

    return entry;
  }
}
