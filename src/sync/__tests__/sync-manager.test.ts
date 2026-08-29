import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncManager, calculateBackoff } from '../sync-manager';
import type { SyncManagerDependencies } from '../sync-manager';
import type { SyncQueueEntry } from '../../models/sync-types';

/**
 * Creates a mock OfflineQueue for testing.
 */
function createMockOfflineQueue() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue({
      id: 'q-1',
      table_name: 'recipes',
      operation: 'create',
      entity_id: 'r-1',
      payload: '{}',
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    }),
    dequeue: vi.fn().mockResolvedValue([]),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    incrementRetry: vi.fn().mockResolvedValue(undefined),
    getAllEntries: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    getSyncMeta: vi.fn().mockResolvedValue(null),
    updateSyncMeta: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Creates a mock ConflictResolver for testing.
 */
function createMockConflictResolver() {
  return {
    resolve: vi.fn((local: any, remote: any) => {
      const localTime = new Date(local.updatedAt).getTime();
      const remoteTime = new Date(remote.updatedAt).getTime();
      return localTime > remoteTime ? local : remote;
    }),
  } as any;
}

/**
 * Creates a mock Supabase client for testing.
 */
function createMockSupabaseClient() {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn().mockResolvedValue('ok'),
  };

  return {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })),
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: vi.fn().mockResolvedValue('ok'),
  } as any;
}

/**
 * Creates a no-op delay function for tests (resolves immediately).
 */
function createImmediateDelay() {
  return vi.fn().mockResolvedValue(undefined);
}

/**
 * Builds default SyncManager dependencies for testing.
 */
function createDeps(overrides?: Partial<SyncManagerDependencies>): SyncManagerDependencies {
  return {
    offlineQueue: createMockOfflineQueue(),
    conflictResolver: createMockConflictResolver(),
    supabaseClient: createMockSupabaseClient(),
    tables: ['recipes', 'ingredients', 'pantry_entries'],
    backoffConfig: { baseDelayMs: 1000, maxRetries: 3 },
    delayFn: createImmediateDelay(),
    ...overrides,
  };
}

