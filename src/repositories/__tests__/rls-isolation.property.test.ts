/**
 * Property-Based Test: RLS isolation guarantees user data separation
 *
 * Feature: platoplan-web-supabase, Property 6: RLS isolation guarantees user data separation
 *
 * **Validates: Requirements 5.2**
 *
 * For any two distinct user IDs and any query on any table, a query executed with
 * user A's credentials SHALL never return rows belonging to user B.
 *
 * Since this cannot test actual RLS policies without a running Supabase instance,
 * we test at the repository level by verifying that all SupabaseIngredientRepository
 * methods pass user_id as a filter in their queries, ensuring data isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { SupabaseIngredientRepository } from '../supabase/ingredient.repository';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CapturedQuery {
  table: string;
  method: string;
  filters: Array<{ column: string; value: unknown }>;
  insertData?: Record<string, unknown>;
}

// ─── Supabase Client Mock ───────────────────────────────────────────────────

const MOCK_ROW = {
  id: 'mock-id',
  user_id: 'will-be-overridden',
  name: 'test',
  unit: 'gramos',
  purchase_format_desc: 'desc',
  purchase_format_quantity: 1,
  category: 'cat',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  synced_at: null,
};

/**
 * Creates a mock Supabase client that captures all query parameters.
 * Uses a PromiseLike pattern: every chainable method returns the same builder,
 * and `.then()` resolves with mock data. The Supabase JS client works this way —
 * the PostgrestBuilder is thenable.
 */
function createCapturingClient(userId?: string) {
  const capturedQueries: CapturedQuery[] = [];

  function createQueryBuilder(tableName: string) {
    const query: CapturedQuery = {
      table: tableName,
      method: 'select',
      filters: [],
    };

    // The builder object implements PromiseLike so `await builder` works
    const builder: any = {
      select(_columns?: string) {
        query.method = query.method === 'insert' ? 'insert' : 'select';
        return builder;
      },
      insert(data: Record<string, unknown>) {
        query.method = 'insert';
        query.insertData = data;
        return builder;
      },
      update(data: Record<string, unknown>) {
        query.method = 'update';
        query.insertData = data;
        return builder;
      },
      delete() {
        query.method = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        query.filters.push({ column, value });
        return builder;
      },
      ilike(_column: string, _pattern: string) {
        return builder;
      },
      order(_column: string, _opts?: unknown) {
        return builder;
      },
      single() {
        capturedQueries.push({ ...query, filters: [...query.filters] });
        const row = { ...MOCK_ROW, user_id: userId ?? 'mock' };
        return Promise.resolve({ data: row, error: null });
      },
      maybeSingle() {
        capturedQueries.push({ ...query, filters: [...query.filters] });
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (value: any) => any, reject?: (reason: any) => any) {
        capturedQueries.push({ ...query, filters: [...query.filters] });
        const result = { data: [], error: null, count: 0 };
        return Promise.resolve(result).then(resolve, reject);
      },
    };

    return builder;
  }

  const client = {
    from: vi.fn((tableName: string) => createQueryBuilder(tableName)),
  };

  return { client: client as any, capturedQueries };
}

/**
 * Creates a mock Supabase client where data is stored for multiple users.
 * Simulates RLS by filtering returned data based on the user_id filter in queries.
 */
function createDataIsolationClient(allRows: Record<string, unknown>[]) {
  function createQueryBuilder(tableName: string) {
    const filters: Array<{ column: string; value: unknown }> = [];
    let method = 'select';

    const builder: any = {
      select(_columns?: string) {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return builder;
      },
      ilike(_column: string, _pattern: string) {
        return builder;
      },
      order(_column: string, _opts?: unknown) {
        return builder;
      },
      maybeSingle() {
        const userIdFilter = filters.find((f) => f.column === 'user_id');
        const idFilter = filters.find((f) => f.column === 'id');
        const filtered = allRows.filter((row: any) => {
          if (userIdFilter && row.user_id !== userIdFilter.value) return false;
          if (idFilter && row.id !== idFilter.value) return false;
          return true;
        });
        return Promise.resolve({ data: filtered[0] ?? null, error: null });
      },
      then(resolve: (value: any) => any, reject?: (reason: any) => any) {
        const userIdFilter = filters.find((f) => f.column === 'user_id');
        const filtered = allRows.filter(
          (row: any) => row.user_id === userIdFilter?.value
        );
        const result = { data: filtered, error: null, count: filtered.length };
        return Promise.resolve(result).then(resolve, reject);
      },
    };

    return builder;
  }

  return { from: vi.fn((tableName: string) => createQueryBuilder(tableName)) } as any;
}

// ─── Custom Generators ──────────────────────────────────────────────────────

/** Generates a valid UUID-like string */
const arbUserId = fc.uuid();

/** Generates two distinct user IDs */
const arbTwoDistinctUserIds = fc.tuple(arbUserId, arbUserId).filter(([a, b]) => a !== b);

