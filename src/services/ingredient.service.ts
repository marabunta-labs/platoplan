/**
 * PlatoPlan - Ingredient Service
 *
 * Implements business logic and validation for ingredient CRUD operations.
 * Delegates persistence to the IngredientRepository.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { Ingredient } from '../models/types';
import type {
  CreateIngredientInput,
  UpdateIngredientInput,
} from '../models/inputs';
import type { ValidationError, ConflictError } from '../models/errors';
import type { MeasureUnit } from '../models/enums';
import { IngredientRepository } from '../repositories/ingredient.repository';

/** Valid measurement units */
const VALID_UNITS: MeasureUnit[] = ['gramos', 'mililitros', 'unidades'];

/** Result type for delete operation */
export interface DeleteIngredientResult {
  affectedRecipes: string[];
}

/** Service interface for ingredient operations */
export interface IIngredientService {
  create(ingredient: CreateIngredientInput): Promise<Ingredient>;
  update(id: string, ingredient: UpdateIngredientInput): Promise<Ingredient>;
  delete(id: string): Promise<DeleteIngredientResult>;
  getAll(): Promise<Ingredient[]>;
  search(query: string): Promise<Ingredient[]>;
  getRecipesUsing(ingredientId: string): Promise<string[]>;
}

export class IngredientService implements IIngredientService {
  private repository: IngredientRepository;

  constructor(db: SQLiteDatabase) {
    this.repository = new IngredientRepository(db);
  }

  /**
   * Creates a new ingredient after validating all fields.
   * Throws ValidationError for invalid input or ConflictError for duplicate names.
   */
  async create(input: CreateIngredientInput): Promise<Ingredient> {
    this.validateCreateInput(input);
    await this.ensureUniqueName(input.name);

    return this.repository.create(input);
  }

  /**
   * Updates an existing ingredient after validating provided fields.
   * Throws ValidationError for invalid input, ConflictError for duplicate names,
   * or Error if ingredient not found.
   */
  async update(id: string, input: UpdateIngredientInput): Promise<Ingredient> {
    this.validateUpdateInput(input);

    if (input.name !== undefined) {
      await this.ensureUniqueName(input.name, id);
    }

    const updated = await this.repository.update(id, input);
    if (!updated) {
      throw new Error(`Ingredient with id "${id}" not found`);
    }

    return updated;
  }

  /**
   * Deletes an ingredient by ID.
   * Returns the list of recipe names that were using this ingredient.
   */
  async delete(id: string): Promise<DeleteIngredientResult> {
    const affectedRecipes =
      await this.repository.getRecipesUsingIngredient(id);

    const deleted = await this.repository.delete(id);
    if (!deleted) {
      throw new Error(`Ingredient with id "${id}" not found`);
    }

    return { affectedRecipes };
  }

  /**
   * Returns all ingredients sorted alphabetically.
   */
  async getAll(): Promise<Ingredient[]> {
    return this.repository.getAll();
  }

  /**
   * Searches ingredients by partial name match (case-insensitive).
   */
  async search(query: string): Promise<Ingredient[]> {
    return this.repository.search(query);
  }

  /**
   * Returns the names of recipes using a given ingredient.
   * Used for deletion confirmation UI.
   */
  async getRecipesUsing(ingredientId: string): Promise<string[]> {
    return this.repository.getRecipesUsingIngredient(ingredientId);
  }

  // ─── Private validation helpers ───────────────────────────────────────

  private validateCreateInput(input: CreateIngredientInput): void {
    const errors: { field: string; message: string }[] = [];

    // Name validation
    if (!input.name || input.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Name is required' });
    } else if (input.name.length > 100) {
      errors.push({
        field: 'name',
        message: 'Name must be at most 100 characters',
      });
    }

    // Unit validation
    if (!VALID_UNITS.includes(input.unit)) {
      errors.push({
        field: 'unit',
        message: `Unit must be one of: ${VALID_UNITS.join(', ')}`,
      });
    }

    // Purchase format validation
    if (
      !input.purchaseFormat ||
      input.purchaseFormat.quantity === undefined ||
      input.purchaseFormat.quantity <= 0
    ) {
      errors.push({
        field: 'purchaseFormat.quantity',
        message: 'Purchase format quantity must be greater than 0',
      });
    }

    // Category validation
    const categories = input.categories ?? (input.category === undefined || input.category === null ? [] : [input.category]);
    if (categories.length === 0 || categories.some((category) => !category.trim())) {
      errors.push({
        field: 'category',
        message: 'Category is required',
      });
    }

    if (errors.length > 0) {
      const error: ValidationError = { type: 'validation', fields: errors };
      throw error;
    }
  }

  private validateUpdateInput(input: UpdateIngredientInput): void {
    const errors: { field: string; message: string }[] = [];

    // Name validation (only if provided)
    if (input.name !== undefined) {
      if (input.name.trim().length === 0) {
        errors.push({ field: 'name', message: 'Name is required' });
      } else if (input.name.length > 100) {
        errors.push({
          field: 'name',
          message: 'Name must be at most 100 characters',
        });
      }
    }

    // Unit validation (only if provided)
    if (input.unit !== undefined && !VALID_UNITS.includes(input.unit)) {
      errors.push({
        field: 'unit',
        message: `Unit must be one of: ${VALID_UNITS.join(', ')}`,
      });
    }

    // Purchase format validation (only if provided)
    if (input.purchaseFormat !== undefined) {
      if (
        input.purchaseFormat.quantity === undefined ||
        input.purchaseFormat.quantity <= 0
      ) {
        errors.push({
          field: 'purchaseFormat.quantity',
          message: 'Purchase format quantity must be greater than 0',
        });
      }
    }

    if (input.categories !== undefined && (input.categories.length === 0 || input.categories.some((category) => !category.trim()))) {
      errors.push({ field: 'category', message: 'At least one category is required' });
    }

    if (errors.length > 0) {
      const error: ValidationError = { type: 'validation', fields: errors };
      throw error;
    }
  }

  /**
   * Ensures the ingredient name is unique.
   * For update operations, excludes the current ingredient from the check.
   */
  private async ensureUniqueName(
    name: string,
    excludeId?: string
  ): Promise<void> {
    const allIngredients = await this.repository.getAll();
    const normalizedName = name.trim().toLowerCase();

    const duplicate = allIngredients.find(
      (ing) =>
        ing.name.trim().toLowerCase() === normalizedName &&
        ing.id !== excludeId
    );

    if (duplicate) {
      const error: ConflictError = {
        type: 'conflict',
        message: `An ingredient with the name "${name}" already exists`,
        existingId: duplicate.id,
      };
      throw error;
    }
  }
}
