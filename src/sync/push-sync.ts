/**
 * PlatoPlan - cloud sync engine (local SQLite ⇄ Supabase)
 *
 * Keeps Supabase in step with the local database while preserving the local
 * ids (so relations between tables stay valid). One pass does, per table:
 *
 *   1. PULL   rows that exist remotely but were never seen on this device
 *             (e.g. created elsewhere, or restoring after clearing the app).
 *   2. DELETE remote rows that this device pushed earlier but no longer has
 *             locally (i.e. the user deleted them here).
 *   3. UPSERT local rows that are new or changed since the last push.
 *
 * "Pushed earlier" is tracked in a local state table (key → row hash). It lives
 * in the same SQLite database as the data, so if the local data is wiped the
 * state is wiped too and a wipe can never be mistaken for "delete everything".
 *
 * The engine only talks to the `LocalStore` / `RemoteStore` interfaces, so its
 * logic is unit-tested with in-memory fakes.
 */

import { MIGRATION_TABLE_ORDER, mapLocalRowToRemote, type MigratableTable } from '../services/migration.service';

export type Row = Record<string, unknown>;

/** table → (row key → hash of the row as last pushed) */
export type PushState = Record<string, Record<string, string>>;

export interface LocalStore {
  readAll(table: MigratableTable): Promise<Row[]>;
  /** Inserts a row coming from Supabase into the local database. Throws on failure. */
  insertFromRemote(table: MigratableTable, remoteRow: Row): Promise<void>;
  loadState(): Promise<PushState>;
  saveState(table: MigratableTable, upserts: Record<string, string>, removals: string[]): Promise<void>;
}

export interface RemoteStore {
  listKeys(table: MigratableTable): Promise<string[]>;
  fetchRows(table: MigratableTable): Promise<Row[]>;
  /** Throws if Supabase rejects the batch. */
  upsert(table: MigratableTable, rows: Row[]): Promise<void>;
  remove(table: MigratableTable, keys: string[]): Promise<void>;
}

export interface SyncFailure {
  table: string;
  key?: string;
  phase: 'pull' | 'delete' | 'upsert' | 'skipped';
  error: string;
}

export interface SyncSummary {
  pushed: number;
  deleted: number;
  pulled: number;
  failed: SyncFailure[];
  /** Tables whose local content changed because of a pull (UI should refresh). */
  pulledTables: MigratableTable[];
}

const KEY_COLUMNS: Record<MigratableTable, string[]> = {
  ingredients: ['id'],
  recipes: ['id'],
  recipe_ingredients: ['recipe_id', 'ingredient_id'],
  pantry_entries: ['id'],
  menu_plans: ['id'],
  plan_assignments: ['id'],
  free_days: ['id'],
  shopping_lists: ['id'],
  shopping_list_items: ['id'],
};

/** Deleting everything in these tables needs more than an empty local table to be trusted. */
const ROOT_TABLES = new Set<MigratableTable>(['recipes', 'ingredients', 'menu_plans']);

const UPSERT_CHUNK = 100;

export function keyColumns(table: MigratableTable): string[] {
  return KEY_COLUMNS[table];
}

export function rowKey(table: MigratableTable, row: Row): string {
  return KEY_COLUMNS[table].map((c) => String(row[c])).join(':');
}

/** Small stable string hash (djb2) of a row, independent of key order. */
export function hashRow(row: Row): string {
  const json = JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]));
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + json.length;
}

/**
 * Converts a Supabase row into the shape of the local table: drops remote-only
 * columns and converts booleans/objects to what SQLite stores.
 */
export function mapRemoteRowToLocal(remote: Row, localColumns: Set<string>): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(remote)) {
    if (key === 'user_id' || key === 'synced_at') continue;
    if (!localColumns.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'boolean') out[key] = value ? 1 : 0;
    else if (typeof value === 'object') out[key] = JSON.stringify(value);
    else out[key] = value;
  }
  return out;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The row as it is sent to Supabase, without the per-push `synced_at` timestamp. */
function remoteShape(table: MigratableTable, row: Row, userId: string): Row {
  const { synced_at: _omit, ...rest } = mapLocalRowToRemote(table, row, userId);
  return rest;
}

