import { describe, it, expect } from 'vitest';
import { loadUnassigned, saveUnassigned, type KeyValueStore } from './unassignedStore';

const memoryStore = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
};

describe('unassignedStore', () => {
  it('round-trips ids, keeping duplicates and order', async () => {
    const store = memoryStore();
    await saveUnassigned('p1', ['a', 'b', 'a'], store);
    expect(await loadUnassigned('p1', store)).toEqual(['a', 'b', 'a']);
  });

  it('is isolated per plan', async () => {
    const store = memoryStore();
    await saveUnassigned('p1', ['a'], store);
    expect(await loadUnassigned('p2', store)).toEqual([]);
  });

  it('removes the key when the drawer becomes empty', async () => {
    const store = memoryStore();
    await saveUnassigned('p1', ['a'], store);
    await saveUnassigned('p1', [], store);
    expect(store.data.size).toBe(0);
  });

  it('ignores corrupt or non-array payloads', async () => {
    const store = memoryStore();
    store.data.set('platoplan:unassigned:p1', '{not json');
    expect(await loadUnassigned('p1', store)).toEqual([]);
    store.data.set('platoplan:unassigned:p1', '{"a":1}');
    expect(await loadUnassigned('p1', store)).toEqual([]);
    store.data.set('platoplan:unassigned:p1', '["a", 3, null, "b"]');
    expect(await loadUnassigned('p1', store)).toEqual(['a', 'b']);
  });

  it('never throws if the store fails', async () => {
    const broken: KeyValueStore = {
      getItem: async () => { throw new Error('x'); },
      setItem: async () => { throw new Error('x'); },
      removeItem: async () => { throw new Error('x'); },
    };
    expect(await loadUnassigned('p', broken)).toEqual([]);
    await expect(saveUnassigned('p', ['a'], broken)).resolves.toBeUndefined();
  });
});
