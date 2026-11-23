import { describe, it, expect } from 'vitest';
import { loadReviewed, saveReviewed } from './reviewedStore';
import type { KeyValueStore } from '../../utils/unassignedStore';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => { data.set(k, v); },
    removeItem: async (k) => { data.delete(k); },
  };
}

describe('reviewedStore', () => {
  it('returns an empty map when nothing was saved', async () => {
    expect(await loadReviewed('plan-1', memoryStore())).toEqual({});
  });

  it('round-trips the review per plan', async () => {
    const store = memoryStore();
    await saveReviewed('plan-1', { sal: 'confirmed', pan: 'none' }, store);
    expect(await loadReviewed('plan-1', store)).toEqual({ sal: 'confirmed', pan: 'none' });
    expect(await loadReviewed('plan-2', store)).toEqual({});
  });

  it('ignores corrupt data', async () => {
    const store = memoryStore();
    await store.setItem('platoplan:shopping-reviewed:plan-1', '{"sal":"maybe","pan":"none"}');
    expect(await loadReviewed('plan-1', store)).toEqual({ pan: 'none' });
    await store.setItem('platoplan:shopping-reviewed:plan-1', 'not json');
    expect(await loadReviewed('plan-1', store)).toEqual({});
  });
});
