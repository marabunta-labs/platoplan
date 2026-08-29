/**
 * PlatoPlan - Exponential Backoff Property Test
 *
 * Feature: platoplan-web-supabase, Property 7: Sync queue retry with exponential backoff
 *
 * **Validates: Requirements 6.7**
 *
 * For any failed sync operation, the retry count SHALL increment by one on each attempt,
 * the delay between attempts SHALL double (exponential backoff), and after 3 failed attempts
 * the operation SHALL be marked as 'failed' and not retried automatically.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { SyncManager, calculateBackoff } from '../sync-manager';
import type { SyncManagerDependencies } from '../sync-manager';
import type { SyncQueueEntry } from '../../models/sync-types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

function createMockOfflineQueue() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue(undefined),
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

function createMockConflictResolver() {
  return {
    resolve: vi.fn((local: any, remote: any) => local),
  } as any;
}

function createMockSupabaseClient() {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn().mockResolvedValue('ok'),
  };

  return {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Server error', code: '500' },
      }),
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

// ─── Custom Generators ──────────────────────────────────────────────────────

/** Generates a positive base delay in milliseconds (1 to 5000) */
const arbBaseDelayMs = fc.integer({ min: 1, max: 5000 });

/** Generates a valid retry attempt number (0 to 10) */
const arbAttempt = fc.integer({ min: 0, max: 10 });

