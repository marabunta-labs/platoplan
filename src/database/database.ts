import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

let db: SQLite.SQLiteDatabase | null = null;

const DATABASE_NAME = 'platoplan_v2.db';

/**
 * Opens (or reuses) the SQLite database connection and runs migrations.
 * This is idempotent — calling it multiple times returns the same instance.
 */
export async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) {
    return db;
  }

  db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Enable WAL mode for better concurrent read performance
  await db.execAsync('PRAGMA journal_mode = WAL;');

  // Run migrations (idempotent)
  await runMigrations(db);

  return db;
}

/**
 * Returns the current database instance.
 * Throws if the database has not been initialized yet.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error(
      'Database not initialized. Call initializeDatabase() first.'
    );
  }
  return db;
}

/**
 * Closes the database connection and resets the singleton.
 * Useful for testing or cleanup.
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

/**
 * Executes a callback inside a database transaction.
 * Automatically commits on success or rolls back on error.
 */
export async function withTransaction<T>(
  database: SQLite.SQLiteDatabase,
  callback: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  if (typeof database.withTransactionAsync === 'function') {
    let result: T;
    await database.withTransactionAsync(async () => {
      result = await callback(database);
    });
    return result!;
  }

  await database.execAsync('BEGIN TRANSACTION;');
  try {
    const result = await callback(database);
    await database.execAsync('COMMIT;');
    return result;
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

/**
 * Generates a UUID v4 string for use as primary key.
 */
export function generateId(): string {
  // Use crypto.randomUUID if available (modern environments)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
