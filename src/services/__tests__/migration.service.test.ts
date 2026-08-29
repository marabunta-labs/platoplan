/**
 * PlatoPlan - MigrationService Unit Tests
 *
 * Tests the migration service's ability to:
 * - Detect when migration is needed
 * - Upload entities in FK-safe order
 * - Handle partial failures gracefully
 * - Mark synced tables upon completion
 * - Retry failed entities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MigrationService,
  MIGRATION_TABLE_ORDER,
  type MigrationFailure,
} from '../migration.service';

// --- Mock Helpers ---

/** Creates a mock SQLiteDatabase with configurable responses. */
function createMockDb(options: {
  tables?: Record<string, Record<string, unknown>[]>;
  syncMetaExists?: boolean;
  syncMetaCount?: number;
}) {
  const { tables = {}, syncMetaExists = false, syncMetaCount = 0 } = options;
  const executedStatements: string[] = [];
  const runStatements: { sql: string; params: unknown[] }[] = [];

  const db = {
    getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('sqlite_master')) {
        const tableName = params[0] as string;
        if (tableName === '_sync_meta') {
          return { count: syncMetaExists ? 1 : 0 };
        }
        // Check if it's one of our configured tables
        return { count: tables[tableName] ? 1 : 0 };
      }
      if (sql.includes('COUNT(*)') && sql.includes('_sync_meta')) {
        return { count: syncMetaCount };
      }
      if (sql.includes('COUNT(*)')) {
        // Extract table name from SELECT COUNT(*) as count FROM <table>
        const match = sql.match(/FROM\s+(\w+)/i);
        if (match) {
          const rows = tables[match[1]] || [];
          return { count: rows.length };
        }
      }
      // fetchLocalRowById
      if (sql.includes('WHERE id = ?')) {
        const match = sql.match(/FROM\s+(\w+)/i);
        if (match) {
          const rows = tables[match[1]] || [];
          return rows.find((r) => r.id === params[0]) ?? null;
        }
      }
      if (sql.includes('WHERE recipe_id = ? AND ingredient_id = ?')) {
        const rows = tables['recipe_ingredients'] || [];
        return rows.find(
          (r) => r.recipe_id === params[0] && r.ingredient_id === params[1]
        ) ?? null;
      }
      return null;
    }),
    getAllAsync: vi.fn(async (sql: string) => {
      const match = sql.match(/FROM\s+(\w+)/i);
      if (match) {
        return tables[match[1]] || [];
      }
      return [];
    }),
    execAsync: vi.fn(async (sql: string) => {
      executedStatements.push(sql);
    }),
    runAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      runStatements.push({ sql, params });
      return { changes: 1 };
    }),
    _executedStatements: executedStatements,
    _runStatements: runStatements,
  };

  return db as any;
}

/** Creates a mock Supabase client. */
function createMockSupabaseClient(options: {
  shouldFail?: Record<string, string[]>; // table -> entityIds that should fail
} = {}) {
  const { shouldFail = {} } = options;
  const insertedRows: { table: string; data: unknown }[] = [];

  const client = {
    from: vi.fn((table: string) => ({
      upsert: vi.fn((data: Record<string, unknown>, opts?: { onConflict: string }) => {
        const entityId = (data.id ?? `${data.recipe_id}:${data.ingredient_id}`) as string;
        const failIds = shouldFail[table] || [];

        if (failIds.includes(entityId)) {
          return { error: { message: `Insert failed for ${entityId}`, code: '23505' } };
        }

        insertedRows.push({ table, data });
        return { error: null };
      }),
    })),
    _insertedRows: insertedRows,
  };

  return client as any;
}

