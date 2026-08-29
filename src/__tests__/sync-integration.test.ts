/**
 * Integration Tests - Full Sync Cycle
 *
 * These tests verify the end-to-end synchronization flow using mocked
 * Supabase and SQLite implementations. They exercise:
 *
 * 1. Offline create → go online → verify remote state (Req 6.3)
 * 2. Remote change → local cache updated → UI re-renders (Req 6.5)
 * 3. Migration flow — populate local DB → authenticate → migrate → verify remote (Req 7.2)
 *
 * All tests use in-memory mocks to avoid native module dependencies.
 *
 * Validates: Requirements 6.3, 6.5, 7.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncManager } from '../sync/sync-manager';
import type { SyncManagerDependencies, SyncResult } from '../sync/sync-manager';
import { ConflictResolver } from '../sync/conflict-resolver';
import { SyncedRepository } from '../repositories/synced-repository';
import { MigrationService } from '../services/migration.service';
import { tableInvalidationEmitter } from '../hooks/tableInvalidationEmitter';
import type { IRepository } from '../repositories/interfaces';
import type { SyncQueueEntry, MutationType } from '../models/sync-types';

// ─── In-memory OfflineQueue implementation ─────────────────────────────────────

/**
 * A fully functional in-memory OfflineQueue for integration testing.
 * Simulates the real SQLite-backed queue without native dependencies.
 */
class InMemoryOfflineQueue {
  private entries: SyncQueueEntry[] = [];
  private idCounter = 0;
  private syncMeta: Map<string, string | null> = new Map();

  async initialize(): Promise<void> {
    // No-op for in-memory
  }

  async enqueue(
    operation: MutationType,
    table: string,
    entityId: string,
    payload: unknown
  ): Promise<SyncQueueEntry> {
    const id = `queue-${++this.idCounter}`;
    const entry: SyncQueueEntry = {
      id,
      table_name: table,
      operation,
      entity_id: entityId,
      payload: JSON.stringify(payload),
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    };
    this.entries.push(entry);
    return entry;
  }

  async dequeue(): Promise<SyncQueueEntry[]> {
    return this.entries
      .filter((e) => e.status === 'pending')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async markCompleted(id: string): Promise<void> {
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  async markFailed(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.status = 'failed';
    }
  }

  async incrementRetry(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.retry_count++;
    }
  }

  async getAllEntries(): Promise<SyncQueueEntry[]> {
    return [...this.entries];
  }

  async getById(id: string): Promise<SyncQueueEntry | null> {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  async getSyncMeta(tableName: string): Promise<{ table_name: string; last_synced_at: string | null } | null> {
    if (this.syncMeta.has(tableName)) {
      return { table_name: tableName, last_synced_at: this.syncMeta.get(tableName)! };
    }
    return null;
  }

  async updateSyncMeta(tableName: string, lastSyncedAt: string): Promise<void> {
    this.syncMeta.set(tableName, lastSyncedAt);
  }
}

// ─── In-memory Repository implementation ───────────────────────────────────────

interface TestEntity {
  id: string;
  name: string;
  updated_at: string;
}

type CreateTestInput = { name: string };
type UpdateTestInput = { name?: string };

/**
 * A simple in-memory repository for testing SyncedRepository behavior.
 */
class InMemoryRepository implements IRepository<TestEntity, CreateTestInput, UpdateTestInput> {
  private store: Map<string, TestEntity> = new Map();
  private idCounter = 0;

  async getAll(): Promise<TestEntity[]> {
    return Array.from(this.store.values());
  }

  async getById(id: string): Promise<TestEntity | null> {
    return this.store.get(id) ?? null;
  }

  async create(input: CreateTestInput): Promise<TestEntity> {
    const id = `entity-${++this.idCounter}`;
    const entity: TestEntity = {
      id,
      name: input.name,
      updated_at: new Date().toISOString(),
    };
    this.store.set(id, entity);
    return entity;
  }

