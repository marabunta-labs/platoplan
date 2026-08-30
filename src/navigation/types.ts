/**
 * PlatoPlan - Navigation type definitions for type-safe navigation
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

/** Bottom tab navigator param list */
export type MainTabParamList = {
  RecipesTab: NavigatorScreenParams<RecipeStackParamList>;
  PantryTab: NavigatorScreenParams<PantryStackParamList>;
  PlanningTab: NavigatorScreenParams<PlanningStackParamList>;
  ShoppingTab: NavigatorScreenParams<ShoppingStackParamList>;
};

/** Recipe stack param list */
export type RecipeStackParamList = {
  RecipeList: undefined;
  RecipeDetail: { recipeId: string };
  RecipeForm: { recipeId?: string }; // undefined = create, string = edit
};

/** Pantry stack param list */
export type PantryStackParamList = {
  PantryList: undefined;
  SuggestedRecipes: undefined;
};

/** Planning stack param list */
export type PlanningStackParamList = {
  PlanConfig: { planId?: string, isEditing?: boolean } | undefined;
  PlanHistory: undefined;
  RecipeSelection: { planId: string };
  PlanCalendar: { planId: string };
};

/** Shopping stack param list */
export type ShoppingStackParamList = {
  ShoppingHub: undefined; // NUEVA: Pantalla inicial con las opciones
  CustomListBuilder: undefined; // NUEVA: Para elegir recetas sueltas
  ShoppingList: { planId?: string; customListId?: string }; // MODIFICADA: Acepta planes o listas a medida
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends MainTabParamList {}
  }
}