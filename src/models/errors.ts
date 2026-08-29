/**
 * PlatoPlan - Error type definitions
 */

/** Validation error with per-field details */
export interface ValidationError {
  type: 'validation';
  fields: { field: string; message: string }[];
}

/** Conflict error when a resource already exists */
export interface ConflictError {
  type: 'conflict';
  message: string;
  existingId?: string;
}

/** Constraint error when a business rule is violated */
export interface ConstraintError {
  type: 'constraint';
  message: string;
  details: Record<string, unknown>;
}

/** Persistence error when data cannot be saved or read */
export interface PersistenceError {
  type: 'write_failure' | 'constraint_violation' | 'corruption';
  message: string;
  retryable: boolean;
}