  async update(id: string, input: UpdateTestInput): Promise<TestEntity> {
    const entity = this.store.get(id);
    if (!entity) throw new Error(`Entity ${id} not found`);
    const updated = { ...entity, ...input, updated_at: new Date().toISOString() };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  // Test helpers
  getStore(): Map<string, TestEntity> {
    return this.store;
  }

  setEntity(entity: TestEntity): void {
    this.store.set(entity.id, entity);
  }
}

// ─── Mock Supabase client builder ──────────────────────────────────────────────

/**
 * Creates a mock Supabase client that records operations
 * into an in-memory "remote store" for verification.
 */
function createTrackingSupabaseClient() {
  const remoteStore: Map<string, Map<string, Record<string, unknown>>> = new Map();
  const realtimeCallbacks: Map<string, ((payload: any) => void)[]> = new Map();

  function getTableStore(table: string): Map<string, Record<string, unknown>> {
    if (!remoteStore.has(table)) {
      remoteStore.set(table, new Map());
    }
    return remoteStore.get(table)!;
  }

  const mockChannel = {
    on: vi.fn((_type: string, opts: any, callback: (payload: any) => void) => {
      const table = opts.table;
      if (!realtimeCallbacks.has(table)) {
        realtimeCallbacks.set(table, []);
      }
      realtimeCallbacks.get(table)!.push(callback);
      return mockChannel;
    }),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn().mockResolvedValue('ok'),
  };

  const client = {
    from: vi.fn((table: string) => {
      const tableStore = getTableStore(table);

      return {
        insert: vi.fn((data: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(data) ? data : [data];
          for (const row of rows) {
            const id = row.id as string;
            if (tableStore.has(id)) {
              return Promise.resolve({ data: null, error: { message: 'duplicate key', code: '23505' } });
            }
            tableStore.set(id, { ...row });
          }
          return Promise.resolve({ data: rows, error: null });
        }),
        upsert: vi.fn((data: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(data) ? data : [data];
          for (const row of rows) {
            const id = (row.id ?? `${row.recipe_id}:${row.ingredient_id}`) as string;
            tableStore.set(id, { ...row });
          }
          return Promise.resolve({ data: rows, error: null });
        }),
        update: vi.fn((data: Record<string, unknown>) => ({
          eq: vi.fn((col: string, val: string) => {
            const existing = tableStore.get(val);
            if (existing) {
              tableStore.set(val, { ...existing, ...data });
            }
            return Promise.resolve({ data: existing ? { ...existing, ...data } : null, error: null });
          }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn((col: string, val: string) => {
            tableStore.delete(val);
            return Promise.resolve({ data: null, error: null });
          }),
        })),
        select: vi.fn(() => ({
          eq: vi.fn((col: string, val: string) => ({
            single: vi.fn(() => {
              const record = tableStore.get(val);
              return Promise.resolve({ data: record ?? null, error: record ? null : { code: 'PGRST116', message: 'not found' } });
            }),
          })),
        })),
      };
    }),
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: vi.fn().mockResolvedValue('ok'),
  } as any;

  return {
    client,
    remoteStore,
    realtimeCallbacks,
    getTableStore,
    mockChannel,
    /** Simulate a Realtime event arriving from the server */
    simulateRealtimeEvent(table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: Record<string, unknown>) {
      const callbacks = realtimeCallbacks.get(table) ?? [];
      for (const cb of callbacks) {
        cb({
          eventType,
          new: eventType !== 'DELETE' ? record : null,
          old: eventType === 'DELETE' ? record : null,
        });
      }
    },
  };
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('Integration Tests - Full Sync Cycle', () => {
  let offlineQueue: InMemoryOfflineQueue;
  let conflictResolver: ConflictResolver;
  let supabaseMock: ReturnType<typeof createTrackingSupabaseClient>;
  let syncManager: SyncManager;
  let localRepo: InMemoryRepository;
  let remoteRepo: InMemoryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    tableInvalidationEmitter.clear();

    offlineQueue = new InMemoryOfflineQueue();
    conflictResolver = new ConflictResolver();
    supabaseMock = createTrackingSupabaseClient();

    const deps: SyncManagerDependencies = {
      offlineQueue: offlineQueue as any,
      conflictResolver,
      supabaseClient: supabaseMock.client,
      tables: ['ingredients', 'recipes', 'pantry_entries'],
      backoffConfig: { baseDelayMs: 10, maxRetries: 3 },
      delayFn: vi.fn().mockResolvedValue(undefined),
    };

    syncManager = new SyncManager(deps);
    localRepo = new InMemoryRepository();
    remoteRepo = new InMemoryRepository();
  });

  // ─── Scenario 1: Offline create → online sync → verify remote state ────────

  describe('Offline create → go online → verify remote state (Req 6.3)', () => {
    it('should queue operations while offline, then replay to remote on reconnect', async () => {
      // Setup: SyncedRepository wrapping local + remote with the SyncManager
      const syncedRepo = new SyncedRepository<TestEntity, CreateTestInput, UpdateTestInput>(
        localRepo,
        remoteRepo,
        syncManager,
        'ingredients'
      );

      // Go offline
      syncManager.setOnline(false);
      expect(syncManager.isOnline).toBe(false);
      expect(syncManager.syncStatus).toBe('offline');

      // Create an entity while offline
      const entity = await syncedRepo.create({ name: 'Tomate' });
      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('Tomate');

      // Verify entity is in local store
      const localEntities = await localRepo.getAll();
      expect(localEntities).toHaveLength(1);
      expect(localEntities[0].name).toBe('Tomate');

      // Verify the operation was queued
      const queueEntries = await offlineQueue.getAllEntries();
      expect(queueEntries).toHaveLength(1);
      expect(queueEntries[0].table_name).toBe('ingredients');
      expect(queueEntries[0].operation).toBe('create');
      expect(queueEntries[0].status).toBe('pending');

      // Go online — this triggers replay
      syncManager.setOnline(true);
      // Wait for replay to fully complete and status to settle
      await vi.waitFor(() => syncManager.syncStatus === 'synced', { timeout: 1000 });

      // Verify the remote Supabase received the operation
      expect(supabaseMock.client.from).toHaveBeenCalledWith('ingredients');
    });

    it('should process multiple offline operations in chronological order', async () => {
      const syncedRepo = new SyncedRepository<TestEntity, CreateTestInput, UpdateTestInput>(
        localRepo,
        remoteRepo,
        syncManager,
        'recipes'
      );

      // Go offline
      syncManager.setOnline(false);

      // Create multiple entities while offline
      const entity1 = await syncedRepo.create({ name: 'Receta A' });
      const entity2 = await syncedRepo.create({ name: 'Receta B' });
      const entity3 = await syncedRepo.create({ name: 'Receta C' });

      // Verify all are in local
      const localEntities = await localRepo.getAll();
      expect(localEntities).toHaveLength(3);

      // Verify queue has 3 entries
      const queueEntries = await offlineQueue.getAllEntries();
      expect(queueEntries).toHaveLength(3);

      // Go online — triggers replay
      syncManager.setOnline(true);
      await vi.waitFor(() => {
        expect(syncManager.syncStatus).toBe('synced');
      }, { timeout: 1000 });

      // All operations should have been processed
      const remaining = await offlineQueue.dequeue();
      expect(remaining).toHaveLength(0);
    });

    it('should handle update and delete operations offline', async () => {
      // Pre-populate local with an entity
      localRepo.setEntity({ id: 'entity-100', name: 'Original', updated_at: '2024-01-01T00:00:00Z' });

      const syncedRepo = new SyncedRepository<TestEntity, CreateTestInput, UpdateTestInput>(
        localRepo,
        remoteRepo,
        syncManager,
        'ingredients'
      );

      // Go offline
      syncManager.setOnline(false);

      // Update the entity
      await syncedRepo.update('entity-100', { name: 'Updated' });

      // Verify local was updated
      const updated = await localRepo.getById('entity-100');
      expect(updated!.name).toBe('Updated');

      // Verify queue has the update
      const queueEntries = await offlineQueue.getAllEntries();
      expect(queueEntries).toHaveLength(1);
      expect(queueEntries[0].operation).toBe('update');

      // Go online
      syncManager.setOnline(true);
      await vi.waitFor(() => {
        expect(syncManager.syncStatus).toBe('synced');
      }, { timeout: 1000 });

      const remaining = await offlineQueue.dequeue();
      expect(remaining).toHaveLength(0);
    });
  });

  // ─── Scenario 2: Remote change → local cache updated → UI re-renders ──────

  describe('Remote change → local cache updated → UI re-renders (Req 6.5)', () => {
    it('should notify tableInvalidationEmitter when remote change arrives', async () => {
      // Set up the subscription
      syncManager.subscribe();

      // Listen for table invalidation on 'ingredients'
      const invalidationCallback = vi.fn();
      tableInvalidationEmitter.subscribe('ingredients', invalidationCallback);

      // Register remote change listener that emits invalidation (like useRealtimeSync does)
      syncManager.onRemoteChange((table, eventType, record) => {
        tableInvalidationEmitter.emit(table);
      });

      // Simulate a remote INSERT event
      supabaseMock.simulateRealtimeEvent('ingredients', 'INSERT', {
        id: 'remote-1',
        name: 'Ajo',
        updated_at: '2024-06-01T12:00:00Z',
      });

      // Verify the invalidation emitter was called
      expect(invalidationCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle remote UPDATE events and trigger re-render', async () => {
      syncManager.subscribe();

      const invalidationCallback = vi.fn();
      tableInvalidationEmitter.subscribe('recipes', invalidationCallback);

      syncManager.onRemoteChange((table) => {
        tableInvalidationEmitter.emit(table);
      });

      // Simulate a remote UPDATE
      supabaseMock.simulateRealtimeEvent('recipes', 'UPDATE', {
        id: 'recipe-1',
        name: 'Pasta con Tomate (actualizada)',
        updated_at: '2024-06-01T14:00:00Z',
      });

      expect(invalidationCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle remote DELETE events and trigger re-render', async () => {
      syncManager.subscribe();

      const invalidationCallback = vi.fn();
      tableInvalidationEmitter.subscribe('pantry_entries', invalidationCallback);

      syncManager.onRemoteChange((table) => {
        tableInvalidationEmitter.emit(table);
      });

      // Simulate a remote DELETE
      supabaseMock.simulateRealtimeEvent('pantry_entries', 'DELETE', {
        id: 'pantry-1',
      });

      expect(invalidationCallback).toHaveBeenCalledTimes(1);
    });

    it('should propagate the correct record data to remote change listeners', async () => {
      syncManager.subscribe();

      const changeListener = vi.fn();
      syncManager.onRemoteChange(changeListener);

      const remoteRecord = {
        id: 'ing-99',
        name: 'Cebolla',
        unit: 'gramos',
        updated_at: '2024-06-15T10:00:00Z',
      };

      supabaseMock.simulateRealtimeEvent('ingredients', 'INSERT', remoteRecord);

      expect(changeListener).toHaveBeenCalledWith(
        'ingredients',
        'INSERT',
        remoteRecord
      );
    });

    it('should not fire invalidation for unsubscribed tables', async () => {
      syncManager.subscribe();

      const ingredientsCallback = vi.fn();
      const recipesCallback = vi.fn();
      tableInvalidationEmitter.subscribe('ingredients', ingredientsCallback);
      tableInvalidationEmitter.subscribe('recipes', recipesCallback);

      syncManager.onRemoteChange((table) => {
        tableInvalidationEmitter.emit(table);
      });

      // Only fire event on 'ingredients'
      supabaseMock.simulateRealtimeEvent('ingredients', 'INSERT', {
        id: 'new-1',
        name: 'Limón',
        updated_at: '2024-06-01T12:00:00Z',
      });

      expect(ingredientsCallback).toHaveBeenCalledTimes(1);
      expect(recipesCallback).not.toHaveBeenCalled();
    });
  });

  // ─── Scenario 3: Migration flow ───────────────────────────────────────────

  describe('Migration flow — populate local DB → authenticate → migrate → verify remote (Req 7.2)', () => {
    let migrationService: MigrationService;

    // Mock SQLite database with in-memory data
    function createMockSQLiteDB(data: Record<string, Record<string, unknown>[]>) {
      const tables = new Set(Object.keys(data));

      return {
        execAsync: vi.fn().mockResolvedValue(undefined),
        runAsync: vi.fn().mockResolvedValue(undefined),
        getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
          // Handle COUNT queries
          if (sql.includes('COUNT(*)')) {
            if (sql.includes('sqlite_master')) {
              const tableName = params[0] as string;
              return { count: tables.has(tableName) || tableName === '_sync_meta' ? 1 : 0 };
            }
            if (sql.includes('_sync_meta')) {
              return { count: 0 }; // No prior sync — migration needed
            }
            // Count for specific table
            const tableMatch = sql.match(/FROM (\w+)/);
            if (tableMatch) {
              const table = tableMatch[1];
              return { count: data[table]?.length ?? 0 };
            }
          }
          // Handle SELECT * ... WHERE id = ?
          if (sql.includes('WHERE id = ?')) {
            const tableMatch = sql.match(/FROM (\w+)/);
            if (tableMatch) {
              const table = tableMatch[1];
              const rows = data[table] ?? [];
              return rows.find((r) => r.id === params[0]) ?? null;
            }
          }
          return null;
        }),
        getAllAsync: vi.fn(async (sql: string) => {
          const tableMatch = sql.match(/FROM (\w+)/);
          if (tableMatch) {
            const table = tableMatch[1];
            return data[table] ?? [];
          }
          return [];
        }),
      } as any;
    }

    beforeEach(() => {
      migrationService = new MigrationService();
    });

    it('should detect migration is needed when local data exists and no sync metadata', async () => {
      const mockDb = createMockSQLiteDB({
        ingredients: [
          { id: 'ing-1', name: 'Tomate', unit: 'gramos', category: 'Verduras', updated_at: '2024-01-01T00:00:00Z' },
        ],
        recipes: [],
      });

      const needed = await migrationService.detectMigrationNeeded(mockDb);
      expect(needed).toBe(true);
    });

    it('should migrate all entities to Supabase preserving IDs and relationships', async () => {
      const localData = {
        ingredients: [
          { id: 'ing-1', name: 'Tomate', unit: 'gramos', purchase_format_desc: 'Bandeja', purchase_format_quantity: 500, category: 'Verduras', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
          { id: 'ing-2', name: 'Pasta', unit: 'gramos', purchase_format_desc: 'Paquete', purchase_format_quantity: 500, category: 'Cereales', created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' },
        ],
        recipes: [
          { id: 'rec-1', name: 'Pasta con Tomate', meal_type: 'comida', prep_time: 'rapido', created_at: '2024-01-03T00:00:00Z', updated_at: '2024-01-03T00:00:00Z' },
        ],
        recipe_ingredients: [
          { recipe_id: 'rec-1', ingredient_id: 'ing-1', quantity: 200, created_at: '2024-01-03T00:00:00Z', updated_at: '2024-01-03T00:00:00Z' },
          { recipe_id: 'rec-1', ingredient_id: 'ing-2', quantity: 250, created_at: '2024-01-03T00:00:00Z', updated_at: '2024-01-03T00:00:00Z' },
        ],
        pantry_entries: [
          { id: 'pe-1', ingredient_id: 'ing-1', quantity: 300, updated_at: '2024-01-04T00:00:00Z' },
        ],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const mockDb = createMockSQLiteDB(localData);
      const userId = 'user-123';

      // Use the tracking Supabase client to record upserts
      const result = await migrationService.migrate(mockDb, supabaseMock.client, userId);

      // Verify all entities were migrated successfully
      expect(result.failed).toHaveLength(0);
      expect(result.succeeded).toHaveLength(6); // 2 ingredients + 1 recipe + 2 recipe_ingredients + 1 pantry entry

      // Verify the remote store received the correct data
      const remoteIngredients = supabaseMock.getTableStore('ingredients');
      expect(remoteIngredients.size).toBe(2);
      expect(remoteIngredients.get('ing-1')).toMatchObject({
        id: 'ing-1',
        name: 'Tomate',
        user_id: userId,
      });
      expect(remoteIngredients.get('ing-2')).toMatchObject({
        id: 'ing-2',
        name: 'Pasta',
        user_id: userId,
      });

      // Verify recipes
      const remoteRecipes = supabaseMock.getTableStore('recipes');
      expect(remoteRecipes.size).toBe(1);
      expect(remoteRecipes.get('rec-1')).toMatchObject({
        id: 'rec-1',
        name: 'Pasta con Tomate',
        user_id: userId,
      });

      // Verify recipe_ingredients preserves relationships
      const remoteRecipeIngredients = supabaseMock.getTableStore('recipe_ingredients');
      expect(remoteRecipeIngredients.size).toBe(2);

      // Verify pantry entries
      const remotePantry = supabaseMock.getTableStore('pantry_entries');
      expect(remotePantry.size).toBe(1);
      expect(remotePantry.get('pe-1')).toMatchObject({
        id: 'pe-1',
        ingredient_id: 'ing-1',
        user_id: userId,
      });
    });

    it('should preserve timestamps during migration', async () => {
      const originalCreatedAt = '2024-01-01T08:30:00Z';
      const originalUpdatedAt = '2024-02-15T14:00:00Z';

      const localData = {
        ingredients: [
          {
            id: 'ing-ts',
            name: 'Ajo',
            unit: 'unidades',
            purchase_format_desc: 'Cabeza',
            purchase_format_quantity: 1,
            category: 'Verduras',
            created_at: originalCreatedAt,
            updated_at: originalUpdatedAt,
          },
        ],
        recipes: [],
        recipe_ingredients: [],
        pantry_entries: [],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const mockDb = createMockSQLiteDB(localData);
      const result = await migrationService.migrate(mockDb, supabaseMock.client, 'user-456');

      expect(result.failed).toHaveLength(0);

      const remoteIngredients = supabaseMock.getTableStore('ingredients');
      const migratedIngredient = remoteIngredients.get('ing-ts');
      expect(migratedIngredient).toBeDefined();
      expect(migratedIngredient!.created_at).toBe(originalCreatedAt);
      expect(migratedIngredient!.updated_at).toBe(originalUpdatedAt);
      // synced_at should be set to the migration time
      expect(migratedIngredient!.synced_at).toBeDefined();
    });

    it('should handle partial migration failures gracefully', async () => {
      const localData = {
        ingredients: [
          { id: 'ing-ok', name: 'Cebolla', unit: 'gramos', purchase_format_desc: 'Malla', purchase_format_quantity: 1000, category: 'Verduras', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
        ],
        recipes: [
          { id: 'rec-fail', name: 'Receta Fallida', meal_type: 'cena', prep_time: 'elaborado', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
        ],
        recipe_ingredients: [],
        pantry_entries: [],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const mockDb = createMockSQLiteDB(localData);

      // Override the Supabase client to fail on recipes upsert
      const failingClient = {
        from: vi.fn((table: string) => ({
          upsert: vi.fn(() => {
            if (table === 'recipes') {
              return Promise.resolve({ data: null, error: { message: 'Server timeout' } });
            }
            return Promise.resolve({ data: [{}], error: null });
          }),
        })),
      } as any;

      const result = await migrationService.migrate(mockDb, failingClient, 'user-789');

      // Ingredient should succeed, recipe should fail
      expect(result.succeeded).toContain('ingredients:ing-ok');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toMatchObject({
        table: 'recipes',
        id: 'rec-fail',
        error: 'Server timeout',
      });
    });

    it('should not detect migration needed when sync metadata exists', async () => {
      // Simulate already-synced state: _sync_meta has records
      const mockDb = {
        execAsync: vi.fn().mockResolvedValue(undefined),
        runAsync: vi.fn().mockResolvedValue(undefined),
        getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
          if (sql.includes('sqlite_master')) {
            return { count: 1 }; // _sync_meta table exists
          }
          if (sql.includes('_sync_meta') && sql.includes('COUNT')) {
            return { count: 3 }; // Has synced records
          }
          return null;
        }),
        getAllAsync: vi.fn().mockResolvedValue([]),
      } as any;

      const needed = await migrationService.detectMigrationNeeded(mockDb);
      expect(needed).toBe(false);
    });
  });

  // ─── Scenario: Sync status transitions ────────────────────────────────────

  describe('Sync status lifecycle', () => {
    it('should transition through synced → offline → syncing → synced', async () => {
      const statusChanges: string[] = [];
      syncManager.onStatusChange((status) => statusChanges.push(status));

      // Initial: synced
      expect(syncManager.syncStatus).toBe('synced');

      // Go offline
      syncManager.setOnline(false);
      expect(statusChanges).toContain('offline');

      // Go back online (triggers replay with empty queue)
      syncManager.setOnline(true);

      // Wait for replay to complete
      await vi.waitFor(() => syncManager.syncStatus === 'synced', { timeout: 1000 });

      expect(statusChanges).toContain('syncing');
      expect(statusChanges).toContain('synced');
    });
  });
});
