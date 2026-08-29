/**
 * PlatoPlan - Sync Manager Module
 *
 * Orchestrates the offline-first sync engine by:
 * - Tracking online/offline network status
 * - Replaying queued mutations with conflict resolution and exponential backoff
 * - Subscribing to Supabase Realtime for remote changes
 * - Exposing observable sync status to the UI layer
 *
 * Uses dependency injection for testability: OfflineQueue, ConflictResolver,
 * and the Supabase client are all injected via the constructor.
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { MutationType, SyncStatus, SyncQueueEntry } from '../models/sync-types';
import type { OfflineQueue } from './offline-queue';
import type { IConflictResolver, ConflictRecord } from './conflict-resolver';

/** Result of a replay cycle. */
export interface SyncResult {
  /** Number of operations successfully synced. */
  succeeded: number;
  /** Number of operations that failed after max retries. */
  failed: number;
  /** Number of conflicts resolved. */
  conflicts: number;
}

/** Callback for sync status changes. */
export type SyncStatusListener = (status: SyncStatus) => void;

/** Callback for remote data changes received via Realtime. */
export type RemoteChangeListener = (
  table: string,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  record: Record<string, unknown>
) => void;

/** Unsubscribe function returned by listener registration. */
export type Unsubscribe = () => void;

/** Configuration for exponential backoff. */
export interface BackoffConfig {
  /** Base delay in milliseconds (default: 1000). */
  baseDelayMs: number;
  /** Maximum number of retry attempts (default: 3). */
  maxRetries: number;
}

/** Dependencies injected into SyncManager. */
export interface SyncManagerDependencies {
  offlineQueue: OfflineQueue;
  conflictResolver: IConflictResolver;
  supabaseClient: SupabaseClient;
  /** Tables to subscribe to for Realtime changes. */
  tables: string[];
  /** Optional backoff config (defaults: 1000ms base, 3 max retries). */
  backoffConfig?: BackoffConfig;
  /** Optional custom delay function (for testing — allows mocking setTimeout). */
  delayFn?: (ms: number) => Promise<void>;
}

/** Interface for the SyncManager as defined in the design. */
export interface ISyncManager {
  isOnline: boolean;
  syncStatus: SyncStatus;
  enqueue(operation: MutationType, table: string, entityId: string, payload: unknown): Promise<void>;
  replay(): Promise<SyncResult>;
  subscribe(): Unsubscribe;
  onStatusChange(listener: SyncStatusListener): Unsubscribe;
  onRemoteChange(listener: RemoteChangeListener): Unsubscribe;
  setOnline(online: boolean): void;
  destroy(): void;
}

/**
 * Default delay function using setTimeout wrapped in a Promise.
 */
function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates the backoff delay for a given retry attempt.
 * Uses exponential backoff: baseDelay * 2^attempt (0-indexed).
 * Attempt 0 → 1s, Attempt 1 → 2s, Attempt 2 → 4s.
 */
export function calculateBackoff(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * Math.pow(2, attempt);
}

/**
 * SyncManager orchestrates the offline-first synchronization engine.
 *
 * It coordinates between:
 * - OfflineQueue (local mutation storage)
 * - ConflictResolver (last-write-wins strategy)
 * - Supabase (remote data and Realtime subscriptions)
 */
export class SyncManager implements ISyncManager {
  private _isOnline: boolean = true;
  private _syncStatus: SyncStatus = 'synced';
  private _statusListeners: Set<SyncStatusListener> = new Set();
  private _remoteChangeListeners: Set<RemoteChangeListener> = new Set();
  private _realtimeChannel: RealtimeChannel | null = null;

  private readonly offlineQueue: OfflineQueue;
  private readonly conflictResolver: IConflictResolver;
  private readonly supabaseClient: SupabaseClient;
  private readonly tables: string[];
  private readonly backoffConfig: BackoffConfig;
  private readonly delayFn: (ms: number) => Promise<void>;

  constructor(deps: SyncManagerDependencies) {
    this.offlineQueue = deps.offlineQueue;
    this.conflictResolver = deps.conflictResolver;
    this.supabaseClient = deps.supabaseClient;
    this.tables = deps.tables;
    this.backoffConfig = deps.backoffConfig ?? { baseDelayMs: 1000, maxRetries: 3 };
    this.delayFn = deps.delayFn ?? defaultDelay;
  }

  // --- Public getters ---

  get isOnline(): boolean {
    return this._isOnline;
  }

  get syncStatus(): SyncStatus {
    return this._syncStatus;
  }

  // --- Network status management ---

