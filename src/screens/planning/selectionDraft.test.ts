import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectionSignature,
  totalSelected,
  applySelectionDelta,
  clampSelections,
  sortRecipesBySelection,
  saveSelectionDraft,
  loadSelectionDraft,
  clearSelectionDraft,
  type RecipeSelection,
} from './selectionDraft';

describe('selectionSignature', () => {
  it('ignores order and zero counts', () => {
    const a = selectionSignature([{ recipeId: 'a', count: 1 }, { recipeId: 'b', count: 2 }], []);
    const b = selectionSignature([{ recipeId: 'b', count: 2 }, { recipeId: 'a', count: 1 }, { recipeId: 'c', count: 0 }], []);
    expect(a).toBe(b);
  });

  it('distinguishes lunch from dinner', () => {
    const lunch = selectionSignature([{ recipeId: 'a', count: 1 }], []);
    const dinner = selectionSignature([], [{ recipeId: 'a', count: 1 }]);
    expect(lunch).not.toBe(dinner);
  });
});

describe('applySelectionDelta', () => {
  it('adds a new recipe', () => {
    expect(applySelectionDelta([], 'a', 1, 3)).toEqual([{ recipeId: 'a', count: 1 }]);
  });

  it('increments an existing recipe without mutating the input', () => {
    const prev: RecipeSelection[] = [{ recipeId: 'a', count: 1 }];
    const next = applySelectionDelta(prev, 'a', 1, 3);
    expect(next).toEqual([{ recipeId: 'a', count: 2 }]);
    expect(prev).toEqual([{ recipeId: 'a', count: 1 }]);
  });

  it('never exceeds the required total', () => {
    const prev: RecipeSelection[] = [{ recipeId: 'a', count: 2 }, { recipeId: 'b', count: 1 }];
    expect(applySelectionDelta(prev, 'c', 1, 3)).toBe(prev);
    expect(applySelectionDelta(prev, 'a', 1, 3)).toBe(prev);
  });

  it('removes the entry when it reaches zero', () => {
    expect(applySelectionDelta([{ recipeId: 'a', count: 1 }], 'a', -1, 3)).toEqual([]);
  });

  it('is a no-op when decrementing something not selected', () => {
    const prev: RecipeSelection[] = [{ recipeId: 'a', count: 1 }];
    expect(applySelectionDelta(prev, 'zzz', -1, 3)).toBe(prev);
  });
});

describe('clampSelections', () => {
  it('keeps everything when under the limit', () => {
    const list = [{ recipeId: 'a', count: 2 }];
    expect(clampSelections(list, 5)).toEqual(list);
  });

  it('trims the tail so the total fits', () => {
    const result = clampSelections([{ recipeId: 'a', count: 3 }, { recipeId: 'b', count: 3 }], 4);
    expect(result).toEqual([{ recipeId: 'a', count: 3 }, { recipeId: 'b', count: 1 }]);
    expect(totalSelected(result)).toBe(4);
  });

  it('returns nothing for a zero or negative limit', () => {
    expect(clampSelections([{ recipeId: 'a', count: 1 }], 0)).toEqual([]);
    expect(clampSelections([{ recipeId: 'a', count: 1 }], -2)).toEqual([]);
  });
});

describe('sortRecipesBySelection', () => {
  const recipes = [
    { id: '1', name: 'Zanahorias' },
    { id: '2', name: 'Arroz' },
    { id: '3', name: 'Lentejas' },
  ];

  it('orders alphabetically when nothing is selected', () => {
    expect(sortRecipesBySelection(recipes, [], 'es').map((r) => r.name)).toEqual(['Arroz', 'Lentejas', 'Zanahorias']);
  });

  it('floats selected recipes up, most repeated first', () => {
    const sorted = sortRecipesBySelection(
      recipes,
      [{ recipeId: '1', count: 1 }, { recipeId: '3', count: 2 }],
      'es'
    );
    expect(sorted.map((r) => r.name)).toEqual(['Lentejas', 'Zanahorias', 'Arroz']);
  });

  it('does not mutate the input array', () => {
    const copy = [...recipes];
    sortRecipesBySelection(recipes, [{ recipeId: '1', count: 1 }], 'es');
    expect(recipes).toEqual(copy);
  });
});

describe('selection draft store', () => {
  beforeEach(() => clearSelectionDraft('plan-1'));

  it('returns null when there is no draft', () => {
    expect(loadSelectionDraft('plan-1')).toBeNull();
  });

  it('restores what was saved (the "create recipe then come back" flow)', () => {
    saveSelectionDraft('plan-1', {
      lunch: [{ recipeId: 'a', count: 2 }],
      dinner: [{ recipeId: 'b', count: 1 }],
    });
    expect(loadSelectionDraft('plan-1')).toEqual({
      lunch: [{ recipeId: 'a', count: 2 }],
      dinner: [{ recipeId: 'b', count: 1 }],
    });
  });

  it('keeps drafts isolated per plan and clears them', () => {
    saveSelectionDraft('plan-1', { lunch: [{ recipeId: 'a', count: 1 }], dinner: [] });
    expect(loadSelectionDraft('plan-2')).toBeNull();
    clearSelectionDraft('plan-1');
    expect(loadSelectionDraft('plan-1')).toBeNull();
  });

  it('stores a copy, so later mutation of the source does not leak in', () => {
    const lunch: RecipeSelection[] = [{ recipeId: 'a', count: 1 }];
    saveSelectionDraft('plan-1', { lunch, dinner: [] });
    lunch.push({ recipeId: 'x', count: 9 });
    expect(loadSelectionDraft('plan-1')!.lunch).toEqual([{ recipeId: 'a', count: 1 }]);
  });
});

import { filterRecipesByQuery } from './selectionDraft';

describe('filterRecipesByQuery', () => {
  const recipes = [{ name: 'Lentejas estofadas' }, { name: 'Tortilla de patatas' }, { name: 'Crema de calabaza' }];

  it('keeps everything for an empty query', () => {
    expect(filterRecipesByQuery(recipes, '  ')).toEqual(recipes);
  });

  it('matches ignoring case and accents', () => {
    expect(filterRecipesByQuery([{ name: 'Sopa de cebolla' }, { name: 'Ñoquis' }], 'ÑOQ')).toEqual([{ name: 'Ñoquis' }]);
    expect(filterRecipesByQuery([{ name: 'Pisto' }, { name: 'Café' }], 'cafe')).toEqual([{ name: 'Café' }]);
  });

  it('returns nothing when no name matches', () => {
    expect(filterRecipesByQuery(recipes, 'zzz')).toEqual([]);
  });
});
