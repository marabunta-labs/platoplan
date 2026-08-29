import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  withTransaction,
  generateId,
} from './database';

// Mock expo-sqlite
const mockExecAsync = vi.fn().mockResolvedValue(undefined);
const mockGetFirstAsync = vi.fn().mockResolvedValue({ user_version: 0 });
const mockCloseAsync = vi.fn().mockResolvedValue(undefined);

const mockDb = {
  execAsync: mockExecAsync,
  getFirstAsync: mockGetFirstAsync,
  closeAsync: mockCloseAsync,
};

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn().mockImplementation(() => Promise.resolve(mockDb)),
}));

describe('database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state — closeDatabase sets db = null
  });

  afterEach(async () => {
    await closeDatabase();
  });

  describe('initializeDatabase', () => {
    it('should open the database and enable foreign keys', async () => {
      const db = await initializeDatabase();

      expect(db).toBe(mockDb);
      expect(mockExecAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON;');
      expect(mockExecAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL;');
    });

    it('should run migrations on first initialization', async () => {
      mockGetFirstAsync.mockResolvedValueOnce({ user_version: 0 });

      await initializeDatabase();

      // Should query for user_version
      expect(mockGetFirstAsync).toHaveBeenCalledWith('PRAGMA user_version;');
      // Should execute schema (the large SQL string)
      const execCalls = mockExecAsync.mock.calls.map((c) => c[0]);
      const hasSchema = execCalls.some(
        (sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS recipes')
      );
      expect(hasSchema).toBe(true);
    });

    it('should return the same instance on subsequent calls', async () => {
      const db1 = await initializeDatabase();
      const db2 = await initializeDatabase();

      expect(db1).toBe(db2);
    });

    it('should skip migrations if already up to date', async () => {
      mockGetFirstAsync.mockResolvedValueOnce({ user_version: 1 });

      await initializeDatabase();

      // Should not execute schema creation (only PRAGMAs)
      const execCalls = mockExecAsync.mock.calls.map((c) => c[0]);
      const hasSchema = execCalls.some(
        (sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS recipes')
      );
      expect(hasSchema).toBe(false);
    });
  });

  describe('getDatabase', () => {
    it('should throw if database is not initialized', () => {
      expect(() => getDatabase()).toThrow(
        'Database not initialized. Call initializeDatabase() first.'
      );
    });

    it('should return the database after initialization', async () => {
      await initializeDatabase();
      const db = getDatabase();
      expect(db).toBe(mockDb);
    });
  });

  describe('closeDatabase', () => {
    it('should close the connection and reset singleton', async () => {
      await initializeDatabase();
      await closeDatabase();

      expect(mockCloseAsync).toHaveBeenCalled();
      expect(() => getDatabase()).toThrow();
    });

    it('should be a no-op if not initialized', async () => {
      await closeDatabase(); // Should not throw
      expect(mockCloseAsync).not.toHaveBeenCalled();
    });
  });

  describe('withTransaction', () => {
    it('should execute callback within BEGIN/COMMIT', async () => {
      const callback = vi.fn().mockResolvedValue('result');

      const result = await withTransaction(mockDb as any, callback);

      expect(result).toBe('result');
      expect(mockExecAsync).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(callback).toHaveBeenCalledWith(mockDb);
      expect(mockExecAsync).toHaveBeenCalledWith('COMMIT;');
    });

    it('should rollback on error', async () => {
      const error = new Error('something failed');
      const callback = vi.fn().mockRejectedValue(error);

      await expect(withTransaction(mockDb as any, callback)).rejects.toThrow(
        'something failed'
      );

      expect(mockExecAsync).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(mockExecAsync).toHaveBeenCalledWith('ROLLBACK;');
      expect(mockExecAsync).not.toHaveBeenCalledWith('COMMIT;');
    });

    it('should pass the database instance to the callback', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      await withTransaction(mockDb as any, callback);

      expect(callback).toHaveBeenCalledWith(mockDb);
    });
  });

  describe('generateId', () => {
    it('should generate a valid UUID v4 format string', () => {
      const id = generateId();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });
});
