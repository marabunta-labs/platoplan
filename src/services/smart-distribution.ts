/**
 * Smart Distribution - Slot-by-slot meal planner with variety scoring.
 *
 * Unlike `distribution.engine`, which only spaces identical recipes apart, this
 * planner scores every candidate against its neighbouring meals so the result
 * avoids repeating ingredients, food categories and heavy cooking days in a row.
 * It is a pure function and tolerates an under-filled pool by leaving gaps.
 */

import type { MealSlot } from '../models/enums';
import type { FreeDay, Ingredient, Recipe } from '../models/types';
import type { SelectedRecipe } from '../models/inputs';

export interface SmartPlanInput {
  periodDays: number;
  freeDays: FreeDay[];
  /** Day indices where elaborate recipes are preferred. */
  elaborateDays: number[];
  lunchSelections: SelectedRecipe[];
  dinnerSelections: SelectedRecipe[];
  /** Ingredient catalogue, used to compare ingredient overlap and categories. */
  ingredientsById: Map<string, Ingredient>;
}

export interface SmartAssignment {
  dayIndex: number;
  slot: MealSlot;
  recipeId: string;
}

export interface SmartPlanResult {
  assignments: SmartAssignment[];
  /** Slots left empty because the selection did not cover the whole period. */
  gaps: { dayIndex: number; slot: MealSlot }[];
  warnings: string[];
}

/** Penalty weights, ordered by how strongly we want to avoid each situation. */
const PENALTY = {
  sameRecipeAdjacent: 1000,
  sameRecipeWithinTwoDays: 400,
  ingredientOverlap: 320,
  sameCategoryAdjacent: 200,
  elaborateOnNonElaborateDay: 150,
  elaborateTwiceSameDay: 120,
  repeatUsage: 12,
} as const;

interface RecipeProfile {
  recipe: Recipe;
  ingredientIds: Set<string>;
  /** Ingredient category carrying the most quantity, used as a "type of dish". */
  dominantCategory: string | null;
  isElaborate: boolean;
}

function buildProfile(recipe: Recipe, ingredientsById: Map<string, Ingredient>): RecipeProfile {
  const ingredientIds = new Set<string>();
  const categoryWeight = new Map<string, number>();

  for (const ri of recipe.ingredients) {
    ingredientIds.add(ri.ingredientId);
    const category =
      ri.ingredient?.categories?.[0] ?? ri.ingredient?.category ??
      ingredientsById.get(ri.ingredientId)?.categories?.[0] ?? ingredientsById.get(ri.ingredientId)?.category ?? '';
    if (!category) continue;
    categoryWeight.set(category, (categoryWeight.get(category) ?? 0) + ri.quantity);
  }

  let dominantCategory: string | null = null;
  let best = 0;
  for (const [category, weight] of categoryWeight) {
    if (weight > best) {
      best = weight;
      dominantCategory = category;
    }
  }

  return {
    recipe,
    ingredientIds,
    dominantCategory,
    isElaborate: recipe.prepTime === 'elaborado',
  };
}