  /**
   * Sets the online/offline status.
   * When going online, triggers a replay of queued mutations.
   * When going offline, sets sync status to 'offline'.
   */
  setOnline(online: boolean): void {
    const wasOffline = !this._isOnline;
    this._isOnline = online;

    if (online && wasOffline) {
      this.updateStatus('syncing');
      // Trigger replay when coming back online (fire and forget)
      this.replay().catch(() => {
        // Errors are handled inside replay, this is a safety net
      });
    } else if (!online) {
      this.updateStatus('offline');
    }
  }

  // --- Enqueue operations ---

  /**
   * Enqueues a mutation operation for later sync.
   * If online, this still queues for immediate replay in the next cycle.
   */
  async enqueue(
    operation: MutationType,
    table: string,
    entityId: string,
    payload: unknown
  ): Promise<void> {
    await this.offlineQueue.enqueue(operation, table, entityId, payload);
  }

  // --- Replay ---

  /**
   * Processes all pending queue entries in chronological order.
   * For each entry:
   *   1. Attempts the remote operation on Supabase
   *   2. On conflict → resolves via ConflictResolver
   *   3. On transient failure → retries with exponential backoff
   *   4. After max retries → marks as failed
   *
   * @returns SyncResult with counts of succeeded, failed, and conflicts
   */
  async replay(): Promise<SyncResult> {
    if (!this._isOnline) {
      this.updateStatus('offline');
      return { succeeded: 0, failed: 0, conflicts: 0 };
    }

    this.updateStatus('syncing');

    const entries = await this.offlineQueue.dequeue();
    const result: SyncResult = { succeeded: 0, failed: 0, conflicts: 0 };

    for (const entry of entries) {
      const entryResult = await this.processEntry(entry);

      if (entryResult === 'succeeded') {
        result.succeeded++;
      } else if (entryResult === 'failed') {
        result.failed++;
      } else if (entryResult === 'conflict_resolved') {
        result.conflicts++;
        result.succeeded++;
      }

      // If we lose connectivity mid-replay, stop processing
      if (!this._isOnline) {
        this.updateStatus('offline');
        return result;
      }
    }

    // Determine final status
    if (result.failed > 0) {
      this.updateStatus('error');
    } else {
      this.updateStatus('synced');
    }

    return result;
  }

  // --- Supabase Realtime subscription ---

  /**
   * Sets up Supabase Realtime channel subscriptions for all configured tables.
   * Incoming remote changes are broadcast to registered listeners.
   *
   * @returns Unsubscribe function to tear down the subscription
   */
  subscribe(): Unsubscribe {
    const channel = this.supabaseClient.channel('sync-manager-realtime');

    for (const table of this.tables) {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        (payload: any) => {
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          const record = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
          this.notifyRemoteChange(table, eventType, record);
        }
      );
    }

    channel.subscribe();
    this._realtimeChannel = channel;

