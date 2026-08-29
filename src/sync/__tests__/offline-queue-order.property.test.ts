/**
 * PlatoPlan - Offline Queue Chronological Order Property Test
 *
 * Feature: platoplan-web-supabase, Property 4: Offline queue preserves chronological order
 *
 * **Validates: Requirements 6.2, 6.3**
 *
 * For any sequence of mutations performed while offline, the offline queue SHALL
 * store them in the exact chronological order they were performed, and replay
 * SHALL process them in that same order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { OfflineQueue } from '../offline-queue';
import type { MutationType, SyncQueueEntry } from '../../models/sync-types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => 'id-' + Math.random().toString(36).slice(2, 10)),
}));

// ─── In-Memory SQLite Mock ──────────────────────────────────────────────────

/**
 * Creates an in-memory mock of SQLiteDatabase that stores entries
 * and returns them ordered by created_at ASC (simulating real SQLite behavior).
 */
function createInMemoryDb() {
  const entries: SyncQueueEntry[] = [];

  return {
    execAsync: vi.fn().mockResolvedValue(undefined),
    runAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO _sync_queue')) {
        const [id, table_name, operation, entity_id, payload, created_at] = params as string[];
        entries.push({
          id,
          table_name,
          operation: operation as MutationType,
          entity_id,
          payload,
          created_at,
          retry_count: 0,
          status: 'pending',
        });
      } else if (sql.includes('DELETE FROM _sync_queue WHERE id = ?')) {
        const idToRemove = params[0] as string;
        const idx = entries.findIndex((e) => e.id === idToRemove);
        if (idx !== -1) entries.splice(idx, 1);
      } else if (sql.includes("SET status = 'failed'")) {
        const idToFail = params[0] as string;
        const entry = entries.find((e) => e.id === idToFail);
        if (entry) entry.status = 'failed';
      } else if (sql.includes('retry_count = retry_count + 1')) {
        const idToRetry = params[0] as string;
        const entry = entries.find((e) => e.id === idToRetry);
        if (entry) entry.retry_count += 1;
      }
      return { changes: 1 };
    }),
    getAllAsync: vi.fn(async (sql: string) => {
      if (sql.includes("WHERE status = 'pending'")) {
        return entries
          .filter((e) => e.status === 'pending')
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
      }
      return entries.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }),
    getFirstAsync: vi.fn(async (_sql: string, ...params: unknown[]) => {
      const id = params[0] as string;
      return entries.find((e) => e.id === id) ?? null;
    }),
    _entries: entries,
  } as any;
}

// ─── Custom Generators ──────────────────────────────────────────────────────

const TABLE_NAMES = ['recipes', 'ingredients', 'pantry_entries', 'menu_plans', 'shopping_lists'];
const OPERATIONS: MutationType[] = ['create', 'update', 'delete'];

/** Generates a valid table name */
const arbTableName = fc.constantFrom(...TABLE_NAMES);

/** Generates a valid mutation operation type */
const arbOperation = fc.constantFrom(...OPERATIONS);

/** Generates a random entity ID */
const arbEntityId = fc.string({ minLength: 1, maxLength: 36 }).filter((s) => s.trim().length > 0);

/** Generates a random payload object */
const arbPayload = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.oneof(fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.string()),
});

/** Generates a single mutation descriptor */
const arbMutation = fc.record({
  operation: arbOperation,
  table: arbTableName,
  entityId: arbEntityId,
  payload: arbPayload,
});

/** Generates a non-empty sequence of mutations (between 2 and 30 items) */
const arbMutationSequence = fc.array(arbMutation, { minLength: 2, maxLength: 30 });

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Feature: platoplan-web-supabase, Property 4: Offline queue preserves chronological order', () => {
  let db: ReturnType<typeof createInMemoryDb>;
  let queue: OfflineQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createInMemoryDb();
    queue = new OfflineQueue(db);
  });

  /**
   * Property 4: Offline queue preserves chronological order
   *
   * For any sequence of mutations enqueued, the dequeue operation SHALL
   * return them in the exact same chronological order they were enqueued.
   *
   * **Validates: Requirements 6.2, 6.3**
   */
  it('should preserve the enqueue order when dequeuing (chronological order)', async () => {
    await fc.assert(
      fc.asyncProperty(arbMutationSequence, async (mutations) => {
        // Reset the in-memory database for each run
        db = createInMemoryDb();
        queue = new OfflineQueue(db);
        await queue.initialize();

        // Enqueue all mutations sequentially — this guarantees ordering
        const enqueuedIds: string[] = [];
        for (const mutation of mutations) {
          const entry = await queue.enqueue(
            mutation.operation,
            mutation.table,
            mutation.entityId,
            mutation.payload
          );
          enqueuedIds.push(entry.id);
        }

        // Dequeue and verify the order matches the enqueue order
        const dequeued = await queue.dequeue();

        // The number of dequeued entries must match the number enqueued
        expect(dequeued).toHaveLength(mutations.length);

        // Each entry should be in the same order as enqueued
        for (let i = 0; i < dequeued.length; i++) {
          expect(dequeued[i].id).toBe(enqueuedIds[i]);
        }

        // Verify created_at timestamps are in non-decreasing order
        for (let i = 1; i < dequeued.length; i++) {
          expect(dequeued[i].created_at >= dequeued[i - 1].created_at).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve operation types and table names in chronological order', async () => {
    await fc.assert(
      fc.asyncProperty(arbMutationSequence, async (mutations) => {
        db = createInMemoryDb();
        queue = new OfflineQueue(db);
        await queue.initialize();

        // Enqueue all mutations
        for (const mutation of mutations) {
          await queue.enqueue(mutation.operation, mutation.table, mutation.entityId, mutation.payload);
        }

        // Dequeue and verify metadata matches in order
        const dequeued = await queue.dequeue();

        expect(dequeued).toHaveLength(mutations.length);

        for (let i = 0; i < dequeued.length; i++) {
          expect(dequeued[i].operation).toBe(mutations[i].operation);
          expect(dequeued[i].table_name).toBe(mutations[i].table);
          expect(dequeued[i].entity_id).toBe(mutations[i].entityId);
          expect(dequeued[i].payload).toBe(JSON.stringify(mutations[i].payload));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should only dequeue pending entries in order (failed entries are excluded)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbMutationSequence,
        fc.integer({ min: 0, max: 29 }),
        async (mutations, failIndex) => {
          db = createInMemoryDb();
          queue = new OfflineQueue(db);
          await queue.initialize();

          // Clamp failIndex to valid range
          const clampedFailIndex = failIndex % mutations.length;

          // Enqueue all mutations
          const enqueuedEntries: SyncQueueEntry[] = [];
          for (const mutation of mutations) {
            const entry = await queue.enqueue(
              mutation.operation,
              mutation.table,
              mutation.entityId,
              mutation.payload
            );
            enqueuedEntries.push(entry);
          }

          // Mark one entry as failed
          await queue.markFailed(enqueuedEntries[clampedFailIndex].id);

          // Dequeue should return all except the failed one, still in order
          const dequeued = await queue.dequeue();

          const expectedPending = enqueuedEntries.filter((_, idx) => idx !== clampedFailIndex);
          expect(dequeued).toHaveLength(expectedPending.length);

          for (let i = 0; i < dequeued.length; i++) {
            expect(dequeued[i].id).toBe(expectedPending[i].id);
          }

          // Verify the remaining dequeued entries are still in chronological order
          for (let i = 1; i < dequeued.length; i++) {
            expect(dequeued[i].created_at >= dequeued[i - 1].created_at).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