/** Jaccard similarity between two ingredient sets, in [0, 1]. */
function ingredientSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const id of a) {
    if (b.has(id)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isSlotFree(dayIndex: number, slot: MealSlot, freeDays: FreeDay[]): boolean {
  const freeDay = freeDays.find((fd) => fd.dayIndex === dayIndex);
  if (!freeDay) return false;
  return freeDay.type === 'ambas' || freeDay.type === slot;
}

/** All cookable slots in chronological order (lunch before dinner each day). */
function buildSlots(
  periodDays: number,
  freeDays: FreeDay[]
): { dayIndex: number; slot: MealSlot }[] {
  const slots: { dayIndex: number; slot: MealSlot }[] = [];
  for (let dayIndex = 0; dayIndex < periodDays; dayIndex++) {
    for (const slot of ['comida', 'cena'] as MealSlot[]) {
      if (!isSlotFree(dayIndex, slot, freeDays)) {
        slots.push({ dayIndex, slot });
      }
    }
  }
  return slots;
}

/** Distance in "meal positions": consecutive meals are 1 apart, same slot next day is 2. */
function mealDistance(
  a: { dayIndex: number; slot: MealSlot },
  b: { dayIndex: number; slot: MealSlot }
): number {
  const toIndex = (s: { dayIndex: number; slot: MealSlot }) =>
    s.dayIndex * 2 + (s.slot === 'comida' ? 0 : 1);
  return Math.abs(toIndex(a) - toIndex(b));
}

export function planMeals(input: SmartPlanInput): SmartPlanResult {
  const { periodDays, freeDays, elaborateDays, ingredientsById } = input;

  const profiles = new Map<string, RecipeProfile>();
  const registerProfiles = (selections: SelectedRecipe[]) => {
    for (const selection of selections) {
      if (!profiles.has(selection.recipeId)) {
        profiles.set(selection.recipeId, buildProfile(selection.recipe, ingredientsById));
      }
    }
  };
  registerProfiles(input.lunchSelections);
  registerProfiles(input.dinnerSelections);

  // Remaining occurrences of each recipe, tracked per slot type.
  const remaining: Record<MealSlot, Map<string, number>> = {
    comida: new Map(input.lunchSelections.map((s) => [s.recipeId, s.count])),
    cena: new Map(input.dinnerSelections.map((s) => [s.recipeId, s.count])),
  };

  const slots = buildSlots(periodDays, freeDays);
  const assignments: SmartAssignment[] = [];
  const gaps: { dayIndex: number; slot: MealSlot }[] = [];
  const warnings: string[] = [];
  const usageCount = new Map<string, number>();

  // Placing elaborate-heavy slots first would bias spacing, so we walk the period
  // in order and pick the least-penalised remaining recipe for each slot.
  for (const slot of slots) {
    const pool = remaining[slot.slot];
    const candidates = [...pool.entries()].filter(([, count]) => count > 0);

    if (candidates.length === 0) {
      gaps.push(slot);
      continue;
    }

    let bestRecipeId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const [recipeId] of candidates) {
      const profile = profiles.get(recipeId);
      if (!profile) continue;

      let score = (usageCount.get(recipeId) ?? 0) * PENALTY.repeatUsage;

      if (profile.isElaborate) {
        if (elaborateDays.length > 0 && !elaborateDays.includes(slot.dayIndex)) {
          score += PENALTY.elaborateOnNonElaborateDay;
        }
        const sameDayElaborate = assignments.some(
          (a) =>
            a.dayIndex === slot.dayIndex && profiles.get(a.recipeId)?.isElaborate === true
        );
        if (sameDayElaborate) {
          score += PENALTY.elaborateTwiceSameDay;
        }
      }

      // Compare against the meals close enough in time for the user to notice.
      for (const assigned of assignments) {
        const distance = mealDistance(assigned, slot);
        if (distance > 4) continue;

        if (assigned.recipeId === recipeId) {
          score +=
            distance <= 1 ? PENALTY.sameRecipeAdjacent : PENALTY.sameRecipeWithinTwoDays;
        }

        const other = profiles.get(assigned.recipeId);
        if (!other) continue;

        // Proximity fades linearly: the previous meal matters most.
        const proximity = (5 - distance) / 4;

        const similarity = ingredientSimilarity(profile.ingredientIds, other.ingredientIds);
        score += similarity * PENALTY.ingredientOverlap * proximity;

        if (
          profile.dominantCategory &&
          profile.dominantCategory === other.dominantCategory &&
          distance <= 2
        ) {
          score += PENALTY.sameCategoryAdjacent * proximity;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestRecipeId = recipeId;
      }
    }

    if (!bestRecipeId) {
      gaps.push(slot);
      continue;
    }

    assignments.push({ dayIndex: slot.dayIndex, slot: slot.slot, recipeId: bestRecipeId });
    pool.set(bestRecipeId, (pool.get(bestRecipeId) ?? 1) - 1);
    usageCount.set(bestRecipeId, (usageCount.get(bestRecipeId) ?? 0) + 1);

    if (bestScore >= PENALTY.sameRecipeAdjacent) {
      const name = profiles.get(bestRecipeId)?.recipe.name ?? bestRecipeId;
      warnings.push(
        `Día ${slot.dayIndex + 1} (${slot.slot}): "${name}" se repite muy seguido; no había alternativa disponible.`
      );
    }
  }

  const leftover = [...remaining.comida.values(), ...remaining.cena.values()].reduce(
    (sum, count) => sum + Math.max(0, count),
    0
  );
  if (leftover > 0) {
    warnings.push(
      `${leftover} selección(es) no cupieron en el período y se han descartado.`
    );
  }

  return { assignments, gaps, warnings };
}
