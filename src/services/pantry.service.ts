/**
 * Pantry Service - Business logic for managing the user's pantry inventory.
 * Handles validation, upsert semantics, and recipe availability classification.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { PantryEntry, Recipe } from '../models/types';
import type { ValidationError } from '../models/errors';
import { PantryRepository } from '../repositories/pantry.repository';
import * as recipeRepository from '../repositories/recipe.repository';

export interface IPantryService {
  addOrUpdate(entry: PantryEntry): Promise<PantryEntry>;
  remove(ingredientId: string): Promise<void>;
  getAll(): Promise<PantryEntry[]>;
  getAvailableQuantity(ingredientId: string): Promise<number>;
  getPreparableRecipes(): Promise<{
    full: Recipe[];
    partial: Recipe[];
  }>;
}

export class PantryService implements IPantryService {
  private pantryRepository: PantryRepository;
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
    this.pantryRepository = new PantryRepository(db);
  }

  /**
   * Adds or updates a pantry entry.
   * Uses upsert semantics: if an entry for the ingredient already exists,
   * the quantity is updated; otherwise a new entry is created.
   *
   * @throws ValidationError if ingredientId is missing or quantity <= 0
   */
  async addOrUpdate(entry: PantryEntry): Promise<PantryEntry> {
    const validationErrors: { field: string; message: string }[] = [];

    if (!entry.ingredientId || entry.ingredientId.trim() === '') {
      validationErrors.push({
        field: 'ingredientId',
        message: 'El ingrediente es obligatorio',
      });
    }

    if (entry.quantity === undefined || entry.quantity === null || entry.quantity <= 0) {
      validationErrors.push({
        field: 'quantity',
        message: 'La cantidad debe ser mayor que 0',
      });
    }

    if (validationErrors.length > 0) {
      const error: ValidationError = {
        type: 'validation',
        fields: validationErrors,
      };
      throw error;
    }

    return this.pantryRepository.addOrUpdate(entry.ingredientId, entry.quantity);
  }

  /**
   * Removes a pantry entry for the given ingredient.
   */
  async remove(ingredientId: string): Promise<void> {
    return this.pantryRepository.remove(ingredientId);
  }

  /**
   * Returns all pantry entries, sorted alphabetically by ingredient name.
   */
  async getAll(): Promise<PantryEntry[]> {
    return this.pantryRepository.getAll();
  }

  /**
   * Returns the available quantity for a specific ingredient in the pantry.
   * Returns 0 if the ingredient is not in the pantry.
   */
  async getAvailableQuantity(ingredientId: string): Promise<number> {
    const entry = await this.pantryRepository.getByIngredientId(ingredientId);
    return entry ? entry.quantity : 0;
  }

  /**
   * Classifies all recipes based on pantry availability:
   * - full: ALL ingredients have pantry quantity >= required quantity
   * - partial: at least 50% of ingredients (Math.floor(count * 0.5)) have
   *   sufficient quantity, but NOT all
   *
   * Recipes where less than 50% of ingredients are available are excluded.
   */
  async getPreparableRecipes(): Promise<{ full: Recipe[]; partial: Recipe[] }> {
    const recipes = await recipeRepository.getAll(this.db);
    const pantryEntries = await this.pantryRepository.getAll();

    // Build a map of ingredientId -> available quantity for quick lookup
    const pantryMap = new Map<string, number>();
    for (const entry of pantryEntries) {
      pantryMap.set(entry.ingredientId, entry.quantity);
    }

    const full: Recipe[] = [];
    const partial: Recipe[] = [];

    for (const recipe of recipes) {
      if (recipe.ingredients.length === 0) {
        // A recipe with no ingredients can't be meaningfully classified
        continue;
      }

      let sufficientCount = 0;
      const totalIngredients = recipe.ingredients.length;

      for (const recipeIngredient of recipe.ingredients) {
        const available = pantryMap.get(recipeIngredient.ingredientId) ?? 0;
        if (available >= recipeIngredient.quantity) {
          sufficientCount++;
        }
      }

      if (sufficientCount === totalIngredients) {
        // Fully preparable: all ingredients available in sufficient quantity
        full.push(recipe);
      } else {
        // Check if at least 50% of ingredients are sufficient
        const threshold = Math.floor(totalIngredients * 0.5);
        if (sufficientCount >= threshold && threshold > 0) {
          partial.push(recipe);
        }
      }
    }

    return { full, partial };
  }
}
