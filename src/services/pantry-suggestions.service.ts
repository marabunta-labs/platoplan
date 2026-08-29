/**
 * PlatoPlan - Pantry Suggestions Service
 * Calculates which recipes can be prepared with current pantry inventory.
 */

import type { Recipe, PantryEntry } from '../models/types';

export interface MissingIngredientInfo {
  name: string;
  needed: number;
  available: number;
  unit: string;
}

export interface SuggestedRecipe {
  recipe: Recipe;
  coverage: number; // 0.0 to 1.0
  missingIngredients: MissingIngredientInfo[];
}

/**
 * Returns recipes sorted by pantry coverage (descending).
 * Only includes recipes with coverage >= threshold (default 0.7).
 */
export function getSuggestedRecipes(
  recipes: Recipe[],
  pantryEntries: PantryEntry[],
  minCoverage = 0.7
): SuggestedRecipe[] {
  // Build a lookup map: ingredientId -> available quantity
  const pantryMap = new Map<string, number>();
  for (const entry of pantryEntries) {
    pantryMap.set(entry.ingredientId, entry.quantity);
  }

  const suggestions: SuggestedRecipe[] = [];

  for (const recipe of recipes) {
    if (recipe.ingredients.length === 0) continue;

    let coveredCount = 0;
    const missing: MissingIngredientInfo[] = [];

    for (const ri of recipe.ingredients) {
      const available = pantryMap.get(ri.ingredientId) ?? 0;
      if (available >= ri.quantity) {
        coveredCount++;
      } else {
        missing.push({
          name: ri.ingredient?.name ?? ri.ingredientId,
          needed: ri.quantity,
          available,
          unit: ri.ingredient?.unit ?? 'unidades',
        });
      }
    }

    const coverage = coveredCount / recipe.ingredients.length;

    if (coverage >= minCoverage) {
      suggestions.push({ recipe, coverage, missingIngredients: missing });
    }
  }

  // Sort by coverage descending, then by name ascending
  suggestions.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return a.recipe.name.localeCompare(b.recipe.name, 'es');
  });

  return suggestions;
}