export async function runSync(
  local: LocalStore,
  remote: RemoteStore,
  userId: string,
  options: { pull: boolean }
): Promise<SyncSummary> {
  const summary: SyncSummary = { pushed: 0, deleted: 0, pulled: 0, failed: [], pulledTables: [] };
  const state = await local.loadState();
  const localRows = new Map<MigratableTable, Row[]>();
  const pulledKeys = new Set<string>();

  // ── 1. PULL ──────────────────────────────────────────────────────────────
  for (const table of MIGRATION_TABLE_ORDER) {
    let rows = await local.readAll(table);

    if (options.pull) {
      try {
        const known = new Set(rows.map((r) => rowKey(table, r)));
        const pushed = state[table] ?? {};
        const missing = (await remote.listKeys(table)).filter((k) => !known.has(k) && !(k in pushed));
        if (missing.length > 0) {
          const wanted = new Set(missing);
          let inserted = 0;
          for (const remoteRow of await remote.fetchRows(table)) {
            const key = rowKey(table, remoteRow);
            if (!wanted.has(key)) continue;
            try {
              await local.insertFromRemote(table, remoteRow);
              pulledKeys.add(`${table}|${key}`);
              inserted++;
            } catch (e) {
              summary.failed.push({ table, key, phase: 'pull', error: errorMessage(e) });
            }
          }
          if (inserted > 0) {
            summary.pulled += inserted;
            summary.pulledTables.push(table);
            rows = await local.readAll(table);
          }
        }
      } catch (e) {
        summary.failed.push({ table, phase: 'pull', error: errorMessage(e) });
      }
    }
    localRows.set(table, rows);
  }

  // ── 2. DELETE (children first) ───────────────────────────────────────────
  for (const table of [...MIGRATION_TABLE_ORDER].reverse()) {
    const rows = localRows.get(table) ?? [];
    const localKeys = new Set(rows.map((r) => rowKey(table, r)));
    const pushed = state[table] ?? {};
    const stale = Object.keys(pushed).filter((k) => !localKeys.has(k));
    if (stale.length === 0) continue;

    if (ROOT_TABLES.has(table) && rows.length === 0) {
      summary.failed.push({
        table,
        phase: 'skipped',
        error: 'Local table is empty; refusing to delete every remote row.',
      });
      continue;
    }

    try {
      await remote.remove(table, stale);
      await local.saveState(table, {}, stale);
      for (const k of stale) delete pushed[k];
      summary.deleted += stale.length;
    } catch (e) {
      summary.failed.push({ table, phase: 'delete', error: errorMessage(e) });
    }
  }

  // ── 3. UPSERT (parents first) ────────────────────────────────────────────
  for (const table of MIGRATION_TABLE_ORDER) {
    const pushed = state[table] ?? (state[table] = {});
    const changed: { key: string; hash: string; remoteRow: Row }[] = [];
    const untouched: Record<string, string> = {};

    for (const row of localRows.get(table) ?? []) {
      const key = rowKey(table, row);
      let remoteRow: Row;
      try {
        remoteRow = remoteShape(table, row, userId);
      } catch (e) {
        summary.failed.push({ table, key, phase: 'upsert', error: errorMessage(e) });
        continue;
      }
      const hash = hashRow(remoteRow);
      if (pushed[key] === hash) continue;
      if (pulledKeys.has(`${table}|${key}`)) {
        // Just came from Supabase: it is already there, only remember it.
        untouched[key] = hash;
        continue;
      }
      changed.push({ key, hash, remoteRow });
    }

    if (Object.keys(untouched).length > 0) {
      await local.saveState(table, untouched, []);
      Object.assign(pushed, untouched);
    }

    for (let i = 0; i < changed.length; i += UPSERT_CHUNK) {
      const chunk = changed.slice(i, i + UPSERT_CHUNK);
      const ok: Record<string, string> = {};
      try {
        await remote.upsert(table, chunk.map((c) => c.remoteRow));
        for (const c of chunk) ok[c.key] = c.hash;
      } catch {
        // One bad row must not block the rest: retry the chunk row by row.
        for (const c of chunk) {
          try {
            await remote.upsert(table, [c.remoteRow]);
            ok[c.key] = c.hash;
          } catch (e) {
            summary.failed.push({ table, key: c.key, phase: 'upsert', error: errorMessage(e) });
          }
        }
      }
      if (Object.keys(ok).length > 0) {
        await local.saveState(table, ok, []);
        Object.assign(pushed, ok);
        summary.pushed += Object.keys(ok).length;
      }
    }
  }

  return summary;
}
