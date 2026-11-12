import { describe, it, expect } from 'vitest';
import { planMeals, planMealsBest } from '../smart-distribution';
import type { Recipe } from '../../models/types';

const recipe = (id: string): Recipe => ({
  id, name: id, mealType: 'comida', prepTime: 'rapido', servings: 1, ingredients: [], createdAt: new Date(0), updatedAt: new Date(0),
});

const input = () => ({
  periodDays: 10,
  freeDays: [],
  elaborateDays: [],
  lunchSelections: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ recipeId: id, recipe: recipe(id), count: 2 })),
  dinnerSelections: [],
  ingredientsById: new Map(),
});

describe('planMeals random tie-breaking (Recalcular)', () => {
  it('is deterministic without a random source', () => {
    expect(planMeals(input()).assignments).toEqual(planMeals(input()).assignments);
  });

  it('produces different arrangements for different random sources', () => {
    let seed = 1;
    const lcg = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      seen.add(JSON.stringify(planMeals({ ...input(), random: lcg }).assignments));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('still places every meal exactly once and never the same dish on consecutive days', () => {
    const result = planMealsBest(input());
    expect(result.assignments).toHaveLength(10);
    expect(new Set(result.assignments.map((a) => a.dayIndex)).size).toBe(10);
    const byDay = [...result.assignments].sort((x, y) => x.dayIndex - y.dayIndex);
    for (let i = 1; i < byDay.length; i++) expect(byDay[i].recipeId).not.toBe(byDay[i - 1].recipeId);
  });
});
