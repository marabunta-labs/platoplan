/**
 * PlatoPlan - Synced Repository Orchestrator
 *
 * Implements the offline-first sync pattern by wrapping a local SQLite repository
 * and a remote Supabase repository. All reads go through the local repository for
 * instant response times regardless of connectivity. Writes are applied locally first,
 * then replicated to Supabase when online or queued for later replay when offline.
 *
 * Requirements: 5.3, 6.1, 6.2
 */

import type { IRepository } from './interfaces';
import type { ISyncManager } from '../sync/sync-manager';
import type { MutationType } from '../models/sync-types';

/**
 * SyncedRepository orchestrates reads and writes between local and remote repositories.
 *
 * - Reads ALWAYS go to the local SQLite repository (offline-first, instant response).
 * - Writes go to both local SQLite AND Supabase when online.
 * - When offline, writes go to local SQLite and are enqueued in the offline queue for later replay.
 *
 * @typeParam T - The domain entity type
 * @typeParam C - The input type for creating a new entity
 * @typeParam U - The input type for updating an existing entity
 */
export class SyncedRepository<T, C, U> implements IRepository<T, C, U> {
  constructor(
    private readonly local: IRepository<T, C, U>,
    private readonly remote: IRepository<T, C, U>,
    private readonly syncManager: ISyncManager,
    private readonly tableName: string
  ) {}

  /**
   * Returns all entities from the local SQLite cache.
   * Always reads locally for instant offline-first performance.
   */
  async getAll(): Promise<T[]> {
    return this.local.getAll();
  }

  /**
   * Returns a single entity by ID from the local SQLite cache.
   * Always reads locally for instant offline-first performance.
   */
  async getById(id: string): Promise<T | null> {
    return this.local.getById(id);
  }

  /**
   * Creates a new entity.
   * 1. Writes to local SQLite first (immediate persistence).
   * 2. If online: writes to Supabase remote.
   * 3. If offline: enqueues the operation for later sync.
   *
   * Returns the locally-created entity immediately.
   */
  async create(input: C): Promise<T> {
    const entity = await this.local.create(input);

    if (this.syncManager.isOnline) {
      try {
        await this.remote.create(input);
      } catch {
        // Remote write failed — enqueue for later retry
        await this.enqueueOperation('create', entity);
      }
    } else {
      await this.enqueueOperation('create', entity);
    }

    return entity;
  }

  /**
   * Updates an existing entity.
   * 1. Writes to local SQLite first (immediate persistence).
   * 2. If online: writes to Supabase remote.
   * 3. If offline: enqueues the operation for later sync.
   *
   * Returns the locally-updated entity immediately.
   */
  async update(id: string, input: U): Promise<T> {
    const entity = await this.local.update(id, input);

    if (this.syncManager.isOnline) {
      try {
        await this.remote.update(id, input);
      } catch {
        // Remote write failed — enqueue for later retry
        await this.enqueueOperation('update', entity, id);
      }
    } else {
      await this.enqueueOperation('update', entity, id);
    }

    return entity;
  }

  /**
   * Deletes an entity.
   * 1. Deletes from local SQLite first (immediate removal).
   * 2. If online: deletes from Supabase remote.
   * 3. If offline: enqueues the operation for later sync.
   *
   * Returns true if the local delete succeeded.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.local.delete(id);

    if (result) {
      if (this.syncManager.isOnline) {
        try {
          await this.remote.delete(id);
        } catch {
          // Remote delete failed — enqueue for later retry
          await this.enqueueOperation('delete', { id } as unknown as T, id);
        }
      } else {
        await this.enqueueOperation('delete', { id } as unknown as T, id);
      }
    }

    return result;
  }

  /**
   * Searches entities by text query using the local SQLite repository.
   * Always reads locally for offline-first performance.
   */
  async search(query: string): Promise<T[]> {
    if (this.local.search) {
      return this.local.search(query);
    }
    // Fallback: filter getAll results (basic substring match on stringified entities)
    const all = await this.local.getAll();
    return all.filter((entity) =>
      JSON.stringify(entity).toLowerCase().includes(query.toLowerCase())
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  /**
   * Enqueues a mutation operation in the offline queue for later sync.
   *
   * @param operation - The mutation type (create, update, delete)
   * @param entity - The entity data to sync
   * @param entityId - Optional explicit entity ID (used for update/delete)
   */
  private async enqueueOperation(
    operation: MutationType,
    entity: T,
    entityId?: string
  ): Promise<void> {
    const id = entityId ?? this.extractEntityId(entity);
    await this.syncManager.enqueue(operation, this.tableName, id, entity);
  }

  /**
   * Extracts the ID from an entity.
   * Assumes entities have an `id` property (which all PlatoPlan entities do).
   */
  private extractEntityId(entity: T): string {
    return (entity as unknown as { id: string }).id;
  }
}
