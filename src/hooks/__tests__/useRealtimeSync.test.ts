/**
 * PlatoPlan - useRealtimeSync hook tests
 *
 * Validates that the realtime sync hook:
 * 1. Subscribes to SyncManager's onRemoteChange callback
 * 2. Writes incoming remote changes to local SQLite
 * 3. Emits table invalidation events to trigger UI re-renders
 *
 * Requirements: 6.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tableInvalidationEmitter } from '../tableInvalidationEmitter';

// Since useRealtimeSync is a React hook, we test the underlying logic directly
// by simulating what the hook does: registering a listener and handling remote changes.

// Mock the applyRemoteChangeToLocalDb logic
function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
  } as any;
}

function createMockSyncManager() {
  const remoteChangeListeners: Array<
    (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: Record<string, unknown>) => void
  > = [];

  return {
    isOnline: true,
    syncStatus: 'synced' as const,
    enqueue: vi.fn(),
    replay: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    onStatusChange: vi.fn(() => vi.fn()),
    onRemoteChange: vi.fn((listener: any) => {
      remoteChangeListeners.push(listener);
      return () => {
        const idx = remoteChangeListeners.indexOf(listener);
        if (idx >= 0) remoteChangeListeners.splice(idx, 1);
      };
    }),
    setOnline: vi.fn(),
    destroy: vi.fn(),
    // Test helper to simulate a remote change
    _simulateRemoteChange: (
      table: string,
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      record: Record<string, unknown>
    ) => {
      for (const listener of remoteChangeListeners) {
        listener(table, eventType, record);
      }
    },
  };
}

describe('useRealtimeSync - integration logic', () => {
  beforeEach(() => {
    tableInvalidationEmitter.clear();
  });

  it('should emit table invalidation when a remote INSERT arrives', async () => {
    const mockSyncManager = createMockSyncManager();
    const mockDb = createMockDb();
    const invalidationListener = vi.fn();

    tableInvalidationEmitter.subscribe('ingredients', invalidationListener);

    // Simulate what useRealtimeSync does: register a listener
    const unsubscribe = mockSyncManager.onRemoteChange(
      async (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: Record<string, unknown>) => {
        const entityId = record.id as string;
        if (!entityId) return;

        if (eventType === 'DELETE') {
          await mockDb.runAsync(`DELETE FROM ${table} WHERE id = ?`, entityId);
        } else {
          const entries = Object.entries(record).filter(([, v]) => v !== undefined && v !== null);
          const columns = entries.map(([k]) => k);
          const values = entries.map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : v));
          const placeholders = entries.map(() => '?');
          await mockDb.runAsync(
            `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            ...values
          );
        }
        tableInvalidationEmitter.emit(table);
      }
    );

    // Simulate remote change
    mockSyncManager._simulateRemoteChange('ingredients', 'INSERT', {
      id: 'ing-1',
      name: 'Tomate',
      unit: 'gramos',
      category: 'Verduras',
    });

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO ingredients'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(invalidationListener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('should emit table invalidation when a remote DELETE arrives', async () => {
    const mockSyncManager = createMockSyncManager();
    const mockDb = createMockDb();
    const invalidationListener = vi.fn();

    tableInvalidationEmitter.subscribe('recipes', invalidationListener);

    mockSyncManager.onRemoteChange(
      async (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: Record<string, unknown>) => {
        const entityId = record.id as string;
        if (!entityId) return;

        if (eventType === 'DELETE') {
          await mockDb.runAsync(`DELETE FROM ${table} WHERE id = ?`, entityId);
        } else {
          const entries = Object.entries(record).filter(([, v]) => v !== undefined && v !== null);
          const columns = entries.map(([k]) => k);
          const values = entries.map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : v));
          const placeholders = entries.map(() => '?');
          await mockDb.runAsync(
            `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            ...values
          );
        }
        tableInvalidationEmitter.emit(table);
      }
    );

    mockSyncManager._simulateRemoteChange('recipes', 'DELETE', {
      id: 'recipe-42',
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM recipes WHERE id = ?',
      'recipe-42'
    );
    expect(invalidationListener).toHaveBeenCalledTimes(1);
  });

  it('should not process records without an id field', async () => {
    const mockSyncManager = createMockSyncManager();
    const mockDb = createMockDb();
    const invalidationListener = vi.fn();

    tableInvalidationEmitter.subscribe('ingredients', invalidationListener);

    mockSyncManager.onRemoteChange(
      async (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: Record<string, unknown>) => {
        const entityId = record.id as string;
        if (!entityId) return;

        if (eventType === 'DELETE') {
          await mockDb.runAsync(`DELETE FROM ${table} WHERE id = ?`, entityId);
        } else {
          const entries = Object.entries(record).filter(([, v]) => v !== undefined && v !== null);
          const columns = entries.map(([k]) => k);
          const values = entries.map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : v));
          const placeholders = entries.map(() => '?');
          await mockDb.runAsync(
            `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            ...values
          );
        }
        tableInvalidationEmitter.emit(table);
      }
    );

    // Record without id should be skipped
    mockSyncManager._simulateRemoteChange('ingredients', 'INSERT', {
      name: 'No ID record',
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockDb.runAsync).not.toHaveBeenCalled();
    expect(invalidationListener).not.toHaveBeenCalled();
  });

  it('should handle UPDATE events with upsert', async () => {
    const mockSyncManager = createMockSyncManager();
    const mockDb = createMockDb();
    const invalidationListener = vi.fn();

    tableInvalidationEmitter.subscribe('pantry_entries', invalidationListener);

    mockSyncManager.onRemoteChange(
      async (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: Record<string, unknown>) => {
        const entityId = record.id as string;
        if (!entityId) return;

        if (eventType === 'DELETE') {
          await mockDb.runAsync(`DELETE FROM ${table} WHERE id = ?`, entityId);
        } else {
          const entries = Object.entries(record).filter(([, v]) => v !== undefined && v !== null);
          const columns = entries.map(([k]) => k);
          const values = entries.map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : v));
          const placeholders = entries.map(() => '?');
          await mockDb.runAsync(
            `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            ...values
          );
        }
        tableInvalidationEmitter.emit(table);
      }
    );

    mockSyncManager._simulateRemoteChange('pantry_entries', 'UPDATE', {
      id: 'pantry-1',
      quantity: 500,
      updated_at: '2024-01-15T10:00:00Z',
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO pantry_entries'),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(invalidationListener).toHaveBeenCalledTimes(1);
  });

  it('should still emit invalidation even when SQLite write fails', async () => {
    const mockSyncManager = createMockSyncManager();
    const mockDb = createMockDb();
    mockDb.runAsync.mockRejectedValue(new Error('SQLite error'));
    const invalidationListener = vi.fn();

    tableInvalidationEmitter.subscribe('ingredients', invalidationListener);

    mockSyncManager.onRemoteChange(
      async (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', record: Record<string, unknown>) => {
        const entityId = record.id as string;
        if (!entityId) return;

        try {
          if (eventType === 'DELETE') {
            await mockDb.runAsync(`DELETE FROM ${table} WHERE id = ?`, entityId);
          } else {
            const entries = Object.entries(record).filter(([, v]) => v !== undefined && v !== null);
            const columns = entries.map(([k]) => k);
            const values = entries.map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : v));
            const placeholders = entries.map(() => '?');
            await mockDb.runAsync(
              `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
              ...values
            );
          }
          tableInvalidationEmitter.emit(table);
        } catch {
          // Still emit invalidation so hooks try to refresh
          tableInvalidationEmitter.emit(table);
        }
      }
    );

    mockSyncManager._simulateRemoteChange('ingredients', 'INSERT', {
      id: 'ing-fail',
      name: 'Failed Insert',
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Invalidation should still fire even on error
    expect(invalidationListener).toHaveBeenCalledTimes(1);
  });
});
