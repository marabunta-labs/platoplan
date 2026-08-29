import { describe, it, expect, vi } from 'vitest';
import {
  classifyError,
  withRetry,
  createOptimisticOperation,
  PersistenceResult,
} from '../persistence';

describe('classifyError', () => {
  it('classifies UNIQUE constraint as constraint_violation (not retryable)', () => {
    const error = new Error('UNIQUE constraint failed: recipes.name');
    const result = classifyError(error);

    expect(result.type).toBe('constraint_violation');
    expect(result.retryable).toBe(false);
    expect(result.message).toContain('UNIQUE constraint');
  });

  it('classifies CHECK constraint as constraint_violation (not retryable)', () => {
    const error = new Error('CHECK constraint failed: quantity > 0');
    const result = classifyError(error);

    expect(result.type).toBe('constraint_violation');
    expect(result.retryable).toBe(false);
  });

  it('classifies FOREIGN KEY as constraint_violation (not retryable)', () => {
    const error = new Error('FOREIGN KEY constraint failed');
    const result = classifyError(error);

    expect(result.type).toBe('constraint_violation');
    expect(result.retryable).toBe(false);
  });

  it('classifies NOT NULL constraint as constraint_violation (not retryable)', () => {
    const error = new Error('NOT NULL constraint failed: recipes.name');
    const result = classifyError(error);

    expect(result.type).toBe('constraint_violation');
    expect(result.retryable).toBe(false);
  });

  it('classifies database corruption as corruption (not retryable)', () => {
    const error = new Error('database disk image is malformed');
    const result = classifyError(error);

    expect(result.type).toBe('corruption');
    expect(result.retryable).toBe(false);
  });

  it('classifies "database is corrupt" as corruption', () => {
    const error = new Error('database is corrupt');
    const result = classifyError(error);

    expect(result.type).toBe('corruption');
    expect(result.retryable).toBe(false);
  });

  it('classifies generic errors as write_failure (retryable)', () => {
    const error = new Error('SQLite busy timeout');
    const result = classifyError(error);

    expect(result.type).toBe('write_failure');
    expect(result.retryable).toBe(true);
  });

  it('handles string errors', () => {
    const result = classifyError('something went wrong');

    expect(result.type).toBe('write_failure');
    expect(result.retryable).toBe(true);
    expect(result.message).toBe('something went wrong');
  });

  it('handles non-Error objects with message property', () => {
    const result = classifyError({ message: 'UNIQUE constraint failed' });

    expect(result.type).toBe('constraint_violation');
    expect(result.retryable).toBe(false);
  });

  it('handles unknown error types gracefully', () => {
    const result = classifyError(42);

    expect(result.type).toBe('write_failure');
    expect(result.message).toBe('Unknown persistence error');
    expect(result.retryable).toBe(true);
  });

  it('handles null/undefined errors', () => {
    const result = classifyError(null);

    expect(result.type).toBe('write_failure');
    expect(result.message).toBe('Unknown persistence error');
    expect(result.retryable).toBe(true);
  });
});

