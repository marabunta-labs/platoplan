import { describe, it, expect, vi } from 'vitest';
import { SupabaseRecipeRepository } from '../supabase/recipe.repository';

/** Minimal chainable Supabase client that records what is written. */
function fakeClient(row: Record<string, unknown>) {
  const inserts: { table: string; payload: any }[] = [];
  const updates: { table: string; payload: any }[] = [];
  const chain = (table: string): any => {
    const api: any = {
      insert: (payload: unknown) => { inserts.push({ table, payload }); return api; },
      update: (payload: unknown) => { updates.push({ table, payload }); return api; },
      delete: () => api,
      select: () => api,
      eq: () => api,
      single: async () => ({ data: row, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    };
    return api;
  };
  return { client: { from: vi.fn((t: string) => chain(t)) } as any, inserts, updates };
}

const baseRow = {
  id: 'r1', user_id: 'u', name: 'Lentejas', meal_type: 'comida', prep_time: 'rapido',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', synced_at: null,
};

describe('SupabaseRecipeRepository servings/description', () => {
  it('writes servings and description on create', async () => {
    const { client, inserts } = fakeClient({ ...baseRow, servings: 4, description: 'rica' });
    const repo = new SupabaseRecipeRepository(client, 'u');
    const recipe = await repo.create({
      name: 'Lentejas', mealType: 'comida', prepTime: 'rapido', servings: 4, description: 'rica', ingredients: [],
    } as any);
    const recipeInsert = inserts.find((i) => i.table === 'recipes')!;
    expect(recipeInsert.payload.servings).toBe(4);
    expect(recipeInsert.payload.description).toBe('rica');
    expect(recipe.servings).toBe(4);
    expect(recipe.description).toBe('rica');
  });

  it('defaults servings to 1 when the row has none (older schema)', async () => {
    const { client } = fakeClient(baseRow);
    const repo = new SupabaseRecipeRepository(client, 'u');
    const recipe = await repo.create({ name: 'x', mealType: 'comida', prepTime: 'rapido', ingredients: [] } as any);
    expect(recipe.servings).toBe(1);
    expect(recipe.description).toBeUndefined();
  });

  it('sends changed servings/description on update', async () => {
    const { client, updates } = fakeClient({ ...baseRow, servings: 3 });
    const repo = new SupabaseRecipeRepository(client, 'u');
    await repo.update('r1', { servings: 3, description: 'nueva' } as any).catch(() => undefined);
    const upd = updates.find((u) => u.table === 'recipes')!;
    expect(upd.payload).toMatchObject({ servings: 3, description: 'nueva' });
  });
});
