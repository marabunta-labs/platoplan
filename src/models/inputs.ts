/**
 * PlatoPlan - Input type definitions for create/update operations
 */

import type { MealType, PrepTime, MeasureUnit, FreeDayType } from './enums';
import type { PurchaseFormat, Recipe } from './types';

/** Input for creating a new recipe */
export interface CreateRecipeInput {
  name: string;
  mealType: MealType;
  prepTime: PrepTime;
  description?: string;
  servings?: number;
  ingredients: { ingredientId: string; quantity: number }[];
}

/** Input for updating an existing recipe (all fields optional) */
export interface UpdateRecipeInput {
  name?: string;
  mealType?: MealType;
  prepTime?: PrepTime;
  description?: string;
  servings?: number;
  ingredients?: { ingredientId: string; quantity: number }[];
}

/** Input for creating a new ingredient */
export interface CreateIngredientInput {
  name: string;
  unit: MeasureUnit;
  purchaseFormat: PurchaseFormat;
  category: string;
  /** Optional additional categories. The primary category is always included. */
  categories?: string[];
}

/** Input for updating an existing ingredient (all fields optional) */
export interface UpdateIngredientInput {
  name?: string;
  unit?: MeasureUnit;
  purchaseFormat?: PurchaseFormat;
  category?: string;
  categories?: string[];
}

/** Configuration for generating a menu plan */
export interface PlanConfig {
  name?: string;
  periodDays: number;
  startDate: Date;
  servings?: number;
  elaborateDays?: number[];
  freeDays: { dayIndex: number; type: FreeDayType }[];
  selectedLunchRecipes?: { recipeId: string; count: number }[];
  selectedDinnerRecipes?: { recipeId: string; count: number }[];
}

/** A recipe selected for inclusion in a plan, with repeat count */
export interface SelectedRecipe {
  recipeId: string;
  recipe: Recipe;
  count: number;
}
