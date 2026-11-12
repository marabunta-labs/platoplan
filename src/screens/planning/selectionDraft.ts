/**
 * PlatoPlan - Recipe selection draft helpers
 *
 * Pure helpers (plus a tiny in-memory draft store) for the recipe selection
 * step of the planning flow.
 *
 * The draft store exists because the tab navigator resets a tab's stack when
 * the user leaves it (`popToTopOnBlur`). Creating a recipe from the selection
 * step switches to the Recipes tab, which unmounts the selection screen and
 * used to throw away every count the user had already chosen.
 */

export interface RecipeSelection {
  recipeId: string;
  count: number;
}

export interface SelectionDraft {
  lunch: RecipeSelection[];
  dinner: RecipeSelection[];
}

/** Stable, order-independent signature of the selected recipe counts. */
export function selectionSignature(lunch: RecipeSelection[], dinner: RecipeSelection[]): string {
  const norm = (list: RecipeSelection[]) =>
    list
      .filter((s) => s.count > 0)
      .map((s) => `${s.recipeId}:${s.count}`)
      .sort()
      .join(',');
  return `L[${norm(lunch)}]D[${norm(dinner)}]`;
}

export function totalSelected(selections: RecipeSelection[]): number {
  return selections.reduce((sum, s) => sum + s.count, 0);
}

/**
 * Applies a +1/-1 style change to a selection list, never exceeding `maxTotal`
 * and dropping entries that reach zero. Returns the same array when nothing changes.
 */
export function applySelectionDelta(
  prev: RecipeSelection[],
  recipeId: string,
  delta: number,
  maxTotal: number
): RecipeSelection[] {
  const existing = prev.find((s) => s.recipeId === recipeId);
  const newCount = Math.max(0, (existing?.count ?? 0) + delta);

  if (delta > 0 && totalSelected(prev) >= maxTotal) return prev;
  if (newCount === (existing?.count ?? 0)) return prev;

  if (newCount === 0) return prev.filter((s) => s.recipeId !== recipeId);
  if (existing) return prev.map((s) => (s.recipeId === recipeId ? { ...s, count: newCount } : s));
  return [...prev, { recipeId, count: newCount }];
}

/**
 * Trims a selection list so its total never exceeds `maxTotal`. Used when a
 * stored draft is restored after the plan's free days changed.
 */
export function clampSelections(selections: RecipeSelection[], maxTotal: number): RecipeSelection[] {
  const result: RecipeSelection[] = [];
  let remaining = Math.max(0, maxTotal);
  for (const s of selections) {
    if (remaining <= 0) break;
    if (s.count <= 0) continue;
    const count = Math.min(s.count, remaining);
    result.push({ recipeId: s.recipeId, count });
    remaining -= count;
  }
  return result;
}

/** Selected recipes first (most repeated first), then alphabetical. */
export function sortRecipesBySelection<T extends { id: string; name: string }>(
  recipes: T[],
  selections: RecipeSelection[],
  locale: string
): T[] {
  const counts = new Map(selections.map((s) => [s.recipeId, s.count]));
  return [...recipes].sort((a, b) => {
    const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
    return diff || a.name.localeCompare(b.name, locale);
  });
}

const fold = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Accent- and case-insensitive name filter; an empty query keeps everything. */
export function filterRecipesByQuery<T extends { name: string }>(recipes: T[], query: string): T[] {
  const q = fold(query);
  return q === '' ? recipes : recipes.filter((r) => fold(r.name).includes(q));
}

// ---------------------------------------------------------------------------
// In-memory draft store (per plan)
// ---------------------------------------------------------------------------

const drafts = new Map<string, SelectionDraft>();

export function saveSelectionDraft(planId: string, draft: SelectionDraft): void {
  drafts.set(planId, { lunch: [...draft.lunch], dinner: [...draft.dinner] });
}

export function loadSelectionDraft(planId: string): SelectionDraft | null {
  const draft = drafts.get(planId);
  return draft ? { lunch: [...draft.lunch], dinner: [...draft.dinner] } : null;
}

export function clearSelectionDraft(planId: string): void {
  drafts.delete(planId);
}
