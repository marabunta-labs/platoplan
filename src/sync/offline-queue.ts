import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '../database/database';
import type { MutationType, SyncQueueEntry, SyncMeta } from '../models/sync-types';

/**
 * SQL statements for creating the sync queue and metadata tables.
 */
const CREATE_SYNC_QUEUE_TABLE = `
CREATE TABLE IF NOT EXISTS _sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'failed'))
);
`;

const CREATE_SYNC_QUEUE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON _sync_queue(status, created_at);
`;

const CREATE_SYNC_META_TABLE = `
CREATE TABLE IF NOT EXISTS _sync_meta (
  table_name TEXT PRIMARY KEY,
  last_synced_at TEXT
);
`;

/**
 * OfflineQueue manages a local SQLite-backed queue of mutations
 * that need to be synced to the remote Supabase backend.
 *
 * It stores create/update/delete operations performed while offline
 * and provides methods to dequeue them in chronological order for replay.
 */
export class OfflineQueue {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  /**
   * Initializes the sync queue and metadata tables.
   * This is idempotent — safe to call multiple times.
   */
  async initialize(): Promise<void> {
    await this.db.execAsync(CREATE_SYNC_QUEUE_TABLE);
    await this.db.execAsync(CREATE_SYNC_QUEUE_INDEX);
    await this.db.execAsync(CREATE_SYNC_META_TABLE);
  }

  /**
   * Enqueues a mutation operation for later sync.
   *
   * @param operation - The type of mutation (create, update, delete)
   * @param table - The target table name
   * @param entityId - The ID of the entity being mutated
   * @param payload - The mutation data (will be JSON-serialized)
   * @returns The created SyncQueueEntry
   */
  async enqueue(
    operation: MutationType,
    table: string,
    entityId: string,
    payload: unknown
  ): Promise<SyncQueueEntry> {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const serializedPayload = JSON.stringify(payload);

    await this.db.runAsync(
      `INSERT INTO _sync_queue (id, table_name, operation, entity_id, payload, created_at, retry_count, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')`,
      id,
      table,
      operation,
      entityId,
      serializedPayload,
      createdAt
    );

    return {
      id,
      table_name: table,
      operation,
      entity_id: entityId,
      payload: serializedPayload,
      created_at: createdAt,
      retry_count: 0,
      status: 'pending',
    };
  }

  /**
   * Returns all pending queue entries in chronological order (oldest first).
   * Only returns entries with status='pending'.
   */
  async dequeue(): Promise<SyncQueueEntry[]> {
    const rows = await this.db.getAllAsync<SyncQueueEntry>(
      `SELECT id, table_name, operation, entity_id, payload, created_at, retry_count, status
       FROM _sync_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC`
    );

    return rows;
  }

  /**
   * Removes a completed entry from the queue.
   * Completed entries do not need to be kept.
   *
   * @param id - The queue entry ID to mark as completed
   */
  async markCompleted(id: string): Promise<void> {
    await this.db.runAsync(
      `DELETE FROM _sync_queue WHERE id = ?`,
      id
    );
  }

  /**
   * Marks a queue entry as failed.
   *
   * @param id - The queue entry ID to mark as failed
   */
  async markFailed(id: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE _sync_queue SET status = 'failed' WHERE id = ?`,
      id
    );
  }

  /**
   * Increments the retry count for a queue entry.
   *
   * @param id - The queue entry ID to increment retry count for
   */
  async incrementRetry(id: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE _sync_queue SET retry_count = retry_count + 1 WHERE id = ?`,
      id
    );
  }

  /**
   * Returns all entries regardless of status (useful for debugging/testing).
   */
  async getAllEntries(): Promise<SyncQueueEntry[]> {
    const rows = await this.db.getAllAsync<SyncQueueEntry>(
      `SELECT id, table_name, operation, entity_id, payload, created_at, retry_count, status
       FROM _sync_queue
       ORDER BY created_at ASC`
    );

    return rows;
  }

  /**
   * Gets a single entry by ID.
   *
   * @param id - The queue entry ID
   */
  async getById(id: string): Promise<SyncQueueEntry | null> {
    const row = await this.db.getFirstAsync<SyncQueueEntry>(
      `SELECT id, table_name, operation, entity_id, payload, created_at, retry_count, status
       FROM _sync_queue
       WHERE id = ?`,
      id
    );

    return row ?? null;
  }

  /**
   * Returns the sync metadata for a given table.
   *
   * @param tableName - The table to get sync metadata for
   */
  async getSyncMeta(tableName: string): Promise<SyncMeta | null> {
    const row = await this.db.getFirstAsync<SyncMeta>(
      `SELECT table_name, last_synced_at FROM _sync_meta WHERE table_name = ?`,
      tableName
    );

    return row ?? null;
  }

  /**
   * Updates the last_synced_at timestamp for a given table.
   *
   * @param tableName - The table to update sync metadata for
   * @param lastSyncedAt - ISO timestamp of the last successful sync
   */
  async updateSyncMeta(tableName: string, lastSyncedAt: string): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO _sync_meta (table_name, last_synced_at) VALUES (?, ?)`,
      tableName,
      lastSyncedAt
    );
  }
}