/** Repository method names to test */
type RepositoryMethod = 'getAll' | 'getById' | 'search' | 'create' | 'update' | 'delete';
const arbRepositoryMethod: fc.Arbitrary<RepositoryMethod> = fc.constantFrom(
  'getAll',
  'getById',
  'search',
  'create',
  'update',
  'delete'
);

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Feature: platoplan-web-supabase, Property 6: RLS isolation guarantees user data separation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 6: RLS isolation guarantees user data separation
   *
   * For any user ID and any repository method called, the query SHALL always
   * include a user_id filter matching the repository's configured user ID.
   *
   * **Validates: Requirements 5.2**
   */
  it('every repository query includes user_id filter matching the configured user', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbRepositoryMethod,
        async (userId, method) => {
          const { client, capturedQueries } = createCapturingClient(userId);
          const repo = new SupabaseIngredientRepository(client, userId);

          // Execute the repository method
          try {
            switch (method) {
              case 'getAll':
                await repo.getAll();
                break;
              case 'getById':
                await repo.getById('some-entity-id');
                break;
              case 'search':
                await repo.search('test');
                break;
              case 'create':
                await repo.create({
                  name: 'Test Ingredient',
                  unit: 'gramos',
                  purchaseFormat: { description: 'pack', quantity: 1 },
                  category: 'vegetales',
                });
                break;
              case 'update':
                await repo.update('some-entity-id', { name: 'Updated' });
                break;
              case 'delete':
                await repo.delete('some-entity-id');
                break;
            }
          } catch {
            // We only care about verifying the queries were built correctly
          }

          // Verify that at least one query was captured
          expect(capturedQueries.length).toBeGreaterThanOrEqual(1);

          // For every captured query, verify user_id scoping
          for (const query of capturedQueries) {
            if (query.method === 'insert') {
              // For inserts, user_id should be in the inserted data
              expect(query.insertData).toBeDefined();
              expect(query.insertData!.user_id).toBe(userId);
            } else {
              // For select/update/delete, user_id must be in the filters
              const userIdFilter = query.filters.find((f) => f.column === 'user_id');
              expect(userIdFilter).toBeDefined();
              expect(userIdFilter!.value).toBe(userId);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6 (isolation check): For any two distinct user IDs, a repository
   * configured for user A SHALL only include user A's ID in queries, never user B's.
   *
   * **Validates: Requirements 5.2**
   */
  it('repository for user A never references user B in queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTwoDistinctUserIds,
        arbRepositoryMethod,
        async ([userIdA, userIdB], method) => {
          const { client, capturedQueries } = createCapturingClient(userIdA);
          const repoA = new SupabaseIngredientRepository(client, userIdA);

          // Execute a method on repo A
          try {
            switch (method) {
              case 'getAll':
                await repoA.getAll();
                break;
              case 'getById':
                await repoA.getById('entity-123');
                break;
              case 'search':
                await repoA.search('query');
                break;
              case 'create':
                await repoA.create({
                  name: 'Item',
                  unit: 'mililitros',
                  purchaseFormat: { description: 'botella', quantity: 2 },
                  category: 'lácteos',
                });
                break;
              case 'update':
                await repoA.update('entity-123', { name: 'Renamed' });
                break;
              case 'delete':
                await repoA.delete('entity-123');
                break;
            }
          } catch {
            // Ignore errors — we're only verifying query structure
          }

          // Verify no query references user B
          for (const query of capturedQueries) {
            if (query.method === 'insert') {
              expect(query.insertData!.user_id).not.toBe(userIdB);
              expect(query.insertData!.user_id).toBe(userIdA);
            } else {
              // Check all filter values — none should be user B's ID
              for (const filter of query.filters) {
                if (filter.column === 'user_id') {
                  expect(filter.value).not.toBe(userIdB);
                  expect(filter.value).toBe(userIdA);
                }
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6 (data separation at query result level): When rows for both
   * user A and user B exist, the repository for user A SHALL only return
   * rows belonging to user A.
   *
   * **Validates: Requirements 5.2**
   */
  it('getAll for user A returns only user A rows even when user B rows exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTwoDistinctUserIds,
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
            category: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
            category: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async ([userIdA, userIdB], userAItems, userBItems) => {
          // Create rows belonging to both users
          const allRows = [
            ...userAItems.map((item, idx) => ({
              id: `a-${idx}`,
              user_id: userIdA,
              name: item.name,
              unit: 'gramos',
              purchase_format_desc: 'pack',
              purchase_format_quantity: 1,
              category: item.category,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              synced_at: null,
            })),
            ...userBItems.map((item, idx) => ({
              id: `b-${idx}`,
              user_id: userIdB,
              name: item.name,
              unit: 'mililitros',
              purchase_format_desc: 'botella',
              purchase_format_quantity: 2,
              category: item.category,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              synced_at: null,
            })),
          ];

          const client = createDataIsolationClient(allRows);
          const repoA = new SupabaseIngredientRepository(client, userIdA);

          const results = await repoA.getAll();

          // All returned results must belong to user A only
          expect(results).toHaveLength(userAItems.length);

          // No user B data should appear in results
          const resultNames = results.map((r) => r.name);
          for (const result of results) {
            // Verify the result came from user A's data set
            const matchingARow = allRows.find(
              (r) => r.user_id === userIdA && r.name === result.name
            );
            expect(matchingARow).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
