/**
 * PlatoPlan - persistence of the shopping list review state
 *
 * Which ingredients the user has already reviewed ("I have it" / "I don't have
 * it") used to live only in component state, so reopening the list sent
 * everything back to "Por revisar". It is stored per plan as a JSON map
 * { ingredientId: 'confirmed' | 'none' }. The pantry quantities themselves are
 * already persisted by confirmPantryQuantity.
 */
import type { KeyValueStore } from '../../utils/unassignedStore';
import type { PantryReview } from './classifyItem';

const keyFor = (planId: string) => `platoplan:shopping-reviewed:${planId}`;

// Loaded lazily so this module stays importable in non-RN environments (tests).
async function defaultStore(): Promise<KeyValueStore> {
  const mod = await import('@react-native-async-storage/async-storage');
  return mod.default as KeyValueStore;
}

export async function loadReviewed(planId: string, store?: KeyValueStore): Promise<Record<string, PantryReview>> {
  try {
    const raw = await (store ?? (await defaultStore())).getItem(keyFor(planId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, PantryReview> = {};
    for (const [id, status] of Object.entries(parsed)) {
      if (status === 'confirmed' || status === 'none') result[id] = status;
    }
    return result;
  } catch {
    return {};
  }
}

export async function saveReviewed(planId: string, reviewed: Record<string, PantryReview>, store?: KeyValueStore): Promise<void> {
  try {
    const target = store ?? (await defaultStore());
    if (Object.keys(reviewed).length === 0) await target.removeItem(keyFor(planId));
    else await target.setItem(keyFor(planId), JSON.stringify(reviewed));
  } catch {
    // Persistence is best-effort: the review still works for this session.
  }
}
