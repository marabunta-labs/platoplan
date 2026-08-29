/**
 * Recipe Repository - Data access layer for recipes and recipe_ingredients tables.
 * Implements IRepository for consistent interface with other repositories.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { withTransaction, generateId } from '../database/database';
import type { Recipe, RecipeIngredient } from '../models/types';
import type { MealType, MeasureUnit } from '../models/enums';
import type { CreateRecipeInput, UpdateRecipeInput } from '../models/inputs';
import type { IRepository } from './interfaces';

/**
 * Converts a raw database row to a Recipe domain object (without ingredients).
 */
function rowToRecipe(row: Record<string, unknown>): Recipe {
  return {
    id: row.id as string,
    name: row.name as string,
    mealType: row.meal_type as MealType,
    prepTime: row.prep_time as Recipe['prepTime'],
    description: (row.description as string) || undefined,
    servings: (row.servings as number) ?? 2,
    ingredients: [],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Converts a raw database row (with joined ingredient data) to a RecipeIngredient domain object.
 */
function rowToRecipeIngredient(row: Record<string, unknown>): RecipeIngredient {
  return {
    ingredientId: row.ingredient_id as string,
    quantity: row.quantity as number,
    ingredient: row.name
      ? {
          id: row.ingredient_id as string,
          name: row.name as string,
          unit: row.unit as MeasureUnit,
          purchaseFormat: {
            description: (row.purchase_format_desc as string) ?? '',
            quantity: (row.purchase_format_quantity as number) ?? 0,
          },
          category: (row.category as string) ?? '',
          createdAt: new Date(row.created_at as string),
          updatedAt: new Date(row.updated_at as string),
        }
      : undefined,
  };
}

/**
 * Fetches recipe ingredients for the given recipe IDs.
 */
async function fetchIngredientsForRecipes(
  db: SQLiteDatabase,
  recipeIds: string[]
): Promise<Map<string, RecipeIngredient[]>> {
  const map = new Map<string, RecipeIngredient[]>();

  if (recipeIds.length === 0) {
    return map;
  }

  const placeholders = recipeIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ri.recipe_id, ri.ingredient_id, ri.quantity,
            i.name, i.unit, i.purchase_format_desc, i.purchase_format_quantity, i.category,
            i.created_at, i.updated_at
     FROM recipe_ingredients ri
     JOIN ingredients i ON ri.ingredient_id = i.id
     WHERE ri.recipe_id IN (${placeholders})`,
    recipeIds
  );

  for (const row of rows) {
    const recipeId = row.recipe_id as string;
    const ingredient = rowToRecipeIngredient(row);
    const list = map.get(recipeId) || [];
    list.push(ingredient);
    map.set(recipeId, list);
  }

  return map;
}

/**
 * RecipeRepository class implementing IRepository interface.
 * Also exposes legacy module-level function signatures for backward compatibility.
 */
export class RecipeRepository
  implements IRepository<Recipe, CreateRecipeInput, UpdateRecipeInput>
{
  constructor(private db: SQLiteDatabase) {}

  /**
   * Creates a new recipe with its ingredients.
   * Uses a transaction to ensure both the recipe and its ingredients are inserted atomically.
   */
  async create(input: CreateRecipeInput): Promise<Recipe> {
    const id = generateId();
    const now = new Date().toISOString();
    const description = input.description ?? '';
    const servings = input.servings ?? 2;

    return withTransaction(this.db, async (txDb) => {
      await txDb.runAsync(
        `INSERT INTO recipes (id, name, meal_type, prep_time, description, servings, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.name, input.mealType, input.prepTime, description, servings, now, now]
      );

      for (const ing of input.ingredients) {
        await txDb.runAsync(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, updated_at)
           VALUES (?, ?, ?, ?)`,
          [id, ing.ingredientId, ing.quantity, now]
        );
      }

      return {
        id,
        name: input.name,
        mealType: input.mealType,
        prepTime: input.prepTime,
        description: description || undefined,
        servings,
        ingredients: input.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
        })),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    });
  }

  /**
   * Updates an existing recipe. If ingredients are provided, replaces all existing
   * recipe_ingredients (delete old, insert new) within a transaction.
   */
  async update(id: string, input: UpdateRecipeInput): Promise<Recipe> {
    return withTransaction(this.db, async (txDb) => {
      // Build the SET clause dynamically based on provided fields
      const setClauses: string[] = [];
      const params: unknown[] = [];

      if (input.name !== undefined) {
        setClauses.push('name = ?');
        params.push(input.name);
      }
      if (input.mealType !== undefined) {
        setClauses.push('meal_type = ?');
        params.push(input.mealType);
      }
      if (input.prepTime !== undefined) {
        setClauses.push('prep_time = ?');
        params.push(input.prepTime);
      }
      if (input.description !== undefined) {
        setClauses.push('description = ?');
        params.push(input.description);
      }
      if (input.servings !== undefined) {
        setClauses.push('servings = ?');
        params.push(input.servings);
      }

      const now = new Date().toISOString();

      if (setClauses.length > 0) {
        setClauses.push('updated_at = ?');
        params.push(now);
        params.push(id);

        await txDb.runAsync(
          `UPDATE recipes SET ${setClauses.join(', ')} WHERE id = ?`,
          params
        );
      } else if (input.ingredients !== undefined) {
        // Only ingredients changed — still update the timestamp
        await txDb.runAsync(
          `UPDATE recipes SET updated_at = ? WHERE id = ?`,
          [now, id]
        );
      }

      // Replace ingredients if provided
      if (input.ingredients !== undefined) {
        await txDb.runAsync(
          `DELETE FROM recipe_ingredients WHERE recipe_id = ?`,
          [id]
        );

        for (const ing of input.ingredients) {
          await txDb.runAsync(
            `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, updated_at)
             VALUES (?, ?, ?, ?)`,
            [id, ing.ingredientId, ing.quantity, now]
          );
        }
      }

      // Fetch and return the updated recipe
      const row = await txDb.getFirstAsync<Record<string, unknown>>(
        `SELECT * FROM recipes WHERE id = ?`,
        [id]
      );

      if (!row) {
        throw new Error(`Recipe with id '${id}' not found`);
      }

      const recipe = rowToRecipe(row);

      const ingredientRows = await txDb.getAllAsync<Record<string, unknown>>(
        `SELECT ri.ingredient_id, ri.quantity,
                i.name, i.unit, i.purchase_format_desc, i.purchase_format_quantity, i.category,
                i.created_at, i.updated_at
         FROM recipe_ingredients ri
         JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE ri.recipe_id = ?`,
        [id]
      );
      recipe.ingredients = ingredientRows.map(rowToRecipeIngredient);

      return recipe;
    });
  }

  /**
   * Deletes a recipe by ID. CASCADE handles recipe_ingredients cleanup automatically.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.runAsync(
      `DELETE FROM recipes WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  }

  /**
   * Gets a recipe by ID, including its ingredients.
   */
  async getById(id: string): Promise<Recipe | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM recipes WHERE id = ?`,
      [id]
    );

    if (!row) {
      return null;
    }

    const recipe = rowToRecipe(row);

    const ingredientRows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT ri.ingredient_id, ri.quantity,
              i.name, i.unit, i.purchase_format_desc, i.purchase_format_quantity, i.category,
              i.created_at, i.updated_at
       FROM recipe_ingredients ri
       JOIN ingredients i ON ri.ingredient_id = i.id
       WHERE ri.recipe_id = ?`,
      [id]
    );
    recipe.ingredients = ingredientRows.map(rowToRecipeIngredient);

    return recipe;
  }

  /**
   * Gets all recipes sorted alphabetically by name, including their ingredients.
   */
  async getAll(): Promise<Recipe[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM recipes ORDER BY name ASC`
    );

    const recipes = rows.map(rowToRecipe);

    if (recipes.length === 0) {
      return recipes;
    }

    const recipeIds = recipes.map((r) => r.id);
    const ingredientsMap = await fetchIngredientsForRecipes(this.db, recipeIds);

    for (const recipe of recipes) {
      recipe.ingredients = ingredientsMap.get(recipe.id) || [];
    }

    return recipes;
  }

  /**
   * Gets all recipes filtered by meal type, sorted alphabetically by name.
   */
  async getByMealType(mealType: MealType): Promise<Recipe[]> {
    // 'ambas' recipes are eligible for both comida and cena
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM recipes WHERE meal_type = ? OR meal_type = 'ambas' ORDER BY name ASC`,
      [mealType]
    );

    const recipes = rows.map(rowToRecipe);

    if (recipes.length === 0) {
      return recipes;
    }

    const recipeIds = recipes.map((r) => r.id);
    const ingredientsMap = await fetchIngredientsForRecipes(this.db, recipeIds);

    for (const recipe of recipes) {
      recipe.ingredients = ingredientsMap.get(recipe.id) || [];
    }

    return recipes;
  }

  /**
   * Returns the total count of recipes.
   */
  async getCount(): Promise<number> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      `SELECT COUNT(*) as count FROM recipes`
    );
    return (row?.count as number) ?? 0;
  }

  /**
   * Searches recipes by partial name match (case-insensitive LIKE %query%).
   * Results are sorted alphabetically by name.
   */
  async search(query: string): Promise<Recipe[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM recipes WHERE name LIKE ? ORDER BY name ASC`,
      [`%${query}%`]
    );

    const recipes = rows.map(rowToRecipe);

    if (recipes.length === 0) {
      return recipes;
    }

    const recipeIds = recipes.map((r) => r.id);
    const ingredientsMap = await fetchIngredientsForRecipes(this.db, recipeIds);

    for (const recipe of recipes) {
      recipe.ingredients = ingredientsMap.get(recipe.id) || [];
    }

    return recipes;
  }
}

// ============================================================================
// Legacy module-level functions for backward compatibility with existing callers.
// These delegate to a one-off instance pattern using the provided db argument.
// ============================================================================

/**
 * Creates a new recipe with its ingredients.
 * @deprecated Use RecipeRepository class instance instead
 */
export async function create(
  db: SQLiteDatabase,
  input: CreateRecipeInput
): Promise<Recipe> {
  const repo = new RecipeRepository(db);
  return repo.create(input);
}

/**
 * Updates an existing recipe.
 * @deprecated Use RecipeRepository class instance instead
 */
export async function update(
  db: SQLiteDatabase,
  id: string,
  input: UpdateRecipeInput
): Promise<Recipe | null> {
  try {
    const repo = new RecipeRepository(db);
    return await repo.update(id, input);
  } catch {
    return null;
  }
}

/**
 * Deletes a recipe by ID.
 * @deprecated Use RecipeRepository class instance instead
 */
export async function deleteById(
  db: SQLiteDatabase,
  id: string
): Promise<boolean> {
  const repo = new RecipeRepository(db);
  return repo.delete(id);
}

/**
 * Gets a recipe by ID, including its ingredients.
 * @deprecated Use RecipeRepository class instance instead
 */
export async function getById(
  db: SQLiteDatabase,
  id: string
): Promise<Recipe | null> {
  const repo = new RecipeRepository(db);
  return repo.getById(id);
}

/**
 * Gets all recipes sorted alphabetically by name, including their ingredients.
 * @deprecated Use RecipeRepository class instance instead
 */
export async function getAll(db: SQLiteDatabase): Promise<Recipe[]> {
  const repo = new RecipeRepository(db);
  return repo.getAll();
}

/**
 * Gets all recipes filtered by meal type, sorted alphabetically by name.
 * @deprecated Use RecipeRepository class instance instead
 */
export async function getByMealType(
  db: SQLiteDatabase,
  mealType: MealType
): Promise<Recipe[]> {
  const repo = new RecipeRepository(db);
  return repo.getByMealType(mealType);
}

/**
 * Returns the total count of recipes.
 * @deprecated Use RecipeRepository class instance instead
 */
export async function getCount(db: SQLiteDatabase): Promise<number> {
  const repo = new RecipeRepository(db);
  return repo.getCount();
}

/**
 * Searches recipes by partial name match (case-insensitive LIKE %query%).
 * @deprecated Use RecipeRepository class instance instead
 */
export async function search(
  db: SQLiteDatabase,
  query: string
): Promise<Recipe[]> {
  const repo = new RecipeRepository(db);
  return repo.search(query);
}
