/**
 * Recipe Service - Business logic layer for recipe management.
 * Validates inputs before delegating to the repository.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { Recipe } from '../models/types';
import type { MealType, PrepTime } from '../models/enums';
import type { CreateRecipeInput, UpdateRecipeInput } from '../models/inputs';
import type { ValidationError, ConflictError, ConstraintError } from '../models/errors';
import * as recipeRepository from '../repositories/recipe.repository';

const MAX_RECIPES = 500;
const MAX_NAME_LENGTH = 100;
const VALID_MEAL_TYPES: MealType[] = ['comida', 'cena', 'ambas'];
const VALID_PREP_TIMES: PrepTime[] = ['rapido', 'elaborado'];

export type RecipeServiceError = ValidationError | ConflictError | ConstraintError;

export interface RecipeServiceResult<T> {
  success: true;
  data: T;
}

export interface RecipeServiceFailure {
  success: false;
  error: RecipeServiceError;
}

export type ServiceResult<T> = RecipeServiceResult<T> | RecipeServiceFailure;

/**
 * Validates a CreateRecipeInput and returns field-level errors if any.
 */
function validateCreateInput(input: CreateRecipeInput): ValidationError | null {
  const fields: { field: string; message: string }[] = [];

  // Name validation
  if (!input.name || input.name.trim().length === 0) {
    fields.push({ field: 'name', message: 'El nombre es obligatorio' });
  } else if (input.name.trim().length > MAX_NAME_LENGTH) {
    fields.push({ field: 'name', message: `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres` });
  }

  // Ingredients validation (only check quantities if ingredients are provided)
  if (input.ingredients && input.ingredients.length > 0) {
    const invalidQuantities = input.ingredients.some((ing) => ing.quantity <= 0);
    if (invalidQuantities) {
      fields.push({ field: 'ingredients', message: 'Todos los ingredientes deben tener cantidad mayor a 0' });
    }
  }

  // PrepTime validation
  if (!input.prepTime || !VALID_PREP_TIMES.includes(input.prepTime as PrepTime)) {
    fields.push({ field: 'prepTime', message: 'El tiempo de preparación debe ser "rapido" o "elaborado"' });
  }

  // MealType validation
  if (!input.mealType || !VALID_MEAL_TYPES.includes(input.mealType as MealType)) {
    fields.push({ field: 'mealType', message: 'El tipo de comida debe ser "comida", "cena" o "ambas"' });
  }

  if (fields.length > 0) {
    return { type: 'validation', fields };
  }

  return null;
}

/**
 * Validates an UpdateRecipeInput and returns field-level errors if any.
 * Only validates fields that are actually provided.
 */
function validateUpdateInput(input: UpdateRecipeInput): ValidationError | null {
  const fields: { field: string; message: string }[] = [];

  // Name validation (only if provided)
  if (input.name !== undefined) {
    if (input.name.trim().length === 0) {
      fields.push({ field: 'name', message: 'El nombre es obligatorio' });
    } else if (input.name.trim().length > MAX_NAME_LENGTH) {
      fields.push({ field: 'name', message: `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres` });
    }
  }

  // Ingredients validation (only if provided and non-empty, check quantities)
  if (input.ingredients !== undefined && input.ingredients.length > 0) {
    const invalidQuantities = input.ingredients.some((ing) => ing.quantity <= 0);
    if (invalidQuantities) {
      fields.push({ field: 'ingredients', message: 'Todos los ingredientes deben tener cantidad mayor a 0' });
    }
  }

  // PrepTime validation (only if provided)
  if (input.prepTime !== undefined && !VALID_PREP_TIMES.includes(input.prepTime as PrepTime)) {
    fields.push({ field: 'prepTime', message: 'El tiempo de preparación debe ser "rapido" o "elaborado"' });
  }

  // MealType validation (only if provided)
  if (input.mealType !== undefined && !VALID_MEAL_TYPES.includes(input.mealType as MealType)) {
    fields.push({ field: 'mealType', message: 'El tipo de comida debe ser "comida", "cena" o "ambas"' });
  }

  if (fields.length > 0) {
    return { type: 'validation', fields };
  }

  return null;
}

/**
 * Creates the recipe service bound to a specific database instance.
 */
