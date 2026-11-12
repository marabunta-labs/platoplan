/**
 * PlatoPlan - concrete stores for the sync engine (SQLite and Supabase).
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MigratableTable } from '../services/migration.service';
import { keyColumns, mapRemoteRowToLocal, rowKey, type LocalStore, type PushState, type RemoteStore, type Row } from './push-sync';

const PAGE = 1000;

export function createSqliteLocalStore(db: SQLiteDatabase, userId: string): LocalStore {
  const columnCache = new Map<string, Set<string>>();
  let stateTableReady = false;

  const ensureStateTable = async () => {
    if (stateTableReady) return;
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS _push_state (
        user_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        row_key TEXT NOT NULL,
        row_hash TEXT NOT NULL,
        PRIMARY KEY (user_id, table_name, row_key)
      );
    `);
    stateTableReady = true;
  };

  const localColumns = async (table: string) => {
    let cols = columnCache.get(table);
    if (!cols) {
      const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
      cols = new Set(info.map((c) => c.name));
      columnCache.set(table, cols);
    }
    return cols;
  };

  return {
    readAll: (table) => db.getAllAsync<Row>(`SELECT * FROM ${table}`),

    async insertFromRemote(table, remoteRow) {
      const row = mapRemoteRowToLocal(remoteRow, await localColumns(table));
      const columns = Object.keys(row);
      await db.runAsync(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        ...columns.map((c) => row[c] as string | number)
      );
    },

    async loadState() {
      await ensureStateTable();
      const rows = await db.getAllAsync<{ table_name: string; row_key: string; row_hash: string }>(
        'SELECT table_name, row_key, row_hash FROM _push_state WHERE user_id = ?',
        userId
      );
      const state: PushState = {};
      for (const r of rows) (state[r.table_name] ??= {})[r.row_key] = r.row_hash;
      return state;
    },

    async saveState(table, upserts, removals) {
      await ensureStateTable();
      for (const [key, hash] of Object.entries(upserts)) {
        await db.runAsync(
          'INSERT OR REPLACE INTO _push_state (user_id, table_name, row_key, row_hash) VALUES (?, ?, ?, ?)',
          userId, table, key, hash
        );
      }
      for (const key of removals) {
        await db.runAsync(
          'DELETE FROM _push_state WHERE user_id = ? AND table_name = ? AND row_key = ?',
          userId, table, key
        );
      }
    },
  };
}

export function createSupabaseRemoteStore(client: SupabaseClient, userId: string): RemoteStore {
  const fetchAll = async (table: MigratableTable, columns: string): Promise<Row[]> => {
    const all: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from(table)
        .select(columns)
        .eq('user_id', userId)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as Row[];
      all.push(...page);
      if (page.length < PAGE) return all;
    }
  };

  return {
    async listKeys(table) {
      return (await fetchAll(table, keyColumns(table).join(','))).map((r) => rowKey(table, r));
    },

    fetchRows: (table) => fetchAll(table, '*'),

    async upsert(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: keyColumns(table).join(',') });
      if (error) throw new Error(error.message);
    },

    async remove(table, keys) {
      const cols = keyColumns(table);
      if (cols.length === 1) {
        for (let i = 0; i < keys.length; i += 100) {
          const { error } = await client.from(table).delete().eq('user_id', userId).in(cols[0], keys.slice(i, i + 100));
          if (error) throw new Error(error.message);
        }
        return;
      }
      for (const key of keys) {
        const parts = key.split(':');
        let query = client.from(table).delete().eq('user_id', userId);
        cols.forEach((col, idx) => { query = query.eq(col, parts[idx]); });
        const { error } = await query;
        if (error) throw new Error(error.message);
      }
    },
  };
}
