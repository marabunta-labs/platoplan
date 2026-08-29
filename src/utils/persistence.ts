/**
 * PlatoPlan - Persistence retry mechanism and optimistic UI utilities
 *
 * Provides retry logic for database operations (up to 3 attempts),
 * error classification for SQLite errors, and an optimistic UI rollback pattern.
 */

import { PersistenceError } from '../models/errors';

/**
 * Result wrapper for persistence operations.
 * Contains success/failure status, data, error details, and remaining retries.
 */
export interface PersistenceResult<T> {
  success: boolean;
  data?: T;
  error?: PersistenceError;
  retriesRemaining: number;
}

/**
 * Options for creating an optimistic operation.
 */
export interface OptimisticOptions<T, S> {
  /** Returns the current state before any changes */
  getCurrentState: () => S;
  /** Applies the optimistic change to the state and returns the new state */
  applyChange: (state: S) => S;
  /** Persists the change to the database */
  persistChange: () => Promise<T>;
  /** Called when a rollback occurs (optional) */
  onRollback?: (previousState: S) => void;
}

/**
 * Represents an optimistic operation that can be applied, committed, or rolled back.
 */
export interface OptimisticOperation<T, S> {
  /** Apply the change optimistically (returns the new state) */
  applyOptimistic: () => S;
  /** Persist the change with retry logic */
  commit: () => Promise<PersistenceResult<T>>;
  /** Rollback to the previous state */
  rollback: () => S;
  /** The previous state captured before optimistic application */
  previousState: S;
}

// Keywords for SQLite constraint violation errors
const CONSTRAINT_KEYWORDS = [
  'UNIQUE constraint',
  'CHECK constraint',
  'FOREIGN KEY',
  'NOT NULL constraint',
  'PRIMARY KEY constraint',
];

// Keywords for SQLite corruption errors
const CORRUPTION_KEYWORDS = [
  'database disk image is malformed',
  'database is corrupt',
  'file is not a database',
  'disk I/O error',
];

/**
 * Classifies an unknown error into a PersistenceError.
 *
 * - constraint_violation: SQLite UNIQUE/CHECK/FOREIGN KEY constraint errors (not retryable)
 * - corruption: Database corruption errors (not retryable)
 * - write_failure: All other errors (retryable — could be transient)
 */
export function classifyError(error: unknown): PersistenceError {
  const message = extractErrorMessage(error);

  // Check for constraint violations
  if (CONSTRAINT_KEYWORDS.some((keyword) => message.includes(keyword))) {
    return {
      type: 'constraint_violation',
      message,
      retryable: false,
    };
  }

  // Check for corruption
  if (CORRUPTION_KEYWORDS.some((keyword) => message.includes(keyword))) {
    return {
      type: 'corruption',
      message,
      retryable: false,
    };
  }

  // Default: write_failure (retryable)
  return {
    type: 'write_failure',
    message,
    retryable: true,
  };
}

/**
 * Executes a database operation with retry logic.
 *
 * - On success: returns { success: true, data, retriesRemaining }
 * - On failure with retryable error: retries up to maxRetries times
 * - On failure with non-retryable error: returns immediately with error
 * - After all retries exhausted: returns { success: false, error, retriesRemaining: 0 }
 *
 * @param operation - The async operation to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<PersistenceResult<T>> {
  let retriesRemaining = maxRetries;

  while (retriesRemaining >= 0) {
    try {
      const data = await operation();
      return {
        success: true,
        data,
        retriesRemaining,
      };
    } catch (error: unknown) {
      const classifiedError = classifyError(error);

      // Non-retryable errors return immediately
      if (!classifiedError.retryable) {
        return {
          success: false,
          error: classifiedError,
          retriesRemaining,
        };
      }

      // Decrement retries
      retriesRemaining--;

      // If no retries left, return failure
      if (retriesRemaining < 0) {
        return {
          success: false,
          error: classifiedError,
          retriesRemaining: 0,
        };
      }

      // Otherwise loop and retry
    }
  }

  // This should never be reached, but TypeScript needs it
  return {
    success: false,
    error: {
      type: 'write_failure',
      message: 'Unexpected: retry loop exited without result',
      retryable: false,
    },
    retriesRemaining: 0,
  };
}

/**
 * Creates an optimistic operation that applies a change immediately to the UI state,
 * then persists it with retry logic. If persistence fails, the previous state can be
 * rolled back.
 *
 * Usage pattern:
 * ```typescript
 * const op = createOptimisticOperation({
 *   getCurrentState: () => currentItems,
 *   applyChange: (items) => [...items, newItem],
 *   persistChange: () => repository.create(newItem),
 *   onRollback: (prev) => setItems(prev),
 * });
 *
 * // Apply optimistically (updates UI immediately)
 * const newState = op.applyOptimistic();
 * setItems(newState);
 *
 * // Persist in background
 * const result = await op.commit();
 * if (!result.success) {
 *   // Rollback to previous state
 *   const prevState = op.rollback();
 *   setItems(prevState);
 * }
 * ```
 */
export function createOptimisticOperation<T, S>(
  options: OptimisticOptions<T, S>
): OptimisticOperation<T, S> {
  const previousState = options.getCurrentState();
  let optimisticState: S | undefined;

  return {
    previousState,

    applyOptimistic(): S {
      optimisticState = options.applyChange(previousState);
      return optimisticState;
    },

    async commit(): Promise<PersistenceResult<T>> {
      return withRetry(options.persistChange);
    },

    rollback(): S {
      if (options.onRollback) {
        options.onRollback(previousState);
      }
      return previousState;
    },
  };
}

/**
 * Extracts a message string from an unknown error value.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown persistence error';
}
