/**
 * PlatoPlan - "Unassigned" drawer grouping
 *
 * Splits the recipes waiting in the drawer into lunches, dinners and dishes
 * that fit either slot. Each entry keeps its index in the flat drawer list,
 * because the drag logic identifies a card by that index (the same recipe can
 * sit in the drawer more than once).
 */

import type { Recipe } from '../models/types';

export type UnassignedGroupKey = 'comida' | 'cena' | 'ambas';

export interface UnassignedEntry {
  recipe: Recipe;
  /** Position in the flat (ungrouped) unassigned list. */
  index: number;
}

export interface UnassignedGroup {
  key: UnassignedGroupKey;
  items: UnassignedEntry[];
}

const ORDER: UnassignedGroupKey[] = ['comida', 'cena', 'ambas'];

/** Returns only the non-empty groups, in a stable lunches → dinners → either order. */
export function groupUnassigned(recipes: Recipe[]): UnassignedGroup[] {
  const buckets: Record<UnassignedGroupKey, UnassignedEntry[]> = { comida: [], cena: [], ambas: [] };
  recipes.forEach((recipe, index) => {
    const key: UnassignedGroupKey =
      recipe.mealType === 'comida' || recipe.mealType === 'cena' ? recipe.mealType : 'ambas';
    buckets[key].push({ recipe, index });
  });
  return ORDER.filter((key) => buckets[key].length > 0).map((key) => ({ key, items: buckets[key] }));
}
