/**
 * PlatoPlan - persistence of the calendar's "Sin asignar" drawer
 *
 * The drawer holds recipes taken out of the calendar but not yet placed again.
 * It used to live only in component state, so leaving the calendar lost it.
 * It is stored per plan as a JSON array of recipe ids (duplicates are
 * meaningful: the same dish can wait in the drawer more than once).
 */

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const keyFor = (planId: string) => `platoplan:unassigned:${planId}`;

// Loaded lazily so this module stays importable in non-RN environments (tests).
async function defaultStore(): Promise<KeyValueStore> {
  const mod = await import('@react-native-async-storage/async-storage');
  return mod.default as KeyValueStore;
}

export async function loadUnassigned(planId: string, store?: KeyValueStore): Promise<string[]> {
  try {
    const raw = await (store ?? (await defaultStore())).getItem(keyFor(planId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveUnassigned(planId: string, ids: string[], store?: KeyValueStore): Promise<void> {
  try {
    const target = store ?? (await defaultStore());
    if (ids.length === 0) await target.removeItem(keyFor(planId));
    else await target.setItem(keyFor(planId), JSON.stringify(ids));
  } catch {
    // Persisting the drawer is best-effort; never break the calendar over it.
  }
}