describe('MigrationService', () => {
  let service: MigrationService;

  beforeEach(() => {
    service = new MigrationService();
  });

  describe('detectMigrationNeeded', () => {
    it('returns false when _sync_meta has synced records', async () => {
      const db = createMockDb({
        syncMetaExists: true,
        syncMetaCount: 3,
        tables: { ingredients: [{ id: '1', name: 'Salt' }] },
      });

      const result = await service.detectMigrationNeeded(db);
      expect(result).toBe(false);
    });

    it('returns false when no local data exists', async () => {
      const db = createMockDb({
        syncMetaExists: false,
        tables: {},
      });

      const result = await service.detectMigrationNeeded(db);
      expect(result).toBe(false);
    });

    it('returns true when local data exists and no sync meta', async () => {
      const db = createMockDb({
        syncMetaExists: false,
        tables: { ingredients: [{ id: '1', name: 'Salt' }] },
      });

      const result = await service.detectMigrationNeeded(db);
      expect(result).toBe(true);
    });

    it('returns true when sync meta exists but has no synced records', async () => {
      const db = createMockDb({
        syncMetaExists: true,
        syncMetaCount: 0,
        tables: { recipes: [{ id: 'r1', name: 'Paella' }] },
      });

      const result = await service.detectMigrationNeeded(db);
      expect(result).toBe(true);
    });
  });

  describe('migrate', () => {
    it('uploads all entities successfully', async () => {
      const tables = {
        ingredients: [
          { id: 'ing1', name: 'Salt', unit: 'gramos', purchase_format_desc: 'bag', purchase_format_quantity: 500, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        recipes: [
          { id: 'rec1', name: 'Pasta', meal_type: 'comida', prep_time: 'rapido', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        recipe_ingredients: [
          { recipe_id: 'rec1', ingredient_id: 'ing1', quantity: 10, updated_at: '2024-01-01' },
        ],
        pantry_entries: [],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient();
      const userId = 'user-123';

      const result = await service.migrate(db, supabase, userId);

      expect(result.succeeded).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      expect(result.succeeded).toContain('ingredients:ing1');
      expect(result.succeeded).toContain('recipes:rec1');
      expect(result.succeeded).toContain('recipe_ingredients:rec1:ing1');
    });

    it('handles partial failures and tracks which entities failed', async () => {
      const tables = {
        ingredients: [
          { id: 'ing1', name: 'Salt', unit: 'gramos', purchase_format_desc: 'bag', purchase_format_quantity: 500, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
          { id: 'ing2', name: 'Pepper', unit: 'gramos', purchase_format_desc: 'jar', purchase_format_quantity: 100, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        recipes: [],
        recipe_ingredients: [],
        pantry_entries: [],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient({
        shouldFail: { ingredients: ['ing2'] },
      });
      const userId = 'user-123';

      const result = await service.migrate(db, supabase, userId);

      expect(result.succeeded).toContain('ingredients:ing1');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({
        table: 'ingredients',
        id: 'ing2',
        error: 'Insert failed for ing2',
      });
    });

    it('adds user_id to all uploaded rows', async () => {
      const tables = {
        ingredients: [
          { id: 'ing1', name: 'Salt', unit: 'gramos', purchase_format_desc: 'bag', purchase_format_quantity: 500, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        recipes: [],
        recipe_ingredients: [],
        pantry_entries: [],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient();
      const userId = 'user-abc';

      await service.migrate(db, supabase, userId);

      const insertedRow = supabase._insertedRows[0];
      expect(insertedRow.data).toHaveProperty('user_id', 'user-abc');
    });

    it('preserves original IDs in uploaded rows', async () => {
      const tables = {
        ingredients: [
          { id: 'my-uuid-123', name: 'Salt', unit: 'gramos', purchase_format_desc: 'bag', purchase_format_quantity: 500, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        recipes: [],
        recipe_ingredients: [],
        pantry_entries: [],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient();
      const userId = 'user-123';

      await service.migrate(db, supabase, userId);

      const insertedRow = supabase._insertedRows[0];
      expect(insertedRow.data).toHaveProperty('id', 'my-uuid-123');
    });

    it('marks synced tables in _sync_meta', async () => {
      const tables = {
        ingredients: [
          { id: 'ing1', name: 'Salt', unit: 'gramos', purchase_format_desc: 'bag', purchase_format_quantity: 500, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        recipes: [],
        recipe_ingredients: [],
        pantry_entries: [],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient();
      const userId = 'user-123';

      await service.migrate(db, supabase, userId);

      // Should have called runAsync to INSERT OR REPLACE into _sync_meta
      const syncMetaInserts = db._runStatements.filter(
        (s: { sql: string }) => s.sql.includes('_sync_meta')
      );
      // All tables should be marked as synced since none failed
      expect(syncMetaInserts.length).toBe(MIGRATION_TABLE_ORDER.length);
    });

    it('does not mark tables with failures as synced', async () => {
      const tables = {
        ingredients: [
          { id: 'ing1', name: 'Salt', unit: 'gramos', purchase_format_desc: 'bag', purchase_format_quantity: 500, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        recipes: [],
        recipe_ingredients: [],
        pantry_entries: [],
        menu_plans: [],
        plan_assignments: [],
        free_days: [],
        shopping_lists: [],
        shopping_list_items: [],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient({
        shouldFail: { ingredients: ['ing1'] },
      });
      const userId = 'user-123';

      await service.migrate(db, supabase, userId);

      const syncMetaInserts = db._runStatements.filter(
        (s: { sql: string }) => s.sql.includes('_sync_meta')
      );
      // ingredients table should NOT be marked as synced
      const ingredientInsert = syncMetaInserts.find(
        (s: { params: unknown[] }) => s.params[0] === 'ingredients'
      );
      expect(ingredientInsert).toBeUndefined();
    });

    it('uploads tables in correct FK order', async () => {
      const tables = {
        ingredients: [{ id: 'ing1', name: 'Salt', unit: 'gramos', purchase_format_desc: 'bag', purchase_format_quantity: 500, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' }],
        recipes: [{ id: 'rec1', name: 'Pasta', meal_type: 'comida', prep_time: 'rapido', created_at: '2024-01-01', updated_at: '2024-01-01' }],
        recipe_ingredients: [{ recipe_id: 'rec1', ingredient_id: 'ing1', quantity: 10, updated_at: '2024-01-01' }],
        pantry_entries: [{ id: 'pe1', ingredient_id: 'ing1', quantity: 200, updated_at: '2024-01-01' }],
        menu_plans: [{ id: 'mp1', period_days: 7, start_date: '2024-01-01', status: 'draft', elaborate_days_config: '[]', created_at: '2024-01-01', updated_at: '2024-01-01' }],
        plan_assignments: [{ id: 'pa1', plan_id: 'mp1', day_index: 0, slot: 'comida', recipe_id: 'rec1', updated_at: '2024-01-01' }],
        free_days: [{ id: 'fd1', plan_id: 'mp1', day_index: 1, type: 'ambas', updated_at: '2024-01-01' }],
        shopping_lists: [{ id: 'sl1', plan_id: 'mp1', generated_at: '2024-01-01', is_stale: 0 }],
        shopping_list_items: [{ id: 'sli1', list_id: 'sl1', ingredient_id: 'ing1', total_quantity_needed: 10, pantry_quantity_deducted: 5, net_quantity: 5, purchase_units: 1, is_manually_edited: 0, is_removed: 0, updated_at: '2024-01-01' }],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient();
      const userId = 'user-123';

      const result = await service.migrate(db, supabase, userId);

      // All should succeed
      expect(result.succeeded).toHaveLength(9);
      expect(result.failed).toHaveLength(0);

      // Verify the order of supabase.from() calls
      const fromCalls = supabase.from.mock.calls.map((c: string[]) => c[0]);
      const expectedOrder = [...MIGRATION_TABLE_ORDER];

      // Filter to only include tables that actually had data
      let lastIdx = -1;
      for (const tableName of expectedOrder) {
        const idx = fromCalls.indexOf(tableName);
        if (idx !== -1) {
          expect(idx).toBeGreaterThan(lastIdx);
          lastIdx = idx;
        }
      }
    });
  });

  describe('retryFailed', () => {
    it('retries only the specified failed entities', async () => {
      const tables = {
        ingredients: [
          { id: 'ing2', name: 'Pepper', unit: 'gramos', purchase_format_desc: 'jar', purchase_format_quantity: 100, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient();
      const userId = 'user-123';

      const failures: MigrationFailure[] = [
        { table: 'ingredients', id: 'ing2', error: 'Network error' },
      ];

      const result = await service.retryFailed(db, supabase, userId, failures);

      expect(result.succeeded).toContain('ingredients:ing2');
      expect(result.failed).toHaveLength(0);
    });

    it('handles entities that no longer exist locally', async () => {
      const tables = {
        ingredients: [], // ing2 no longer exists
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient();
      const userId = 'user-123';

      const failures: MigrationFailure[] = [
        { table: 'ingredients', id: 'ing2', error: 'Network error' },
      ];

      const result = await service.retryFailed(db, supabase, userId, failures);

      // Should be treated as succeeded (entity was deleted locally)
      expect(result.succeeded).toContain('ingredients:ing2');
      expect(result.failed).toHaveLength(0);
    });

    it('reports failures that still fail on retry', async () => {
      const tables = {
        ingredients: [
          { id: 'ing2', name: 'Pepper', unit: 'gramos', purchase_format_desc: 'jar', purchase_format_quantity: 100, category: 'spices', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
      };

      const db = createMockDb({ tables });
      const supabase = createMockSupabaseClient({
        shouldFail: { ingredients: ['ing2'] },
      });
      const userId = 'user-123';

      const failures: MigrationFailure[] = [
        { table: 'ingredients', id: 'ing2', error: 'Network error' },
      ];

      const result = await service.retryFailed(db, supabase, userId, failures);

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].table).toBe('ingredients');
      expect(result.failed[0].id).toBe('ing2');
    });
  });

  describe('MIGRATION_TABLE_ORDER', () => {
    it('has all 9 tables in the correct order', () => {
      expect(MIGRATION_TABLE_ORDER).toEqual([
        'ingredients',
        'recipes',
        'recipe_ingredients',
        'pantry_entries',
        'menu_plans',
        'plan_assignments',
        'free_days',
        'shopping_lists',
        'shopping_list_items',
      ]);
    });

    it('places parent tables before child tables', () => {
      const indexOf = (t: string) => MIGRATION_TABLE_ORDER.indexOf(t as any);

      // ingredients before recipe_ingredients and pantry_entries
      expect(indexOf('ingredients')).toBeLessThan(indexOf('recipe_ingredients'));
      expect(indexOf('ingredients')).toBeLessThan(indexOf('pantry_entries'));

      // recipes before recipe_ingredients and plan_assignments
      expect(indexOf('recipes')).toBeLessThan(indexOf('recipe_ingredients'));
      expect(indexOf('recipes')).toBeLessThan(indexOf('plan_assignments'));

      // menu_plans before plan_assignments, free_days, shopping_lists
      expect(indexOf('menu_plans')).toBeLessThan(indexOf('plan_assignments'));
      expect(indexOf('menu_plans')).toBeLessThan(indexOf('free_days'));
      expect(indexOf('menu_plans')).toBeLessThan(indexOf('shopping_lists'));

      // shopping_lists before shopping_list_items
      expect(indexOf('shopping_lists')).toBeLessThan(indexOf('shopping_list_items'));
    });
  });
});
