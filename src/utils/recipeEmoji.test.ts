import { describe, it, expect } from 'vitest';
import { getRecipeEmoji, DEFAULT_RECIPE_EMOJI } from './recipeEmoji';
import type { Ingredient, Recipe } from '../models/types';

const ing = (id: string, category: string): Ingredient =>
  ({ id, name: id, unit: 'g', category, purchaseFormat: { description: '', quantity: 0 } }) as unknown as Ingredient;

const recipe = (items: { id: string; category?: string; quantity: number }[]): Pick<Recipe, 'ingredients'> => ({
  ingredients: items.map((i) => ({
    ingredientId: i.id,
    quantity: i.quantity,
    ingredient: i.category ? ing(i.id, i.category) : undefined,
  })),
});

describe('getRecipeEmoji', () => {
  it('falls back for recipes without ingredients', () => {
    expect(getRecipeEmoji(recipe([]))).toBe(DEFAULT_RECIPE_EMOJI);
    expect(getRecipeEmoji(undefined)).toBe(DEFAULT_RECIPE_EMOJI);
  });

  it('uses the category with the largest quantity', () => {
    expect(getRecipeEmoji(recipe([
      { id: 'pollo', category: 'Carnes', quantity: 400 },
      { id: 'sal', category: 'Despensa seca', quantity: 5 },
    ]))).toBe('🥩');
  });

  it('ignores "Otros" and unknown categories', () => {
    expect(getRecipeEmoji(recipe([
      { id: 'x', category: 'Otros', quantity: 900 },
      { id: 'y', category: 'Inventada', quantity: 900 },
      { id: 'z', category: 'Verduras', quantity: 1 },
    ]))).toBe('🥬');
  });

  it('matches word-order variants of a category name', () => {
    expect(getRecipeEmoji(recipe([{ id: 'l', category: 'Huevos y lácteos', quantity: 1 }]))).toBe('🥛');
  });

  it('resolves ingredients from the catalogue when the recipe row has none', () => {
    const byId = new Map([['pez', ing('pez', 'Pescado y marisco')]]);
    expect(getRecipeEmoji(recipe([{ id: 'pez', quantity: 200 }]), byId)).toBe('🐟');
  });
});
