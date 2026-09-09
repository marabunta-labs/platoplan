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

interface RecipeProfile {
  recipe: Recipe;
  ingredientIds: Set<string>;
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

export function planMeals(input: SmartPlanInput): SmartPlanResult {
  const { periodDays, freeDays, elaborateDays, ingredientsById } = input;
  const warningsSet = new Set<string>();

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

            // 2. Evitar dos elaboradas el mismo día (comida y cena)
            if (task.isElaborate && otherProfile.isElaborate && assigned.dayIndex === candidateSlot.dayIndex) {
              score += 20000;
            }

            // 3. Evaluar solapamiento de ingredientes y categorías (solo si están cerca).
            //    Se penaliza con fuerza el compartir ingredientes o categoría
            //    dominante en comidas próximas (p. ej. carne dos días seguidos,
            //    o patata en comida y cena del mismo día).
            if (dist <= 4) {
               const proximity = (5 - dist) / 4; // De 1 (consecutivo) a 0.25 (a 4 comidas de distancia)
               const similarity = ingredientSimilarity(profile.ingredientIds, otherProfile.ingredientIds);

               // Solapamiento de ingredientes concretos: cuanto más comparten y
               // más cerca están, mayor penalización.
               score += similarity * 4000 * proximity;

               // Misma categoría dominante (carne/carne, pasta/pasta...) cerca.
               if (
                 profile.dominantCategory &&
                 profile.dominantCategory === otherProfile.dominantCategory
               ) {
                 // Penalización fuerte si es consecutivo o el mismo día,
                 // decreciente con la distancia hasta 4 comidas.
                 score += (dist <= 2 ? 3000 : 1000) * proximity;
               }
            }
          }
        }

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