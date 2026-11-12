/**
 * Smart Distribution - Electrostatic Meal Planner
 * 
 * Uses a physics-based "repelling force" algorithm. 
 * Instead of filling slots chronologically, it places recipes one by one 
 * (starting with the most constrained: elaborate and most frequent). 
 * Identical recipes repel each other with an inverse-square force (1/d^2), 
 * causing them to naturally spread out uniformly across the available calendar.
 */

import type { MealSlot } from '../models/enums';
import type { FreeDay, Ingredient, Recipe } from '../models/types';
import type { SelectedRecipe } from '../models/inputs';
import { categoryKey } from '../constants/ingredient-categories';

export interface SmartPlanInput {
  periodDays: number;
  freeDays: FreeDay[];
  /** Day indices where elaborate recipes are preferred. */
  elaborateDays: number[];
  lunchSelections: SelectedRecipe[];
  dinnerSelections: SelectedRecipe[];
  /** Ingredient catalogue, used to compare ingredient overlap and categories. */
  ingredientsById: Map<string, Ingredient>;
  /**
   * Optional randomness source (0..1). When given, a small random term breaks
   * ties between similarly good slots so each call can yield a different,
   * still valid, arrangement (used by "Recalcular"). Omitted = deterministic.
   */
  random?: () => number;
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

interface RecipeProfile {
  recipe: Recipe;
  ingredientIds: Set<string>;
  /** Normalised keys of the categories that make up a meaningful share of the recipe. */
  majorCategories: Set<string>;
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
  let total = 0;
  for (const [category, weight] of categoryWeight) {
    total += weight;
    if (weight > best) {
      best = weight;
      dominantCategory = category;
    }
  }
  // Categories are compared by their order-insensitive key, so "Lácteos y huevos"
  // and "Huevos y lácteos" count as the same one.
  const majorCategories = new Set<string>();
  for (const [category, weight] of categoryWeight) {
    if (total > 0 && weight / total >= 0.25) majorCategories.add(categoryKey(category));
  }

  return {
    recipe,
    ingredientIds,
    majorCategories,
    dominantCategory: dominantCategory ? categoryKey(dominantCategory) : null,
    isElaborate: recipe.prepTime === 'elaborado',
  };
}

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

function buildSlots(periodDays: number, freeDays: FreeDay[]): { dayIndex: number; slot: MealSlot }[] {
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

/** Meals further apart than this no longer interact (3 days). */
const INTERACTION_RANGE = 6;

function sharedCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const id of a) if (b.has(id)) n++;
  return n;
}

/**
 * Penalty for having two *different* recipes `dist` meals apart (lower is better).
 * Recipes that share ingredients (e.g. potatoes) or the same main category
 * (pasta, meat, ...) repel each other, strongest at lunch+dinner of the same
 * day and on consecutive days, fading out after three days.
 */
function similarityPenalty(a: RecipeProfile, b: RecipeProfile, dist: number, sameDay: boolean): number {
  let score = 0;

  // Two elaborate dishes on the same day are too much work.
  if (a.isElaborate && b.isElaborate && sameDay) score += 20000;

  if (dist > INTERACTION_RANGE) return score;
  const proximity = (INTERACTION_RANGE + 1 - dist) / INTERACTION_RANGE; // 1 → ~0.17

  // Shared concrete ingredients: the more they share and the closer, the worse.
  const shared = sharedCount(a.ingredientIds, b.ingredientIds);
  if (shared > 0) {
    score += ingredientSimilarity(a.ingredientIds, b.ingredientIds) * 6000 * proximity;
    score += shared * 2500 * proximity;
    if (sameDay) score += 8000; // e.g. potatoes at lunch and at dinner
  }

  // Same dominant category (pasta after pasta, meat after meat...).
  if (a.dominantCategory && a.dominantCategory === b.dominantCategory) {
    score += (dist <= 2 ? 14000 : dist <= 4 ? 7000 : 2500) * proximity;
  } else if (a.majorCategories.size > 0 && b.majorCategories.size > 0) {
    // Different dominant category but still overlapping main categories.
    const overlap = sharedCount(a.majorCategories, b.majorCategories);
    if (overlap > 0) score += overlap * 2500 * proximity;
  }

  return score;
}

function buildProfiles(input: SmartPlanInput): Map<string, RecipeProfile> {
  const profiles = new Map<string, RecipeProfile>();
  for (const selection of [...input.lunchSelections, ...input.dinnerSelections]) {
    if (!profiles.has(selection.recipeId)) {
      profiles.set(selection.recipeId, buildProfile(selection.recipe, input.ingredientsById));
    }
  }
  return profiles;
}

/**
 * Total "badness" of an arrangement: sum of the pairwise penalties between
 * every two meals within range. Lets callers compare alternative plans.
 */
export function scoreArrangement(input: SmartPlanInput, assignments: SmartAssignment[]): number {
  const profiles = buildProfiles(input);
  let total = 0;
  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      const a = assignments[i];
      const b = assignments[j];
      const dist = mealDistance(a, b);
      if (dist === 0) continue;
      if (a.recipeId === b.recipeId) {
        total += 100000 / (dist * dist);
        continue;
      }
      const pa = profiles.get(a.recipeId);
      const pb = profiles.get(b.recipeId);
      if (pa && pb) total += similarityPenalty(pa, pb, dist, a.dayIndex === b.dayIndex);
    }
  }
  return total;
}