    return () => {
      this.supabaseClient.removeChannel(channel);
      this._realtimeChannel = null;
    };
  }

  // --- Status listener management ---

  /**
   * Registers a listener for sync status changes.
   * @returns Unsubscribe function
   */
  onStatusChange(listener: SyncStatusListener): Unsubscribe {
    this._statusListeners.add(listener);
    return () => {
      this._statusListeners.delete(listener);
    };
  }

  /**
   * Registers a listener for remote data changes.
   * @returns Unsubscribe function
   */
  onRemoteChange(listener: RemoteChangeListener): Unsubscribe {
    this._remoteChangeListeners.add(listener);
    return () => {
      this._remoteChangeListeners.delete(listener);
    };
  }

  // --- Cleanup ---

  /**
   * Tears down all subscriptions and cleans up resources.
   */
  destroy(): void {
    if (this._realtimeChannel) {
      this.supabaseClient.removeChannel(this._realtimeChannel);
      this._realtimeChannel = null;
    }
    this._statusListeners.clear();
    this._remoteChangeListeners.clear();
  }

  // --- Private helpers ---

  /**
   * Processes a single queue entry: attempt remote operation, handle
   * conflicts and retries with exponential backoff.
   */
  private async processEntry(
    entry: SyncQueueEntry
  ): Promise<'succeeded' | 'failed' | 'conflict_resolved'> {
    const maxRetries = this.backoffConfig.maxRetries;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const conflictOccurred = await this.executeRemoteOperation(entry);

        if (conflictOccurred) {
          await this.offlineQueue.markCompleted(entry.id);
          return 'conflict_resolved';
        }

        await this.offlineQueue.markCompleted(entry.id);
        return 'succeeded';
      } catch (error) {
        await this.offlineQueue.incrementRetry(entry.id);

        // If this is the last attempt, mark as failed
        if (attempt >= maxRetries - 1) {
          await this.offlineQueue.markFailed(entry.id);
          return 'failed';
        }

        // Wait with exponential backoff before retrying
        const delay = calculateBackoff(attempt, this.backoffConfig.baseDelayMs);
        await this.delayFn(delay);

        // Check if we went offline during the backoff
        if (!this._isOnline) {
          return 'failed';
        }
      }
    }

    // Should not reach here, but safety fallback
    await this.offlineQueue.markFailed(entry.id);
    return 'failed';
  }

  /**
   * Executes a remote operation on Supabase based on the queue entry.
   * Returns true if a conflict was resolved, false if no conflict.
   * Throws on transient errors (network, 5xx).
   */
  private async executeRemoteOperation(entry: SyncQueueEntry): Promise<boolean> {
    const payload = JSON.parse(entry.payload);
    const { table_name, operation, entity_id } = entry;

    switch (operation) {
      case 'create': {
        const { error } = await this.supabaseClient
          .from(table_name)
          .insert(payload);

        if (error) {
          // Duplicate key → conflict (already exists remotely)
          if (error.code === '23505') {
            return await this.resolveConflict(table_name, entity_id, payload);
          }
          throw new Error(`Supabase insert error: ${error.message}`);
        }
        return false;
      }

      case 'update': {
        // Check for conflicts: fetch the current remote record
        const { data: remoteRecord, error: fetchError } = await this.supabaseClient
          .from(table_name)
          .select('*')
          .eq('id', entity_id)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          // PGRST116 = no rows found (record was deleted remotely)
          throw new Error(`Supabase fetch error: ${fetchError.message}`);
        }

        if (remoteRecord && remoteRecord.updated_at) {
          // Check if remote was modified after our local mutation
          const localRecord: ConflictRecord = {
            id: entity_id,
            updatedAt: payload.updated_at ?? payload.updatedAt ?? entry.created_at,
            ...payload,
          };
          const remote: ConflictRecord = {
            id: entity_id,
            updatedAt: remoteRecord.updated_at,
            ...remoteRecord,
          };

          const winner = this.conflictResolver.resolve(localRecord, remote);

          if (winner === remote) {
            // Remote wins — discard our local change
            return true;
          }
        }

        // Local wins (or no conflict) — apply update
        const { error: updateError } = await this.supabaseClient
          .from(table_name)
          .update(payload)
          .eq('id', entity_id);

        if (updateError) {
          throw new Error(`Supabase update error: ${updateError.message}`);
        }
        return false;
      }

      case 'delete': {
        const { error } = await this.supabaseClient
          .from(table_name)
          .delete()
          .eq('id', entity_id);

        if (error) {
          // If record doesn't exist (already deleted), treat as success
          if (error.code === 'PGRST116') {
            return false;
          }
          throw new Error(`Supabase delete error: ${error.message}`);
        }
        return false;
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Resolves a conflict for a create operation where the record already exists remotely.
   * Fetches the remote version and uses ConflictResolver to determine the winner.
   */
  private async resolveConflict(
    table: string,
    entityId: string,
    localPayload: Record<string, unknown>
  ): Promise<boolean> {
    const { data: remoteRecord } = await this.supabaseClient
      .from(table)
      .select('*')
      .eq('id', entityId)
      .single();

    if (!remoteRecord) {
      // Remote record disappeared — our create should succeed on retry
      return false;
    }

    const localRecord: ConflictRecord = {
      id: entityId,
      updatedAt: (localPayload.updated_at ?? localPayload.updatedAt ?? new Date().toISOString()) as string,
      ...localPayload,
    };
    const remote: ConflictRecord = {
      id: entityId,
      updatedAt: remoteRecord.updated_at ?? remoteRecord.updatedAt ?? '',
      ...remoteRecord,
    };

    const winner = this.conflictResolver.resolve(localRecord, remote);

    if (winner === localRecord) {
      // Local wins — update the remote record with local data
      await this.supabaseClient
        .from(table)
        .update(localPayload)
        .eq('id', entityId);
    }
    // Either way, conflict is resolved
    return true;
  }

  /**
   * Updates the internal sync status and notifies all listeners.
   */
  private updateStatus(status: SyncStatus): void {
    if (this._syncStatus === status) return;

    this._syncStatus = status;
    for (const listener of this._statusListeners) {
      listener(status);
    }
  }

  /**
   * Notifies all remote change listeners of an incoming change.
   */
  private notifyRemoteChange(
    table: string,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    record: Record<string, unknown>
  ): void {
    for (const listener of this._remoteChangeListeners) {
      listener(table, eventType, record);
    }
  }
}
