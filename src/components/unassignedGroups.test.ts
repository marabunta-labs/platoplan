import { describe, it, expect } from 'vitest';
import { groupUnassigned } from './unassignedGroups';
import type { Recipe } from '../models/types';
import type { MealType } from '../models/enums';

const recipe = (id: string, mealType: MealType): Recipe => ({
  id,
  name: `Receta ${id}`,
  mealType,
  prepTime: 'rapido',
  servings: 1,
  ingredients: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe('groupUnassigned', () => {
  it('returns no groups for an empty drawer', () => {
    expect(groupUnassigned([])).toEqual([]);
  });

  it('separates lunches, dinners and either-slot dishes, in that order', () => {
    const groups = groupUnassigned([recipe('d', 'cena'), recipe('x', 'ambas'), recipe('l', 'comida')]);
    expect(groups.map((g) => g.key)).toEqual(['comida', 'cena', 'ambas']);
  });

  it('omits empty groups', () => {
    const groups = groupUnassigned([recipe('d1', 'cena'), recipe('d2', 'cena')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('cena');
  });

  it('keeps each entry\'s index in the flat list (drag identifies cards by it)', () => {
    const groups = groupUnassigned([recipe('d', 'cena'), recipe('l', 'comida'), recipe('d', 'cena')]);
    const dinners = groups.find((g) => g.key === 'cena')!;
    expect(dinners.items.map((i) => i.index)).toEqual([0, 2]);
    expect(groups.find((g) => g.key === 'comida')!.items[0].index).toBe(1);
  });
});
