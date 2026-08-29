/**
 * PlatoPlan - Sync-related type definitions
 *
 * Types used by the offline queue, sync engine, and conflict resolution system.
 */

/** The type of mutation stored in the offline queue. */
export type MutationType = 'create' | 'update' | 'delete';

/** Overall sync status exposed to the UI. */
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

/** A single entry in the local offline sync queue. */
export interface SyncQueueEntry {
  /** Unique ID for this queue entry. */
  id: string;
  /** The database table this operation targets. */
  table_name: string;
  /** The type of mutation (create, update, delete). */
  operation: MutationType;
  /** The ID of the entity being mutated. */
  entity_id: string;
  /** JSON-serialized payload of the mutation data. */
  payload: string;
  /** ISO timestamp of when the operation was enqueued. */
  created_at: string;
  /** Number of times replay has been attempted for this entry. */
  retry_count: number;
  /** Current processing status of this queue entry. */
  status: 'pending' | 'in_progress' | 'failed';
}

/** Metadata tracking the last sync time per table. */
export interface SyncMeta {
  /** The database table name. */
  table_name: string;
  /** ISO timestamp of last successful sync, or null if never synced. */
  last_synced_at: string | null;
}