export function createRecipeService(db: SQLiteDatabase) {
  /**
   * Checks if a recipe with the given name already exists.
   */
  async function existsByName(name: string, excludeId?: string): Promise<boolean> {
    const all = await recipeRepository.getAll(db);
    return all.some(
      (r) => r.name === name.trim() && r.id !== excludeId
    );
  }

  return {
    /**
     * Creates a new recipe after validating input, checking uniqueness, and enforcing the 500 recipe limit.
     */
    async create(input: CreateRecipeInput): Promise<ServiceResult<Recipe>> {
      // Validate input
      const validationError = validateCreateInput(input);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Check recipe count limit
      const count = await recipeRepository.getCount(db);
      if (count >= MAX_RECIPES) {
        const constraintError: ConstraintError = {
          type: 'constraint',
          message: `No se pueden crear más de ${MAX_RECIPES} recetas`,
          details: { currentCount: count, maxAllowed: MAX_RECIPES },
        };
        return { success: false, error: constraintError };
      }

      // Check name uniqueness
      const nameExists = await existsByName(input.name);
      if (nameExists) {
        const conflictError: ConflictError = {
          type: 'conflict',
          message: `Ya existe una receta con el nombre "${input.name.trim()}"`,
        };
        return { success: false, error: conflictError };
      }

      // Trim the name before creating
      const sanitizedInput: CreateRecipeInput = {
        ...input,
        name: input.name.trim(),
      };

      const recipe = await recipeRepository.create(db, sanitizedInput);
      return { success: true, data: recipe };
    },

    /**
     * Updates an existing recipe after validating input and checking uniqueness for name changes.
     */
    async update(id: string, input: UpdateRecipeInput): Promise<ServiceResult<Recipe>> {
      // Validate input
      const validationError = validateUpdateInput(input);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Check the recipe exists
      const existing = await recipeRepository.getById(db, id);
      if (!existing) {
        const validError: ValidationError = {
          type: 'validation',
          fields: [{ field: 'id', message: 'La receta no existe' }],
        };
        return { success: false, error: validError };
      }

      // Check name uniqueness if name is being changed
      if (input.name !== undefined && input.name.trim() !== existing.name) {
        const nameExists = await existsByName(input.name, id);
        if (nameExists) {
          const conflictError: ConflictError = {
            type: 'conflict',
            message: `Ya existe una receta con el nombre "${input.name.trim()}"`,
          };
          return { success: false, error: conflictError };
        }
      }

      // Sanitize the input
      const sanitizedInput: UpdateRecipeInput = {
        ...input,
        name: input.name !== undefined ? input.name.trim() : undefined,
      };

      const recipe = await recipeRepository.update(db, id, sanitizedInput);
      if (!recipe) {
        const validError: ValidationError = {
          type: 'validation',
          fields: [{ field: 'id', message: 'La receta no existe' }],
        };
        return { success: false, error: validError };
      }

      return { success: true, data: recipe };
    },

    /**
     * Deletes a recipe by ID.
     */
    async delete(id: string): Promise<ServiceResult<void>> {
      const deleted = await recipeRepository.deleteById(db, id);
      if (!deleted) {
        const validError: ValidationError = {
          type: 'validation',
          fields: [{ field: 'id', message: 'La receta no existe' }],
        };
        return { success: false, error: validError };
      }
      return { success: true, data: undefined };
    },

    /**
     * Gets a recipe by ID.
     */
    async getById(id: string): Promise<Recipe | null> {
      return recipeRepository.getById(db, id);
    },

    /**
     * Gets all recipes sorted alphabetically.
     */
    async getAll(): Promise<Recipe[]> {
      return recipeRepository.getAll(db);
    },

    /**
     * Gets recipes filtered by meal type.
     */
    async getByMealType(type: MealType): Promise<Recipe[]> {
      return recipeRepository.getByMealType(db, type);
    },

    /**
     * Gets the total count of recipes.
     */
    async getCount(): Promise<number> {
      return recipeRepository.getCount(db);
    },

    /**
     * Searches recipes by partial name match.
     */
    async search(query: string): Promise<Recipe[]> {
      return recipeRepository.search(db, query);
    },
  };
}

export type IRecipeService = ReturnType<typeof createRecipeService>;