/** Generates a pair of consecutive attempt numbers */
const arbConsecutiveAttempts = fc.integer({ min: 0, max: 9 }).map((n) => [n, n + 1] as const);

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Feature: platoplan-web-supabase, Property 7: Sync queue retry with exponential backoff', () => {
  /**
   * Property 7a: calculateBackoff(n, base) === base * 2^n for all valid n and base
   *
   * **Validates: Requirements 6.7**
   */
  it('calculateBackoff(n, base) should equal base * 2^n for all valid attempts and base delays', () => {
    fc.assert(
      fc.property(arbAttempt, arbBaseDelayMs, (attempt, baseDelayMs) => {
        const result = calculateBackoff(attempt, baseDelayMs);
        const expected = baseDelayMs * Math.pow(2, attempt);
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7b: Each successive delay is exactly double the previous
   *
   * **Validates: Requirements 6.7**
   */
  it('each successive backoff delay should be exactly double the previous', () => {
    fc.assert(
      fc.property(arbConsecutiveAttempts, arbBaseDelayMs, ([attempt, nextAttempt], baseDelayMs) => {
        const currentDelay = calculateBackoff(attempt, baseDelayMs);
        const nextDelay = calculateBackoff(nextAttempt, baseDelayMs);
        expect(nextDelay).toBe(currentDelay * 2);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7c: After exactly 3 failed attempts, the operation is marked failed
   *
   * **Validates: Requirements 6.7**
   */
  it('after exactly maxRetries (3) failed attempts, the operation should be marked as failed', async () => {
    await fc.assert(
      fc.asyncProperty(arbBaseDelayMs, async (baseDelayMs) => {
        const delayFn = vi.fn().mockResolvedValue(undefined);
        const offlineQueue = createMockOfflineQueue();

        const entry: SyncQueueEntry = {
          id: 'q-test',
          table_name: 'recipes',
          operation: 'create',
          entity_id: 'r-test',
          payload: JSON.stringify({ id: 'r-test', name: 'Test' }),
          created_at: new Date().toISOString(),
          retry_count: 0,
          status: 'pending',
        };
        offlineQueue.dequeue.mockResolvedValue([entry]);

        const deps: SyncManagerDependencies = {
          offlineQueue,
          conflictResolver: createMockConflictResolver(),
          supabaseClient: createMockSupabaseClient(),
          tables: ['recipes'],
          backoffConfig: { baseDelayMs, maxRetries: 3 },
          delayFn,
        };

        const syncManager = new SyncManager(deps);
        const result = await syncManager.replay();

        // Operation should be marked as failed after 3 attempts
        expect(result.failed).toBe(1);
        expect(offlineQueue.markFailed).toHaveBeenCalledWith('q-test');
        // incrementRetry is called on each attempt (3 times)
        expect(offlineQueue.incrementRetry).toHaveBeenCalledTimes(3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7d: retry_count increments by 1 on each attempt
   *
   * **Validates: Requirements 6.7**
   */
  it('retry_count should increment by 1 on each failed attempt', async () => {
    await fc.assert(
      fc.asyncProperty(arbBaseDelayMs, async (baseDelayMs) => {
        const delayFn = vi.fn().mockResolvedValue(undefined);
        const offlineQueue = createMockOfflineQueue();
        const incrementCalls: string[] = [];
        offlineQueue.incrementRetry.mockImplementation(async (id: string) => {
          incrementCalls.push(id);
        });

        const entry: SyncQueueEntry = {
          id: 'q-retry',
          table_name: 'ingredients',
          operation: 'create',
          entity_id: 'i-retry',
          payload: JSON.stringify({ id: 'i-retry', name: 'Test Ingredient' }),
          created_at: new Date().toISOString(),
          retry_count: 0,
          status: 'pending',
        };
        offlineQueue.dequeue.mockResolvedValue([entry]);

        const deps: SyncManagerDependencies = {
          offlineQueue,
          conflictResolver: createMockConflictResolver(),
          supabaseClient: createMockSupabaseClient(),
          tables: ['ingredients'],
          backoffConfig: { baseDelayMs, maxRetries: 3 },
          delayFn,
        };

        const syncManager = new SyncManager(deps);
        await syncManager.replay();

        // Each of the 3 attempts should have called incrementRetry exactly once
        expect(incrementCalls).toHaveLength(3);
        // All calls should be for the same entry ID
        incrementCalls.forEach((id) => expect(id).toBe('q-retry'));
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7e: The actual delays passed to delayFn follow exponential backoff pattern
   *
   * **Validates: Requirements 6.7**
   */
  it('delays between retry attempts should follow exponential backoff pattern (doubling)', async () => {
    await fc.assert(
      fc.asyncProperty(arbBaseDelayMs, async (baseDelayMs) => {
        const recordedDelays: number[] = [];
        const delayFn = vi.fn().mockImplementation(async (ms: number) => {
          recordedDelays.push(ms);
        });
        const offlineQueue = createMockOfflineQueue();

        const entry: SyncQueueEntry = {
          id: 'q-delay',
          table_name: 'recipes',
          operation: 'create',
          entity_id: 'r-delay',
          payload: JSON.stringify({ id: 'r-delay', name: 'Delay Test' }),
          created_at: new Date().toISOString(),
          retry_count: 0,
          status: 'pending',
        };
        offlineQueue.dequeue.mockResolvedValue([entry]);

        const deps: SyncManagerDependencies = {
          offlineQueue,
          conflictResolver: createMockConflictResolver(),
          supabaseClient: createMockSupabaseClient(),
          tables: ['recipes'],
          backoffConfig: { baseDelayMs, maxRetries: 3 },
          delayFn,
        };

        const syncManager = new SyncManager(deps);
        await syncManager.replay();

        // With 3 max retries, delay is called after attempt 0 and attempt 1
        // (not after the final attempt which marks as failed)
        expect(recordedDelays).toHaveLength(2);
        expect(recordedDelays[0]).toBe(baseDelayMs * 1);  // 2^0 * base
        expect(recordedDelays[1]).toBe(baseDelayMs * 2);  // 2^1 * base

        // Verify the doubling property: each delay is exactly double the previous
        for (let i = 1; i < recordedDelays.length; i++) {
          expect(recordedDelays[i]).toBe(recordedDelays[i - 1] * 2);
        }
      }),
      { numRuns: 100 }
    );
  });
});
