import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OfflineQueue } from '../offline-queue';

// Mock generateId to produce deterministic IDs for testing
vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => 'test-queue-id-123'),
}));

/**
 * Creates a mock SQLiteDatabase with methods needed by OfflineQueue.
 */
function createMockDb() {
  return {
    execAsync: vi.fn().mockResolvedValue(undefined),
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getAllAsync: vi.fn().mockResolvedValue([]),
    getFirstAsync: vi.fn().mockResolvedValue(null),
  } as any;
}

describe('OfflineQueue', () => {
  let db: ReturnType<typeof createMockDb>;
  let queue: OfflineQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    queue = new OfflineQueue(db);
  });

  describe('initialize', () => {
    it('should create _sync_queue table', async () => {
      await queue.initialize();

      expect(db.execAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS _sync_queue')
      );
    });

    it('should create index on _sync_queue(status, created_at)', async () => {
      await queue.initialize();

      expect(db.execAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_sync_queue_status')
      );
    });

    it('should create _sync_meta table', async () => {
      await queue.initialize();

      expect(db.execAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS _sync_meta')
      );
    });

    it('should call execAsync exactly 3 times (table, index, meta table)', async () => {
      await queue.initialize();

      expect(db.execAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('enqueue', () => {
    it('should insert a new entry with status=pending and retry_count=0', async () => {
      const result = await queue.enqueue('create', 'recipes', 'entity-1', { name: 'Test Recipe' });

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO _sync_queue'),
        'test-queue-id-123',
        'recipes',
        'create',
        'entity-1',
        JSON.stringify({ name: 'Test Recipe' }),
        expect.any(String) // created_at ISO timestamp
      );
      expect(result.id).toBe('test-queue-id-123');
      expect(result.status).toBe('pending');
      expect(result.retry_count).toBe(0);
      expect(result.operation).toBe('create');
      expect(result.table_name).toBe('recipes');
      expect(result.entity_id).toBe('entity-1');
    });

    it('should JSON-serialize the payload', async () => {
      const payload = { name: 'Arroz', unit: 'gramos', quantity: 500 };
      await queue.enqueue('create', 'ingredients', 'ing-1', payload);

      const insertCall = db.runAsync.mock.calls[0];
      // payload is the 5th argument (index 5 after SQL)
      expect(insertCall[5]).toBe(JSON.stringify(payload));
    });

    it('should generate an ISO timestamp for created_at', async () => {
      const before = new Date().toISOString();
      const result = await queue.enqueue('update', 'recipes', 'r-1', {});
      const after = new Date().toISOString();

      expect(result.created_at).toBeDefined();
      expect(result.created_at >= before).toBe(true);
      expect(result.created_at <= after).toBe(true);
    });

    it('should support all operation types', async () => {
      await queue.enqueue('create', 'recipes', 'r-1', {});
      await queue.enqueue('update', 'recipes', 'r-1', { name: 'Updated' });
      await queue.enqueue('delete', 'recipes', 'r-1', {});

      expect(db.runAsync).toHaveBeenCalledTimes(3);
      expect(db.runAsync.mock.calls[0][3]).toBe('create');
      expect(db.runAsync.mock.calls[1][3]).toBe('update');
      expect(db.runAsync.mock.calls[2][3]).toBe('delete');
    });
  });

  describe('dequeue', () => {
    it('should query for pending entries ordered by created_at ASC', async () => {
      await queue.dequeue();

      expect(db.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("WHERE status = 'pending'")
      );
      expect(db.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at ASC')
      );
    });

    it('should return entries from the database', async () => {
      const mockEntries = [
        {
          id: 'q-1',
          table_name: 'recipes',
          operation: 'create',
          entity_id: 'r-1',
          payload: '{}',
          created_at: '2024-01-01T00:00:00.000Z',
          retry_count: 0,
          status: 'pending',
        },
        {
          id: 'q-2',
          table_name: 'ingredients',
          operation: 'update',
          entity_id: 'i-1',
          payload: '{"name":"Arroz"}',
          created_at: '2024-01-01T00:01:00.000Z',
          retry_count: 0,
          status: 'pending',
        },
      ];
      db.getAllAsync.mockResolvedValue(mockEntries);

      const result = await queue.dequeue();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('q-1');
      expect(result[1].id).toBe('q-2');
    });

    it('should return empty array when no pending entries exist', async () => {
      db.getAllAsync.mockResolvedValue([]);

      const result = await queue.dequeue();

      expect(result).toEqual([]);
    });
  });

  describe('markCompleted', () => {
    it('should DELETE the entry from the queue', async () => {
      await queue.markCompleted('q-1');

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM _sync_queue WHERE id = ?'),
        'q-1'
      );
    });
  });

  describe('markFailed', () => {
    it('should UPDATE the entry status to failed', async () => {
      await queue.markFailed('q-1');

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE _sync_queue SET status = 'failed' WHERE id = ?"),
        'q-1'
      );
    });
  });

  describe('incrementRetry', () => {
    it('should UPDATE retry_count = retry_count + 1', async () => {
      await queue.incrementRetry('q-1');

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE _sync_queue SET retry_count = retry_count + 1 WHERE id = ?'),
        'q-1'
      );
    });
  });

  describe('getById', () => {
    it('should return the entry when found', async () => {
      const mockEntry = {
        id: 'q-1',
        table_name: 'recipes',
        operation: 'create',
        entity_id: 'r-1',
        payload: '{}',
        created_at: '2024-01-01T00:00:00.000Z',
        retry_count: 0,
        status: 'pending',
      };
      db.getFirstAsync.mockResolvedValue(mockEntry);

      const result = await queue.getById('q-1');

      expect(result).toEqual(mockEntry);
      expect(db.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ?'),
        'q-1'
      );
    });

    it('should return null when entry is not found', async () => {
      db.getFirstAsync.mockResolvedValue(null);

      const result = await queue.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getSyncMeta', () => {
    it('should return sync metadata for a table', async () => {
      db.getFirstAsync.mockResolvedValue({
        table_name: 'recipes',
        last_synced_at: '2024-06-01T12:00:00.000Z',
      });

      const result = await queue.getSyncMeta('recipes');

      expect(result).toEqual({
        table_name: 'recipes',
        last_synced_at: '2024-06-01T12:00:00.000Z',
      });
    });

    it('should return null when no metadata exists', async () => {
      db.getFirstAsync.mockResolvedValue(null);

      const result = await queue.getSyncMeta('unknown_table');

      expect(result).toBeNull();
    });
  });

  describe('updateSyncMeta', () => {
    it('should INSERT OR REPLACE sync metadata', async () => {
      await queue.updateSyncMeta('recipes', '2024-06-15T10:00:00.000Z');

      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO _sync_meta'),
        'recipes',
        '2024-06-15T10:00:00.000Z'
      );
    });
  });
});
