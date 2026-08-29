/**
 * Unit tests for SyncedRepository
 *
 * Validates that the SyncedRepository orchestrator:
 * - Always reads from the local repository (offline-first)
 * - Writes to both local and remote when online
 * - Queues writes in the offline queue when disconnected
 * - Handles remote write failures gracefully by queueing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncedRepository } from '../synced-repository';
import type { IRepository } from '../interfaces';
import type { ISyncManager } from '../../sync/sync-manager';

// ─── Test types ─────────────────────────────────────────────────────────────

interface TestEntity {
  id: string;
  name: string;
  updatedAt: string;
}

interface TestCreateInput {
  name: string;
}

interface TestUpdateInput {
  name?: string;
}

// ─── Mock factories ─────────────────────────────────────────────────────────

function createMockRepository(): IRepository<TestEntity, TestCreateInput, TestUpdateInput> & {
  getAll: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
} {
  return {
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'new-1', name: 'Test', updatedAt: '2024-01-01T00:00:00.000Z' }),
    update: vi.fn().mockResolvedValue({ id: 'existing-1', name: 'Updated', updatedAt: '2024-01-02T00:00:00.000Z' }),
    delete: vi.fn().mockResolvedValue(true),
    search: vi.fn().mockResolvedValue([]),
  };
}

function createMockSyncManager(isOnline: boolean = true): ISyncManager & {
  enqueue: ReturnType<typeof vi.fn>;
  replay: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  onStatusChange: ReturnType<typeof vi.fn>;
  onRemoteChange: ReturnType<typeof vi.fn>;
  setOnline: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    isOnline,
    syncStatus: isOnline ? 'synced' : 'offline',
    enqueue: vi.fn().mockResolvedValue(undefined),
    replay: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0, conflicts: 0 }),
    subscribe: vi.fn().mockReturnValue(() => {}),
    onStatusChange: vi.fn().mockReturnValue(() => {}),
    onRemoteChange: vi.fn().mockReturnValue(() => {}),
    setOnline: vi.fn(),
    destroy: vi.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SyncedRepository', () => {
  let localRepo: ReturnType<typeof createMockRepository>;
  let remoteRepo: ReturnType<typeof createMockRepository>;
  let syncManager: ReturnType<typeof createMockSyncManager>;
  let syncedRepo: SyncedRepository<TestEntity, TestCreateInput, TestUpdateInput>;

  beforeEach(() => {
    localRepo = createMockRepository();
    remoteRepo = createMockRepository();
    syncManager = createMockSyncManager(true);
    syncedRepo = new SyncedRepository(localRepo, remoteRepo, syncManager, 'test_entities');
  });

  // ─── Read operations ────────────────────────────────────────────────────

  describe('getAll', () => {
    it('always reads from local repository', async () => {
      const entities: TestEntity[] = [
        { id: '1', name: 'Entity A', updatedAt: '2024-01-01T00:00:00.000Z' },
        { id: '2', name: 'Entity B', updatedAt: '2024-01-02T00:00:00.000Z' },
      ];
      localRepo.getAll.mockResolvedValue(entities);

      const result = await syncedRepo.getAll();

      expect(result).toEqual(entities);
      expect(localRepo.getAll).toHaveBeenCalledOnce();
      expect(remoteRepo.getAll).not.toHaveBeenCalled();
    });

    it('reads from local even when offline', async () => {
      syncManager = createMockSyncManager(false);
      syncedRepo = new SyncedRepository(localRepo, remoteRepo, syncManager, 'test_entities');
      const entities: TestEntity[] = [{ id: '1', name: 'Cached', updatedAt: '2024-01-01T00:00:00.000Z' }];
      localRepo.getAll.mockResolvedValue(entities);

      const result = await syncedRepo.getAll();

      expect(result).toEqual(entities);
      expect(localRepo.getAll).toHaveBeenCalledOnce();
    });
  });

  describe('getById', () => {
    it('always reads from local repository', async () => {
      const entity: TestEntity = { id: '1', name: 'Found', updatedAt: '2024-01-01T00:00:00.000Z' };
      localRepo.getById.mockResolvedValue(entity);

      const result = await syncedRepo.getById('1');

      expect(result).toEqual(entity);
      expect(localRepo.getById).toHaveBeenCalledWith('1');
      expect(remoteRepo.getById).not.toHaveBeenCalled();
    });

    it('returns null from local when entity not found', async () => {
      localRepo.getById.mockResolvedValue(null);

      const result = await syncedRepo.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    it('delegates to local repository search', async () => {
      const results: TestEntity[] = [{ id: '1', name: 'Match', updatedAt: '2024-01-01T00:00:00.000Z' }];
      localRepo.search.mockResolvedValue(results);

      const result = await syncedRepo.search('Mat');

      expect(result).toEqual(results);
      expect(localRepo.search).toHaveBeenCalledWith('Mat');
      expect(remoteRepo.search).not.toHaveBeenCalled();
    });
  });

  // ─── Write operations (online) ─────────────────────────────────────────

  describe('create (online)', () => {
    it('writes to local first, then remote', async () => {
      const input: TestCreateInput = { name: 'New Entity' };
      const created: TestEntity = { id: 'new-1', name: 'New Entity', updatedAt: '2024-01-01T00:00:00.000Z' };
      localRepo.create.mockResolvedValue(created);

      const result = await syncedRepo.create(input);

      expect(result).toEqual(created);
      expect(localRepo.create).toHaveBeenCalledWith(input);
      expect(remoteRepo.create).toHaveBeenCalledWith(input);
      expect(syncManager.enqueue).not.toHaveBeenCalled();
    });

    it('queues when remote write fails', async () => {
      const input: TestCreateInput = { name: 'New Entity' };
      const created: TestEntity = { id: 'new-1', name: 'New Entity', updatedAt: '2024-01-01T00:00:00.000Z' };
      localRepo.create.mockResolvedValue(created);
      remoteRepo.create.mockRejectedValue(new Error('Network error'));

      const result = await syncedRepo.create(input);

      expect(result).toEqual(created);
      expect(localRepo.create).toHaveBeenCalledWith(input);
      expect(syncManager.enqueue).toHaveBeenCalledWith(
        'create',
        'test_entities',
        'new-1',
        created
      );
    });
  });

  describe('update (online)', () => {
    it('writes to local first, then remote', async () => {
      const input: TestUpdateInput = { name: 'Updated Name' };
      const updated: TestEntity = { id: 'existing-1', name: 'Updated Name', updatedAt: '2024-01-02T00:00:00.000Z' };
      localRepo.update.mockResolvedValue(updated);

      const result = await syncedRepo.update('existing-1', input);

      expect(result).toEqual(updated);
      expect(localRepo.update).toHaveBeenCalledWith('existing-1', input);
      expect(remoteRepo.update).toHaveBeenCalledWith('existing-1', input);
      expect(syncManager.enqueue).not.toHaveBeenCalled();
    });

    it('queues when remote update fails', async () => {
      const input: TestUpdateInput = { name: 'Updated Name' };
      const updated: TestEntity = { id: 'existing-1', name: 'Updated Name', updatedAt: '2024-01-02T00:00:00.000Z' };
      localRepo.update.mockResolvedValue(updated);
      remoteRepo.update.mockRejectedValue(new Error('Server error'));

      const result = await syncedRepo.update('existing-1', input);

      expect(result).toEqual(updated);
      expect(syncManager.enqueue).toHaveBeenCalledWith(
        'update',
        'test_entities',
        'existing-1',
        updated
      );
    });
  });

  describe('delete (online)', () => {
    it('deletes from local first, then remote', async () => {
      localRepo.delete.mockResolvedValue(true);

      const result = await syncedRepo.delete('entity-1');

      expect(result).toBe(true);
      expect(localRepo.delete).toHaveBeenCalledWith('entity-1');
      expect(remoteRepo.delete).toHaveBeenCalledWith('entity-1');
      expect(syncManager.enqueue).not.toHaveBeenCalled();
    });

    it('does not write to remote if local delete returns false', async () => {
      localRepo.delete.mockResolvedValue(false);

      const result = await syncedRepo.delete('nonexistent');

      expect(result).toBe(false);
      expect(remoteRepo.delete).not.toHaveBeenCalled();
      expect(syncManager.enqueue).not.toHaveBeenCalled();
    });

    it('queues when remote delete fails', async () => {
      localRepo.delete.mockResolvedValue(true);
      remoteRepo.delete.mockRejectedValue(new Error('Network error'));

      const result = await syncedRepo.delete('entity-1');

      expect(result).toBe(true);
      expect(syncManager.enqueue).toHaveBeenCalledWith(
        'delete',
        'test_entities',
        'entity-1',
        { id: 'entity-1' }
      );
    });
  });

  // ─── Write operations (offline) ────────────────────────────────────────

  describe('create (offline)', () => {
    beforeEach(() => {
      syncManager = createMockSyncManager(false);
      syncedRepo = new SyncedRepository(localRepo, remoteRepo, syncManager, 'test_entities');
    });

    it('writes to local and enqueues for later sync', async () => {
      const input: TestCreateInput = { name: 'Offline Entity' };
      const created: TestEntity = { id: 'new-1', name: 'Offline Entity', updatedAt: '2024-01-01T00:00:00.000Z' };
      localRepo.create.mockResolvedValue(created);

      const result = await syncedRepo.create(input);

      expect(result).toEqual(created);
      expect(localRepo.create).toHaveBeenCalledWith(input);
      expect(remoteRepo.create).not.toHaveBeenCalled();
      expect(syncManager.enqueue).toHaveBeenCalledWith(
        'create',
        'test_entities',
        'new-1',
        created
      );
    });
  });

  describe('update (offline)', () => {
    beforeEach(() => {
      syncManager = createMockSyncManager(false);
      syncedRepo = new SyncedRepository(localRepo, remoteRepo, syncManager, 'test_entities');
    });

    it('writes to local and enqueues for later sync', async () => {
      const input: TestUpdateInput = { name: 'Offline Update' };
      const updated: TestEntity = { id: 'existing-1', name: 'Offline Update', updatedAt: '2024-01-02T00:00:00.000Z' };
      localRepo.update.mockResolvedValue(updated);

      const result = await syncedRepo.update('existing-1', input);

      expect(result).toEqual(updated);
      expect(localRepo.update).toHaveBeenCalledWith('existing-1', input);
      expect(remoteRepo.update).not.toHaveBeenCalled();
      expect(syncManager.enqueue).toHaveBeenCalledWith(
        'update',
        'test_entities',
        'existing-1',
        updated
      );
    });
  });

  describe('delete (offline)', () => {
    beforeEach(() => {
      syncManager = createMockSyncManager(false);
      syncedRepo = new SyncedRepository(localRepo, remoteRepo, syncManager, 'test_entities');
    });

    it('deletes locally and enqueues for later sync', async () => {
      localRepo.delete.mockResolvedValue(true);

      const result = await syncedRepo.delete('entity-1');

      expect(result).toBe(true);
      expect(localRepo.delete).toHaveBeenCalledWith('entity-1');
      expect(remoteRepo.delete).not.toHaveBeenCalled();
      expect(syncManager.enqueue).toHaveBeenCalledWith(
        'delete',
        'test_entities',
        'entity-1',
        { id: 'entity-1' }
      );
    });
  });
});