export function planMeals(input: SmartPlanInput): SmartPlanResult {
  const { periodDays, freeDays, elaborateDays, ingredientsById } = input;
  const warningsSet = new Set<string>();

  const profiles = buildProfiles(input);

  const slots = buildSlots(periodDays, freeDays);
  const emptySlots = [...slots]; // Huecos disponibles
  const assignments: SmartAssignment[] = [];

  // 1. Agrupar las tareas (qué receta hay que colocar y cuántas veces)
  interface PlacementTask {
    recipeId: string;
    targetSlotType: MealSlot;
    count: number;
    isElaborate: boolean;
  }

  const tasks: PlacementTask[] = [];
  for (const sel of input.lunchSelections) {
    if (sel.count > 0) tasks.push({ recipeId: sel.recipeId, targetSlotType: 'comida', count: sel.count, isElaborate: profiles.get(sel.recipeId)?.isElaborate || false });
  }
  for (const sel of input.dinnerSelections) {
    if (sel.count > 0) tasks.push({ recipeId: sel.recipeId, targetSlotType: 'cena', count: sel.count, isElaborate: profiles.get(sel.recipeId)?.isElaborate || false });
  }

  // 2. ORDENAR TAREAS (Clave del nuevo algoritmo)
  // Primero recetas elaboradas, y luego las que más se repiten (porque necesitan más espacio para separarse)
  tasks.sort((a, b) => {
    if (a.isElaborate && !b.isElaborate) return -1;
    if (!a.isElaborate && b.isElaborate) return 1;
    return b.count - a.count;
  });

  // 3. Colocar cada receta de forma inteligente
  for (const task of tasks) {
    const profile = profiles.get(task.recipeId);
    if (!profile) continue;

    for (let i = 0; i < task.count; i++) {
      const validEmptySlots = emptySlots.filter(s => s.slot === task.targetSlotType);

      if (validEmptySlots.length === 0) {
        warningsSet.add(`No hay más huecos de ${task.targetSlotType} libres para asignar "${profile.recipe.name}".`);
        continue;
      }

      let bestSlotIndex = -1;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let j = 0; j < validEmptySlots.length; j++) {
        const candidateSlot = validEmptySlots[j];
        let score = 0;

        // --- PENALIZACIONES ESTRICTAS ---
        
        // 1. Días de elaboración
        if (task.isElaborate && elaborateDays.length > 0) {
          if (!elaborateDays.includes(candidateSlot.dayIndex)) {
            // Penalización altísima para forzar que use los días marcados si están disponibles
            score += 50000; 
          }
        }

        // --- EVALUAR CONTRA LAS COMIDAS YA COLOCADAS ---
        for (const assigned of assignments) {
          const dist = mealDistance(assigned, candidateSlot);
          if (dist === 0) continue;

          if (assigned.recipeId === task.recipeId) {
            // FUERZA DE REPULSIÓN (Magia del algoritmo)
            // Si dist=1 -> 100000 pts. Si dist=2 -> 25000 pts. Si dist=5 -> 4000 pts.
            // Esto obliga a la receta a alejarse lo máximo posible matemáticamente de sí misma.
            score += 100000 / (dist * dist);
          } else {
            const otherProfile = profiles.get(assigned.recipeId);
            if (!otherProfile) continue;

            score += similarityPenalty(profile, otherProfile, dist, assigned.dayIndex === candidateSlot.dayIndex);
          }
        }

        if (input.random) score += input.random() * 600;

        // ¿Es este el mejor hueco hasta ahora?
        if (score < bestScore) {
          bestScore = score;
          // Buscar su índice real en el array general de emptySlots
          bestSlotIndex = emptySlots.findIndex(s => s.dayIndex === candidateSlot.dayIndex && s.slot === candidateSlot.slot);
        }
      }

      // 4. Asignar el mejor hueco encontrado
      if (bestSlotIndex !== -1) {
        const chosenSlot = emptySlots[bestSlotIndex];
        assignments.push({
          dayIndex: chosenSlot.dayIndex,
          slot: chosenSlot.slot,
          recipeId: task.recipeId
        });
        emptySlots.splice(bestSlotIndex, 1); // Quitar el hueco de los disponibles

        // --- ALERTAS INFORMATIVAS ---
        if (task.isElaborate && elaborateDays.length > 0 && !elaborateDays.includes(chosenSlot.dayIndex)) {
          warningsSet.add(`"${profile.recipe.name}" es elaborada, pero no quedaron días marcados libres para prepararla.`);
        }

        // Revisar a qué distancia mínima ha quedado de sí misma
        const minDist = assignments
          .filter(a => a.recipeId === task.recipeId && a !== assignments[assignments.length - 1])
          .reduce((min, a) => Math.min(min, mealDistance(a, chosenSlot)), Number.POSITIVE_INFINITY);

        if (minDist <= 2) {
          warningsSet.add(`"${profile.recipe.name}" se repite casi seguido por falta de espacio en el calendario.`);
        }
      }
    }
  }

  // Ordenar el resultado cronológicamente para que la interfaz lo reciba limpio
  assignments.sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.slot === 'comida' ? -1 : 1;
  });

  return { 
    assignments, 
    gaps: emptySlots, // Los huecos que han quedado vacíos al final
    warnings: Array.from(warningsSet) 
  };
}

/**
 * Runs `planMeals` once deterministically plus several randomised variants and
 * keeps the arrangement with the lowest similarity cost (then fewest gaps). A
 * single greedy pass can paint itself into a corner, so comparing variants keeps
 * the result sound; pass `randomize: false` to get only the deterministic one.
 */
export function planMealsBest(
  input: SmartPlanInput,
  attempts = 12,
  random: () => number = Math.random,
  includeDeterministic = true
): SmartPlanResult {
  let best: SmartPlanResult | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let i = 0; i < attempts; i++) {
    const candidate = planMeals(includeDeterministic && i === 0 && !input.random ? { ...input } : { ...input, random: input.random ?? random });
    const cost = scoreArrangement(input, candidate.assignments) + candidate.gaps.length * 1_000_000;
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best as SmartPlanResult;
}