describe('withRetry', () => {
  it('returns success on first attempt when operation succeeds', async () => {
    const operation = vi.fn().mockResolvedValue('data');

    const result = await withRetry(operation);

    expect(result.success).toBe(true);
    expect(result.data).toBe('data');
    expect(result.retriesRemaining).toBe(3);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds on second attempt', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('SQLite busy'))
      .mockResolvedValue('recovered');

    const result = await withRetry(operation);

    expect(result.success).toBe(true);
    expect(result.data).toBe('recovered');
    expect(result.retriesRemaining).toBe(2);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries up to maxRetries times and then fails', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('SQLite busy'));

    const result = await withRetry(operation, 3);

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('write_failure');
    expect(result.retriesRemaining).toBe(0);
    // Initial attempt + 3 retries = 4 calls
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('does not retry on non-retryable error (constraint_violation)', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new Error('UNIQUE constraint failed: recipes.name'));

    const result = await withRetry(operation);

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('constraint_violation');
    expect(result.error?.retryable).toBe(false);
    expect(result.retriesRemaining).toBe(3);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not retry on non-retryable error (corruption)', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new Error('database disk image is malformed'));

    const result = await withRetry(operation);

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('corruption');
    expect(result.error?.retryable).toBe(false);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('uses custom maxRetries value', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('timeout'));

    const result = await withRetry(operation, 1);

    expect(result.success).toBe(false);
    expect(result.retriesRemaining).toBe(0);
    // Initial attempt + 1 retry = 2 calls
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('succeeds on last retry attempt', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockRejectedValueOnce(new Error('busy'))
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValue('finally!');

    const result = await withRetry(operation, 3);

    expect(result.success).toBe(true);
    expect(result.data).toBe('finally!');
    expect(result.retriesRemaining).toBe(0);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('handles maxRetries of 0 (no retries, single attempt)', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('fail'));

    const result = await withRetry(operation, 0);

    expect(result.success).toBe(false);
    expect(result.retriesRemaining).toBe(0);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('createOptimisticOperation', () => {
  it('captures the current state on creation', () => {
    const items = ['a', 'b', 'c'];
    const op = createOptimisticOperation({
      getCurrentState: () => items,
      applyChange: (state) => [...state, 'd'],
      persistChange: async () => 'persisted',
    });

    expect(op.previousState).toEqual(['a', 'b', 'c']);
  });

  it('applyOptimistic returns the changed state', () => {
    const items = ['a', 'b'];
    const op = createOptimisticOperation({
      getCurrentState: () => items,
      applyChange: (state) => [...state, 'c'],
      persistChange: async () => 'ok',
    });

    const newState = op.applyOptimistic();

    expect(newState).toEqual(['a', 'b', 'c']);
  });

  it('commit persists the change and returns success', async () => {
    const op = createOptimisticOperation({
      getCurrentState: () => [1, 2, 3],
      applyChange: (state) => [...state, 4],
      persistChange: async () => ({ id: '1', value: 4 }),
    });

    op.applyOptimistic();
    const result = await op.commit();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: '1', value: 4 });
  });

  it('commit retries on failure and returns error when exhausted', async () => {
    const persistChange = vi.fn().mockRejectedValue(new Error('disk full'));

    const op = createOptimisticOperation({
      getCurrentState: () => ({ count: 5 }),
      applyChange: (state) => ({ count: state.count + 1 }),
      persistChange,
    });

    op.applyOptimistic();
    const result = await op.commit();

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('write_failure');
    // Initial + 3 retries = 4 calls
    expect(persistChange).toHaveBeenCalledTimes(4);
  });

  it('rollback returns the previous state', () => {
    const op = createOptimisticOperation({
      getCurrentState: () => ['x', 'y'],
      applyChange: (state) => [...state, 'z'],
      persistChange: async () => 'ok',
    });

    op.applyOptimistic();
    const restored = op.rollback();

    expect(restored).toEqual(['x', 'y']);
  });

  it('rollback calls onRollback callback with previous state', () => {
    const onRollback = vi.fn();
    const op = createOptimisticOperation({
      getCurrentState: () => [10, 20],
      applyChange: (state) => [...state, 30],
      persistChange: async () => 'ok',
      onRollback,
    });

    op.applyOptimistic();
    op.rollback();

    expect(onRollback).toHaveBeenCalledWith([10, 20]);
  });

  it('full optimistic flow: apply, fail commit, rollback', async () => {
    const onRollback = vi.fn();
    const op = createOptimisticOperation({
      getCurrentState: () => ({ items: ['a'] }),
      applyChange: (state) => ({ items: [...state.items, 'b'] }),
      persistChange: async () => {
        throw new Error('UNIQUE constraint failed');
      },
      onRollback,
    });

    // Step 1: Apply optimistically
    const optimistic = op.applyOptimistic();
    expect(optimistic).toEqual({ items: ['a', 'b'] });

    // Step 2: Attempt to commit (fails with non-retryable error)
    const result = await op.commit();
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('constraint_violation');

    // Step 3: Rollback
    const restored = op.rollback();
    expect(restored).toEqual({ items: ['a'] });
    expect(onRollback).toHaveBeenCalledWith({ items: ['a'] });
  });
});
