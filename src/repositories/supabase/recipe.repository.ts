/**
 * PlatoPlan - Supabase Recipe Repository
 *
 * Implements IRepository for the recipes and recipe_ingredients tables using Supabase client.
 * Manages recipe-ingredient relationships as part of create/update operations.
 * All queries are scoped by user_id for data isolation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe, RecipeIngredient } from '../../models/types';
import type { CreateRecipeInput, UpdateRecipeInput } from '../../models/inputs';
import type { MealType } from '../../models/enums';
import type { IRepository } from '../interfaces';

/** Row shape from the Supabase recipes table */
interface RecipeRow {
  id: string;
  user_id: string;
  name: string;
  meal_type: string;
  prep_time: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

/** Row shape from the Supabase recipe_ingredients table */
interface RecipeIngredientRow {
  recipe_id: string;
  ingredient_id: string;
  user_id: string;
  quantity: number;
}

/** Maps a Supabase row to the domain Recipe type (without ingredients) */
function mapRowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    mealType: row.meal_type as MealType,
    prepTime: row.prep_time as Recipe['prepTime'],
    ingredients: [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Maps a Supabase row to the domain RecipeIngredient type */
function mapRowToRecipeIngredient(row: RecipeIngredientRow): RecipeIngredient {
  return {
    ingredientId: row.ingredient_id,
    quantity: row.quantity,
  };
}

export class SupabaseRecipeRepository
  implements IRepository<Recipe, CreateRecipeInput, UpdateRecipeInput>
{
  constructor(
    private client: SupabaseClient,
    private userId: string
  ) {}

  async getAll(): Promise<Recipe[]> {
    const { data, error } = await this.client
      .from('recipes')
      .select('*')
      .eq('user_id', this.userId)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch recipes: ${error.message}`);
    }

    const recipes = (data as RecipeRow[]).map(mapRowToRecipe);

    if (recipes.length === 0) {
      return recipes;
    }

    // Fetch ingredients for all recipes in one query
    const recipeIds = recipes.map((r) => r.id);
    const ingredientsMap = await this.fetchIngredientsForRecipes(recipeIds);

    for (const recipe of recipes) {
      recipe.ingredients = ingredientsMap.get(recipe.id) || [];
    }

    return recipes;
  }

  async getById(id: string): Promise<Recipe | null> {
    const { data, error } = await this.client
      .from('recipes')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch recipe: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const recipe = mapRowToRecipe(data as RecipeRow);

    // Fetch ingredients
    const { data: ingredientRows, error: ingError } = await this.client
      .from('recipe_ingredients')
      .select('recipe_id, ingredient_id, quantity')
      .eq('recipe_id', id)
      .eq('user_id', this.userId);

    if (ingError) {
      throw new Error(`Failed to fetch recipe ingredients: ${ingError.message}`);
    }

    recipe.ingredients = (ingredientRows as RecipeIngredientRow[]).map(mapRowToRecipeIngredient);

    return recipe;
  }

  async create(input: CreateRecipeInput): Promise<Recipe> {
    const now = new Date().toISOString();

    // Insert recipe
    const { data: recipeData, error: recipeError } = await this.client
      .from('recipes')
      .insert({
        user_id: this.userId,
        name: input.name,
        meal_type: input.mealType,
        prep_time: input.prepTime,
        created_at: now,
        updated_at: now,
        synced_at: now,
      })
      .select()
      .single();

    if (recipeError) {
      throw new Error(`Failed to create recipe: ${recipeError.message}`);
    }

    const recipe = mapRowToRecipe(recipeData as RecipeRow);

    // Insert recipe ingredients
    if (input.ingredients.length > 0) {
      const ingredientRows = input.ingredients.map((ing) => ({
        recipe_id: recipe.id,
        ingredient_id: ing.ingredientId,
        user_id: this.userId,
        quantity: ing.quantity,
        created_at: now,
        updated_at: now,
        synced_at: now,
      }));

      const { error: ingError } = await this.client
        .from('recipe_ingredients')
        .insert(ingredientRows);

      if (ingError) {
        throw new Error(`Failed to create recipe ingredients: ${ingError.message}`);
      }
    }

    recipe.ingredients = input.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      quantity: ing.quantity,
    }));

    return recipe;
  }

  async update(id: string, input: UpdateRecipeInput): Promise<Recipe> {
    const updates: Record<string, unknown> = {};

    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (input.mealType !== undefined) {
      updates.meal_type = input.mealType;
    }
    if (input.prepTime !== undefined) {
      updates.prep_time = input.prepTime;
    }

    const now = new Date().toISOString();

    // Update the recipe row if there are field changes
    if (Object.keys(updates).length > 0) {
      updates.synced_at = now;

      const { error } = await this.client
        .from('recipes')
        .update(updates)
        .eq('id', id)
        .eq('user_id', this.userId);

      if (error) {
        throw new Error(`Failed to update recipe: ${error.message}`);
      }
    } else if (input.ingredients !== undefined) {
      // If only ingredients changed, still touch updated_at via synced_at
      const { error } = await this.client
        .from('recipes')
        .update({ synced_at: now })
        .eq('id', id)
        .eq('user_id', this.userId);

      if (error) {
        throw new Error(`Failed to update recipe timestamp: ${error.message}`);
      }
    }

    // Replace ingredients if provided
    if (input.ingredients !== undefined) {
      // Delete existing
      const { error: deleteError } = await this.client
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', id)
        .eq('user_id', this.userId);

      if (deleteError) {
        throw new Error(`Failed to delete recipe ingredients: ${deleteError.message}`);
      }

      // Insert new
      if (input.ingredients.length > 0) {
        const ingredientRows = input.ingredients.map((ing) => ({
          recipe_id: id,
          ingredient_id: ing.ingredientId,
          user_id: this.userId,
          quantity: ing.quantity,
          created_at: now,
          updated_at: now,
          synced_at: now,
        }));

        const { error: insertError } = await this.client
          .from('recipe_ingredients')
          .insert(ingredientRows);

        if (insertError) {
          throw new Error(`Failed to insert recipe ingredients: ${insertError.message}`);
        }
      }
    }

    // Fetch and return the updated recipe
    const result = await this.getById(id);
    if (!result) {
      throw new Error(`Recipe with id '${id}' not found after update`);
    }
    return result;
  }

  async delete(id: string): Promise<boolean> {
    // recipe_ingredients are cascade-deleted via foreign key
    const { error, count } = await this.client
      .from('recipes')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to delete recipe: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  async search(query: string): Promise<Recipe[]> {
    const { data, error } = await this.client
      .from('recipes')
      .select('*')
      .eq('user_id', this.userId)
      .ilike('name', `%${query}%`)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to search recipes: ${error.message}`);
    }

    const recipes = (data as RecipeRow[]).map(mapRowToRecipe);

    if (recipes.length === 0) {
      return recipes;
    }

    const recipeIds = recipes.map((r) => r.id);
    const ingredientsMap = await this.fetchIngredientsForRecipes(recipeIds);

    for (const recipe of recipes) {
      recipe.ingredients = ingredientsMap.get(recipe.id) || [];
    }

    return recipes;
  }

  /**
   * Fetches recipe ingredients for multiple recipes in a single query.
   */
  private async fetchIngredientsForRecipes(
    recipeIds: string[]
  ): Promise<Map<string, RecipeIngredient[]>> {
    const map = new Map<string, RecipeIngredient[]>();

    if (recipeIds.length === 0) {
      return map;
    }

    const { data, error } = await this.client
      .from('recipe_ingredients')
      .select('recipe_id, ingredient_id, quantity')
      .in('recipe_id', recipeIds)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to fetch recipe ingredients: ${error.message}`);
    }

    for (const row of data as RecipeIngredientRow[]) {
      const recipeId = row.recipe_id;
      const ingredient = mapRowToRecipeIngredient(row);
      const list = map.get(recipeId) || [];
      list.push(ingredient);
      map.set(recipeId, list);
    }

    return map;
  }
}
