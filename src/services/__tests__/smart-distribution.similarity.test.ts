import { describe, it, expect } from 'vitest';
import { planMeals, planMealsBest, scoreArrangement, type SmartPlanInput } from '../smart-distribution';
import type { Ingredient, Recipe, RecipeIngredient } from '../../models/types';
import type { MealType } from '../../models/enums';

const ING: Record<string, Ingredient> = {};
const ingredient = (id: string, category: string): string => {
  ING[id] = { id, name: id, unit: 'g', category, purchaseFormat: { description: '', quantity: 0 } } as unknown as Ingredient;
  return id;
};
const patata = ingredient('patata', 'Verduras');
const huevo = ingredient('huevo', 'Lácteos y huevos');
const espagueti = ingredient('espagueti', 'Pasta, arroz y legumbres');
const macarron = ingredient('macarron', 'Pasta, arroz y legumbres');
const pollo = ingredient('pollo', 'Carnes');
const ternera = ingredient('ternera', 'Carnes');
const merluza = ingredient('merluza', 'Pescado y marisco');
const lechuga = ingredient('lechuga', 'Verduras');
const tomate = ingredient('tomate', 'Verduras');

const recipe = (id: string, mealType: MealType, items: [string, number][]): Recipe => ({
  id, name: id, mealType, prepTime: 'rapido', servings: 1, createdAt: new Date(0), updatedAt: new Date(0),
  ingredients: items.map(([ingredientId, quantity]): RecipeIngredient => ({ ingredientId, quantity })),
});

const lunches = [
  recipe('pasta-carbonara', 'comida', [[espagueti, 300], [huevo, 2]]),
  recipe('pasta-boloñesa', 'comida', [[macarron, 300], [tomate, 100]]),
  recipe('pollo-asado', 'comida', [[pollo, 500]]),
  recipe('merluza', 'comida', [[merluza, 400]]),
  recipe('ensalada', 'comida', [[lechuga, 200], [tomate, 100]]),
  recipe('tortilla', 'comida', [[patata, 500], [huevo, 4]]),
];
const dinners = [
  recipe('pollo-patatas', 'cena', [[pollo, 300], [patata, 400]]),
  recipe('ternera-plancha', 'cena', [[ternera, 300]]),
  recipe('crema-verduras', 'cena', [[lechuga, 100], [tomate, 200]]),
  recipe('revuelto', 'cena', [[huevo, 4]]),
  recipe('merluza-cena', 'cena', [[merluza, 300]]),
  recipe('sandwich', 'cena', [[tomate, 50]]),
];

const input = (): SmartPlanInput => ({
  periodDays: 6,
  freeDays: [],
  elaborateDays: [],
  lunchSelections: lunches.map((r) => ({ recipeId: r.id, recipe: r, count: 1 })),
  dinnerSelections: dinners.map((r) => ({ recipeId: r.id, recipe: r, count: 1 })),
  ingredientsById: new Map(Object.entries(ING)),
});

const dayOf = (result: ReturnType<typeof planMeals>, id: string) =>
  result.assignments.find((a) => a.recipeId === id)!.dayIndex;

function assertSeparated(result: ReturnType<typeof planMeals>) {
  // Two pasta dishes never on consecutive days.
  expect(Math.abs(dayOf(result, 'pasta-carbonara') - dayOf(result, 'pasta-boloñesa'))).toBeGreaterThanOrEqual(2);
  // Potatoes never at lunch and dinner of the same day.
  expect(dayOf(result, 'tortilla')).not.toBe(dayOf(result, 'pollo-patatas'));
  // Eggs never at lunch and dinner of the same day.
  expect(dayOf(result, 'pasta-carbonara')).not.toBe(dayOf(result, 'revuelto'));
  expect(dayOf(result, 'tortilla')).not.toBe(dayOf(result, 'revuelto'));
  // Same fish / same meat dominant category not twice the same day.
  expect(dayOf(result, 'merluza')).not.toBe(dayOf(result, 'merluza-cena'));
  expect(dayOf(result, 'pollo-asado')).not.toBe(dayOf(result, 'pollo-patatas'));
  expect(dayOf(result, 'pollo-asado')).not.toBe(dayOf(result, 'ternera-plancha'));
}

describe('smart distribution: similar dishes are kept apart', () => {
  it('deterministic plan separates shared ingredients and categories', () => {
    assertSeparated(planMeals(input()));
  });

  it('best-of randomised plans keep the separation', () => {
    for (let i = 0; i < 5; i++) assertSeparated(planMealsBest(input(), 12));
  });

  it('scores a clustered arrangement worse than a spread one', () => {
    const clustered = [
      { dayIndex: 0, slot: 'comida' as const, recipeId: 'pasta-carbonara' },
      { dayIndex: 1, slot: 'comida' as const, recipeId: 'pasta-boloñesa' },
    ];
    const spread = [
      { dayIndex: 0, slot: 'comida' as const, recipeId: 'pasta-carbonara' },
      { dayIndex: 5, slot: 'comida' as const, recipeId: 'pasta-boloñesa' },
    ];
    expect(scoreArrangement(input(), clustered)).toBeGreaterThan(scoreArrangement(input(), spread));
  });

  it('still places every selected meal', () => {
    expect(planMeals(input()).assignments).toHaveLength(12);
  });
});
