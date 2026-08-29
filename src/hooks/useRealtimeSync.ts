/**
 * PlatoPlan - useRealtimeSync hook
 *
 * Bridges Supabase Realtime remote changes to the local SQLite cache and triggers
 * UI re-renders. When the SyncManager receives a remote change via Realtime:
 *   1. Writes the change to local SQLite (upsert for INSERT/UPDATE, delete for DELETE)
 *   2. Notifies registered table listeners to refresh their data
 *
 * This hook should be mounted once at a high level in the component tree
 * (e.g., inside SyncProvider or the main App layout).
 *
 * Requirements: 6.5
 */

import { useEffect, useRef } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useSync } from '../context/SyncContext';
import { useDatabase } from '../context/DatabaseContext';
import { tableInvalidationEmitter } from './tableInvalidationEmitter';

/**
 * Mapping of Supabase table names to their SQLite column schemas.
 * Used to dynamically build upsert queries for incoming remote records.
 */
const TABLE_PRIMARY_KEY = 'id';

/**
 * Applies a remote change to the local SQLite database.
 *
 * For INSERT/UPDATE: performs an upsert (INSERT OR REPLACE) with all fields from the record.
 * For DELETE: removes the record by its primary key.
 */
async function applyRemoteChangeToLocalDb(
  db: SQLiteDatabase,
  table: string,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  record: Record<string, unknown>
): Promise<void> {
  const entityId = record[TABLE_PRIMARY_KEY] as string | undefined;

  if (!entityId) {
    // Cannot process a record without a primary key
    return;
  }

  if (eventType === 'DELETE') {
    await db.runAsync(
      `DELETE FROM ${table} WHERE ${TABLE_PRIMARY_KEY} = ?`,
      entityId
    );
    return;
  }

  // For INSERT and UPDATE: upsert using INSERT OR REPLACE
  // Filter out null/undefined values and build column list from the record
  const entries = Object.entries(record).filter(
    ([, value]) => value !== undefined && value !== null
  );

  if (entries.length === 0) {
    return;
  }

  const columns = entries.map(([key]) => key);
  const placeholders = entries.map(() => '?');
  const values = entries.map(([, value]) => {
    // Handle nested objects/arrays by JSON serializing them
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return value as string | number;
  });

  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;

  try {
    await db.runAsync(sql, ...values);
  } catch {
    // If INSERT OR REPLACE fails (e.g., missing required columns on insert),
    // try an UPDATE instead for existing records
    if (eventType === 'UPDATE') {
      const setClauses = columns
        .filter((col) => col !== TABLE_PRIMARY_KEY)
        .map((col) => `${col} = ?`);
      const updateValues = entries
        .filter(([key]) => key !== TABLE_PRIMARY_KEY)
        .map(([, value]) => {
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return value as string | number;
        });

      if (setClauses.length > 0) {
        const updateSql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${TABLE_PRIMARY_KEY} = ?`;
        await db.runAsync(updateSql, ...updateValues, entityId);
      }
    }
  }
}

/**
 * Hook that listens for remote changes from the SyncManager and applies them
 * to the local SQLite database, then triggers UI refreshes via the table
 * invalidation emitter.
 *
 * Mount this hook once in a component that has access to both SyncProvider
 * and DatabaseProvider (typically at the app root level).
 *
 * @example
 * ```tsx
 * function AppLayout() {
 *   useRealtimeSync();
 *   return <MainNavigator />;
 * }
 * ```
 */
export function useRealtimeSync(): void {
  const syncManager = useSync();
  const db = useDatabase();
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    const unsubscribe = syncManager.onRemoteChange(
      async (table, eventType, record) => {
        try {
          // Step 1: Update local SQLite cache with the remote change
          await applyRemoteChangeToLocalDb(dbRef.current, table, eventType, record);

          // Step 2: Notify UI hooks that this table's data has changed
          tableInvalidationEmitter.emit(table);
        } catch {
          // If writing to local DB fails, still try to trigger a refresh
          // so hooks re-read whatever state is consistent
          tableInvalidationEmitter.emit(table);
        }
      }
    );

    return unsubscribe;
  }, [syncManager]);
}