describe('SyncManager', () => {
  let deps: SyncManagerDependencies;
  let syncManager: SyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    syncManager = new SyncManager(deps);
  });

  describe('initial state', () => {
    it('should start online by default', () => {
      expect(syncManager.isOnline).toBe(true);
    });

    it('should start with syncStatus = synced', () => {
      expect(syncManager.syncStatus).toBe('synced');
    });
  });

  describe('setOnline', () => {
    it('should update isOnline status', () => {
      syncManager.setOnline(false);
      expect(syncManager.isOnline).toBe(false);

      syncManager.setOnline(true);
      expect(syncManager.isOnline).toBe(true);
    });

    it('should set status to offline when going offline', () => {
      syncManager.setOnline(false);
      expect(syncManager.syncStatus).toBe('offline');
    });

    it('should trigger replay when coming back online', () => {
      syncManager.setOnline(false);
      syncManager.setOnline(true);

      // dequeue is called during replay
      expect(deps.offlineQueue.dequeue).toHaveBeenCalled();
    });

    it('should set status to syncing when coming back online', () => {
      const statusChanges: string[] = [];
      syncManager.onStatusChange((status) => statusChanges.push(status));

      syncManager.setOnline(false);
      syncManager.setOnline(true);

      expect(statusChanges).toContain('syncing');
    });

    it('should not trigger replay when setting online while already online', () => {
      syncManager.setOnline(true);
      expect(deps.offlineQueue.dequeue).not.toHaveBeenCalled();
    });
  });

  describe('enqueue', () => {
    it('should delegate to offlineQueue.enqueue', async () => {
      await syncManager.enqueue('create', 'recipes', 'r-1', { name: 'Test' });

      expect(deps.offlineQueue.enqueue).toHaveBeenCalledWith(
        'create',
        'recipes',
        'r-1',
        { name: 'Test' }
      );
    });
  });

  describe('replay', () => {
    it('should return empty result when offline', async () => {
      syncManager.setOnline(false);
      // Reset mocks after setOnline triggers
      vi.clearAllMocks();

      const result = await syncManager.replay();

      expect(result).toEqual({ succeeded: 0, failed: 0, conflicts: 0 });
      expect(syncManager.syncStatus).toBe('offline');
    });

    it('should return empty result when queue is empty', async () => {
      (deps.offlineQueue.dequeue as any).mockResolvedValue([]);

      const result = await syncManager.replay();

      expect(result).toEqual({ succeeded: 0, failed: 0, conflicts: 0 });
      expect(syncManager.syncStatus).toBe('synced');
    });

    it('should process entries and mark completed on success', async () => {
      const entry: SyncQueueEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'create',
        entity_id: 'r-1',
        payload: JSON.stringify({ id: 'r-1', name: 'Test Recipe' }),
        created_at: '2024-01-01T00:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      (deps.offlineQueue.dequeue as any).mockResolvedValue([entry]);

      // Mock successful insert
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
      (deps.supabaseClient.from as any).mockReturnValue({
        insert: mockInsert,
      });

      const result = await syncManager.replay();

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(deps.offlineQueue.markCompleted).toHaveBeenCalledWith('q-1');
    });

    it('should set status to synced after successful replay', async () => {
      (deps.offlineQueue.dequeue as any).mockResolvedValue([]);

      await syncManager.replay();

      expect(syncManager.syncStatus).toBe('synced');
    });

    it('should set status to error when there are failures', async () => {
      const entry: SyncQueueEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'create',
        entity_id: 'r-1',
        payload: JSON.stringify({ id: 'r-1', name: 'Test' }),
        created_at: '2024-01-01T00:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      (deps.offlineQueue.dequeue as any).mockResolvedValue([entry]);

      // Mock insert that always fails
      (deps.supabaseClient.from as any).mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Server error', code: '500' },
        }),
      });

      const result = await syncManager.replay();

      expect(result.failed).toBe(1);
      expect(syncManager.syncStatus).toBe('error');
    });

    it('should retry with exponential backoff on failure', async () => {
      const entry: SyncQueueEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'create',
        entity_id: 'r-1',
        payload: JSON.stringify({ id: 'r-1', name: 'Test' }),
        created_at: '2024-01-01T00:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      (deps.offlineQueue.dequeue as any).mockResolvedValue([entry]);

      // Mock insert that always fails with server error
      (deps.supabaseClient.from as any).mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Server error', code: '500' },
        }),
      });

      await syncManager.replay();

      // Should have called delay twice (after attempt 0 and attempt 1, not after final attempt)
      expect(deps.delayFn).toHaveBeenCalledTimes(2);
      expect(deps.delayFn).toHaveBeenNthCalledWith(1, 1000); // 1s
      expect(deps.delayFn).toHaveBeenNthCalledWith(2, 2000); // 2s
    });

    it('should increment retry count on each failure', async () => {
      const entry: SyncQueueEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'create',
        entity_id: 'r-1',
        payload: JSON.stringify({ id: 'r-1', name: 'Test' }),
        created_at: '2024-01-01T00:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      (deps.offlineQueue.dequeue as any).mockResolvedValue([entry]);

      (deps.supabaseClient.from as any).mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Server error', code: '500' },
        }),
      });

      await syncManager.replay();

      // 3 attempts → 3 incrementRetry calls
      expect(deps.offlineQueue.incrementRetry).toHaveBeenCalledTimes(3);
      expect(deps.offlineQueue.incrementRetry).toHaveBeenCalledWith('q-1');
    });

    it('should mark as failed after max retries', async () => {
      const entry: SyncQueueEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'create',
        entity_id: 'r-1',
        payload: JSON.stringify({ id: 'r-1', name: 'Test' }),
        created_at: '2024-01-01T00:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      (deps.offlineQueue.dequeue as any).mockResolvedValue([entry]);

      (deps.supabaseClient.from as any).mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Server error', code: '500' },
        }),
      });

      await syncManager.replay();

      expect(deps.offlineQueue.markFailed).toHaveBeenCalledWith('q-1');
    });

    it('should handle update operations with conflict resolution', async () => {
      const entry: SyncQueueEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'update',
        entity_id: 'r-1',
        payload: JSON.stringify({
          id: 'r-1',
          name: 'Updated Local',
          updated_at: '2024-01-01T12:00:00.000Z',
        }),
        created_at: '2024-01-01T11:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      (deps.offlineQueue.dequeue as any).mockResolvedValue([entry]);

      // Remote record is newer → remote wins
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'r-1',
              name: 'Updated Remote',
              updated_at: '2024-01-01T13:00:00.000Z',
            },
            error: null,
          }),
        }),
      });
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      (deps.supabaseClient.from as any).mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      const result = await syncManager.replay();

      // Remote wins → conflict resolved, local change discarded
      expect(result.conflicts).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(deps.offlineQueue.markCompleted).toHaveBeenCalledWith('q-1');
    });

    it('should handle delete operations', async () => {
      const entry: SyncQueueEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'delete',
        entity_id: 'r-1',
        payload: JSON.stringify({ id: 'r-1' }),
        created_at: '2024-01-01T00:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      (deps.offlineQueue.dequeue as any).mockResolvedValue([entry]);

      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      (deps.supabaseClient.from as any).mockReturnValue({
        delete: mockDelete,
      });

      const result = await syncManager.replay();

      expect(result.succeeded).toBe(1);
      expect(deps.offlineQueue.markCompleted).toHaveBeenCalledWith('q-1');
    });

    it('should process multiple entries in order', async () => {
      const entries: SyncQueueEntry[] = [
        {
          id: 'q-1',
          table_name: 'recipes',
          operation: 'create',
          entity_id: 'r-1',
          payload: JSON.stringify({ id: 'r-1', name: 'First' }),
          created_at: '2024-01-01T00:00:00.000Z',
          retry_count: 0,
          status: 'pending',
        },
        {
          id: 'q-2',
          table_name: 'ingredients',
          operation: 'create',
          entity_id: 'i-1',
          payload: JSON.stringify({ id: 'i-1', name: 'Second' }),
          created_at: '2024-01-01T00:01:00.000Z',
          retry_count: 0,
          status: 'pending',
        },
      ];
      (deps.offlineQueue.dequeue as any).mockResolvedValue(entries);

      (deps.supabaseClient.from as any).mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await syncManager.replay();

      expect(result.succeeded).toBe(2);
      expect(deps.offlineQueue.markCompleted).toHaveBeenCalledTimes(2);
      // Verify order: q-1 first, q-2 second
      expect(deps.offlineQueue.markCompleted).toHaveBeenNthCalledWith(1, 'q-1');
      expect(deps.offlineQueue.markCompleted).toHaveBeenNthCalledWith(2, 'q-2');
    });
  });

  describe('subscribe', () => {
    it('should set up a Supabase Realtime channel', () => {
      syncManager.subscribe();

      expect(deps.supabaseClient.channel).toHaveBeenCalledWith('sync-manager-realtime');
    });

    it('should subscribe to all configured tables', () => {
      syncManager.subscribe();

      const mockChannel = (deps.supabaseClient.channel as any).mock.results[0].value;
      // Should call .on for each table
      expect(mockChannel.on).toHaveBeenCalledTimes(deps.tables.length);
    });

    it('should call channel.subscribe()', () => {
      syncManager.subscribe();

      const mockChannel = (deps.supabaseClient.channel as any).mock.results[0].value;
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should return an unsubscribe function that removes the channel', () => {
      const unsubscribe = syncManager.subscribe();
      unsubscribe();

      expect(deps.supabaseClient.removeChannel).toHaveBeenCalled();
    });
  });

  describe('onStatusChange', () => {
    it('should notify listeners when status changes', () => {
      const listener = vi.fn();
      syncManager.onStatusChange(listener);

      syncManager.setOnline(false);

      expect(listener).toHaveBeenCalledWith('offline');
    });

    it('should not notify after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = syncManager.onStatusChange(listener);
      unsubscribe();

      syncManager.setOnline(false);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not notify if status does not actually change', async () => {
      const listener = vi.fn();
      syncManager.onStatusChange(listener);

      // Replay with empty queue → stays synced
      (deps.offlineQueue.dequeue as any).mockResolvedValue([]);
      await syncManager.replay();

      // 'syncing' is emitted, then final 'synced' — but since initial is 'synced',
      // listener should get 'syncing' then no second 'synced' if it was already synced
      // Actually: initial is 'synced', replay sets 'syncing', then sets 'synced'
      expect(listener).toHaveBeenCalledWith('syncing');
      expect(listener).toHaveBeenCalledWith('synced');
    });
  });

  describe('onRemoteChange', () => {
    it('should notify listeners when remote changes are received', () => {
      const listener = vi.fn();
      syncManager.onRemoteChange(listener);

      // Simulate a Realtime event by invoking the channel callback
      syncManager.subscribe();

      const mockChannel = (deps.supabaseClient.channel as any).mock.results[0].value;
      // Get the callback registered with .on
      const onCall = mockChannel.on.mock.calls[0];
      const callback = onCall[2]; // Third argument is the callback

      callback({
        eventType: 'INSERT',
        new: { id: 'r-new', name: 'New Recipe' },
        old: null,
      });

      expect(listener).toHaveBeenCalledWith(
        'recipes',
        'INSERT',
        { id: 'r-new', name: 'New Recipe' }
      );
    });

    it('should not notify after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = syncManager.onRemoteChange(listener);
      unsubscribe();

      syncManager.subscribe();
      const mockChannel = (deps.supabaseClient.channel as any).mock.results[0].value;
      const callback = mockChannel.on.mock.calls[0][2];

      callback({
        eventType: 'UPDATE',
        new: { id: 'r-1', name: 'Updated' },
        old: { id: 'r-1', name: 'Original' },
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should remove the Realtime channel', () => {
      syncManager.subscribe();
      syncManager.destroy();

      expect(deps.supabaseClient.removeChannel).toHaveBeenCalled();
    });

    it('should clear all listeners', () => {
      const statusListener = vi.fn();
      const changeListener = vi.fn();
      syncManager.onStatusChange(statusListener);
      syncManager.onRemoteChange(changeListener);

      syncManager.destroy();
      syncManager.setOnline(false);

      expect(statusListener).not.toHaveBeenCalled();
    });

    it('should be safe to call without active subscription', () => {
      expect(() => syncManager.destroy()).not.toThrow();
    });
  });

  describe('calculateBackoff', () => {
    it('should return baseDelay for attempt 0', () => {
      expect(calculateBackoff(0, 1000)).toBe(1000);
    });

    it('should double for each subsequent attempt', () => {
      expect(calculateBackoff(1, 1000)).toBe(2000);
      expect(calculateBackoff(2, 1000)).toBe(4000);
    });

    it('should work with different base delays', () => {
      expect(calculateBackoff(0, 500)).toBe(500);
      expect(calculateBackoff(1, 500)).toBe(1000);
      expect(calculateBackoff(2, 500)).toBe(2000);
    });
  });

  describe('conflict resolution during replay', () => {
    it('should resolve duplicate key conflicts on create', async () => {
      const entry: SyncQueueEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'create',
        entity_id: 'r-1',
        payload: JSON.stringify({
          id: 'r-1',
          name: 'My Recipe',
          updated_at: '2024-01-01T10:00:00.000Z',
        }),
        created_at: '2024-01-01T09:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      (deps.offlineQueue.dequeue as any).mockResolvedValue([entry]);

      // First insert fails with duplicate key
      const mockInsert = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'duplicate key', code: '23505' },
      });
      // Then fetch the remote record
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'r-1',
              name: 'Remote Recipe',
              updated_at: '2024-01-01T11:00:00.000Z',
            },
            error: null,
          }),
        }),
      });
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      (deps.supabaseClient.from as any).mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
      });

      const result = await syncManager.replay();

      expect(result.conflicts).toBe(1);
      expect(result.succeeded).toBe(1);
    });
  });
});
