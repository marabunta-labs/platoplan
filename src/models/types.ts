/**
 * PlatoPlan - Entity type definitions
 */

import type {
  MealType,
  PrepTime,
  MealSlot,
  FreeDayType,
  MeasureUnit,
  PlanStatus,
} from './enums';

/** Purchase format for an ingredient in the supermarket */
export interface PurchaseFormat {
  description: string;
  quantity: number;
}

/** An ingredient associated with a recipe, including quantity */
export interface RecipeIngredient {
  ingredientId: string;
  ingredient?: Ingredient;
  quantity: number;
}

/** A recipe registered by the user */
export interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
  prepTime: PrepTime;
  description?: string;
  servings: number;
  ingredients: RecipeIngredient[];
  createdAt: Date;
  updatedAt: Date;
}

/** A food ingredient with its purchase format */
export interface Ingredient {
  id: string;
  name: string;
  unit: MeasureUnit;
  purchaseFormat: PurchaseFormat;
  category: string;
  /** All categories assigned to this ingredient. `category` remains the primary
   * category for backwards compatibility with older local and synced data. */
  categories?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** An entry in the user's pantry */
export interface PantryEntry {
  id: string;
  ingredientId: string;
  ingredient?: Ingredient;
  quantity: number;
  updatedAt: Date;
}

/** A menu plan for a given period */
export interface MenuPlan {
  id: string;
  /** Optional descriptive name chosen by the user. */
  name: string;
  periodDays: number;
  startDate: Date;
  /** Number of diners the plan is generated for. */
  servings: number;
  status: PlanStatus;
  elaborateDays: number[];
  /** Free-form notes keyed by the zero-based day index. */
  dayNotes: Record<string, string>;
  /** Free-form notes keyed as `${dayIndex}:${slot}`. */
  mealNotes: Record<string, string>;
  assignments: PlanAssignment[];
  freeDays: FreeDay[];
  createdAt: Date;
  updatedAt: Date;
}

/** A recipe assigned to a specific day and slot in a plan */
export interface PlanAssignment {
  id: string;
  planId: string;
  dayIndex: number;
  slot: MealSlot;
  recipeId: string;
  recipe?: Recipe;
}

/** A day marked as free (no cooking needed) */
export interface FreeDay {
  id: string;
  planId: string;
  dayIndex: number;
  type: FreeDayType;
}

/** The generated shopping list for a plan */
export interface ShoppingList {
  id: string;
  planId: string;
  items: ShoppingListItem[];
  generatedAt: Date;
  isStale: boolean;
}

/** An individual item in the shopping list */
export interface ShoppingListItem {
  id: string;
  listId: string;
  ingredientId: string;
  ingredient?: Ingredient;
  totalQuantityNeeded: number;
  pantryQuantityDeducted: number;
  netQuantity: number;
  purchaseUnits: number;
  isManuallyEdited: boolean;
  isRemoved: boolean;
}
