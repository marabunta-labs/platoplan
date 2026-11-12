/**
 * PlatoPlan - recipe emoji
 *
 * Recipes have no category of their own, so we derive one from their
 * ingredients: the supermarket category holding the largest share of the
 * recipe's quantity decides the emoji (🥩 for a meat dish, 🍝 for pasta, ...).
 */

import type { Ingredient, Recipe } from '../models/types';
import { DEFAULT_INGREDIENT_CATEGORIES, categoryKey } from '../constants/ingredient-categories';

export const DEFAULT_RECIPE_EMOJI = '🍽️';

const EMOJI_BY_KEY = new Map(
  DEFAULT_INGREDIENT_CATEGORIES.filter((c) => c.name !== 'Otros').map((c) => [categoryKey(c.name), c.emoji])
);

export function getRecipeEmoji(
  recipe: Pick<Recipe, 'ingredients'> | null | undefined,
  ingredientsById?: Map<string, Ingredient>
): string {
  if (!recipe?.ingredients?.length) return DEFAULT_RECIPE_EMOJI;

  const weight = new Map<string, number>();
  for (const ri of recipe.ingredients) {
    const ingredient = ri.ingredient ?? ingredientsById?.get(ri.ingredientId);
    const category = ingredient?.categories?.[0] ?? ingredient?.category;
    if (!category) continue;
    const emoji = EMOJI_BY_KEY.get(categoryKey(category));
    if (!emoji) continue;
    weight.set(emoji, (weight.get(emoji) ?? 0) + (ri.quantity > 0 ? ri.quantity : 1));
  }

  let best = DEFAULT_RECIPE_EMOJI;
  let bestWeight = 0;
  for (const [emoji, w] of weight) {
    if (w > bestWeight) {
      best = emoji;
      bestWeight = w;
    }
  }
  return best;
}
