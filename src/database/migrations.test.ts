import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations } from './migrations';

describe('migrations', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      execAsync: vi.fn().mockResolvedValue(undefined),
      getFirstAsync: vi.fn().mockResolvedValue({ user_version: 0 }),
      // Column-existence checks (PRAGMA table_info) used by v2/v4/v5/v6.
      // Returning [] means columns are treated as missing, so ALTERs run.
      // v7 calls PRAGMA foreign_key_list(plan_assignments) — return [] so the
      // CASCADE is treated as not yet present and the rebuild runs.
      getAllAsync: vi.fn().mockResolvedValue([]),
      // v7 rebuilds tables inside a transaction.
      withTransactionAsync: vi.fn(async (cb: () => Promise<void>) => { await cb(); }),
    };
  });

  describe('runMigrations', () => {
    it('should apply v1 schema when user_version is 0', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 0 });

      await runMigrations(mockDb);

      // Should check current version
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith('PRAGMA user_version;');

      // Should apply the schema
      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      const schemaSql = execCalls.find((sql: string) =>
        sql.includes('CREATE TABLE IF NOT EXISTS recipes')
      );
      expect(schemaSql).toBeDefined();

      // Verify all tables are in the schema
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS recipes');
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS ingredients');
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS recipe_ingredients');
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS pantry_entries');
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS menu_plans');
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS plan_assignments');
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS free_days');
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS shopping_lists');
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS shopping_list_items');

      // Verify indexes
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe');
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient');
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_plan_assignments_plan');
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list');
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_pantry_entries_ingredient');
    });

    it('should set user_version after applying migrations', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 0 });

      await runMigrations(mockDb);

      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      expect(execCalls).toContain('PRAGMA user_version = 7;');
    });

    it('should skip migrations when already at current version', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 7 });

      await runMigrations(mockDb);

      // Should only call getFirstAsync, not execAsync
      expect(mockDb.execAsync).not.toHaveBeenCalled();
    });

    it('should be idempotent - running twice produces same result', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 0 });
      await runMigrations(mockDb);

      const firstRunCalls = mockDb.execAsync.mock.calls.length;

      // Reset and simulate already migrated
      mockDb.execAsync.mockClear();
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 7 });
      await runMigrations(mockDb);

      // Second run should not execute any SQL
      expect(mockDb.execAsync).not.toHaveBeenCalled();
    });

    it('should apply v3 migration to create sync tables', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 0 });

      await runMigrations(mockDb);

      // v3 runs each statement as a separate execAsync call, so we look across
      // all of them rather than expecting everything in a single SQL string.
      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      const allSql = execCalls.join('\n');

      const syncQueueSql = execCalls.find((sql: string) =>
        sql.includes('CREATE TABLE IF NOT EXISTS _sync_queue')
      );
      expect(syncQueueSql).toBeDefined();

      // Verify sync queue table schema
      expect(syncQueueSql).toContain("operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete'))");
      expect(syncQueueSql).toContain("status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'failed'))");
      expect(syncQueueSql).toContain('retry_count INTEGER NOT NULL DEFAULT 0');

      // Verify sync meta table
      expect(allSql).toContain('CREATE TABLE IF NOT EXISTS _sync_meta');
      expect(allSql).toContain('last_synced_at TEXT');

      // Verify index
      expect(allSql).toContain('CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON _sync_queue(status, created_at)');
    });

    it('should apply v3 onward (not v1/v2) when upgrading from v2', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 2 });

      await runMigrations(mockDb);

      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);

      // Should NOT apply v1 or v2
      const hasV1 = execCalls.some((sql: string) =>
        sql.includes('CREATE TABLE IF NOT EXISTS recipes')
      );
      expect(hasV1).toBe(false);

      const hasV2 = execCalls.some((sql: string) =>
        sql.includes('ALTER TABLE recipe_ingredients')
      );
      expect(hasV2).toBe(false);

      // Should apply v3
      const hasV3 = execCalls.some((sql: string) =>
        sql.includes('CREATE TABLE IF NOT EXISTS _sync_queue')
      );
      expect(hasV3).toBe(true);

      // Should apply v4
      const hasV4 = execCalls.some((sql: string) =>
        sql.includes('ALTER TABLE recipes ADD COLUMN description')
      );
      expect(hasV4).toBe(true);

      // Should set version to the current schema version
      expect(execCalls).toContain('PRAGMA user_version = 7;');
    });

    it('should apply v7 rebuild adding ON DELETE CASCADE to plan_assignments and shopping_list_items', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 6 });
      // foreign_key_list returns no CASCADE yet → rebuild should run.
      mockDb.getAllAsync.mockResolvedValue([{ table: 'recipes', on_delete: 'NO ACTION' }]);

      await runMigrations(mockDb);

      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      const allSql = execCalls.join('\n');

      // Rebuilt tables include the CASCADE foreign keys.
      expect(allSql).toContain('CREATE TABLE plan_assignments_new');
      expect(allSql).toContain('recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE');
      expect(allSql).toContain('CREATE TABLE shopping_list_items_new');
      expect(allSql).toContain('ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE');
      // Old tables dropped and new ones renamed into place.
      expect(allSql).toContain('DROP TABLE plan_assignments;');
      expect(allSql).toContain('ALTER TABLE plan_assignments_new RENAME TO plan_assignments;');
      expect(allSql).toContain('DROP TABLE shopping_list_items;');
      expect(allSql).toContain('ALTER TABLE shopping_list_items_new RENAME TO shopping_list_items;');
      // Runs inside a transaction with FK enforcement toggled around it.
      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
      expect(execCalls).toContain('PRAGMA foreign_keys = OFF;');
      expect(execCalls).toContain('PRAGMA foreign_keys = ON;');
      expect(execCalls).toContain('PRAGMA user_version = 7;');
    });

    it('should skip the v7 rebuild when CASCADE is already present', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 6 });
      // foreign_key_list already reports CASCADE → rebuild is skipped.
      mockDb.getAllAsync.mockResolvedValue([{ table: 'recipes', on_delete: 'CASCADE' }]);

      await runMigrations(mockDb);

      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      const allSql = execCalls.join('\n');
      expect(allSql).not.toContain('CREATE TABLE plan_assignments_new');
      expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
      // Version is still advanced to 7.
      expect(execCalls).toContain('PRAGMA user_version = 7;');
    });

    it('should handle null user_version (fresh database)', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await runMigrations(mockDb);

      // Should still apply migrations when result is null
      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      const hasSchema = execCalls.some((sql: string) =>
        sql.includes('CREATE TABLE IF NOT EXISTS recipes')
      );
      expect(hasSchema).toBe(true);
    });

    it('should include CHECK constraints in schema', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 0 });

      await runMigrations(mockDb);

      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      const schemaSql = execCalls.find((sql: string) =>
        sql.includes('CREATE TABLE IF NOT EXISTS recipes')
      );

      // Verify CHECK constraints
      expect(schemaSql).toContain("CHECK(meal_type IN ('comida', 'cena', 'ambas'))");
      expect(schemaSql).toContain("CHECK(prep_time IN ('rapido', 'elaborado'))");
      expect(schemaSql).toContain("CHECK(unit IN ('gramos', 'mililitros', 'unidades'))");
      expect(schemaSql).toContain('CHECK(purchase_format_quantity > 0)');
      expect(schemaSql).toContain('CHECK(quantity > 0)');
      expect(schemaSql).toContain('CHECK(period_days BETWEEN 1 AND 30)');
      expect(schemaSql).toContain("CHECK(status IN ('draft', 'confirmed'))");
      expect(schemaSql).toContain("CHECK(slot IN ('comida', 'cena'))");
      expect(schemaSql).toContain("CHECK(type IN ('comida', 'cena', 'ambas'))");
      expect(schemaSql).toContain('CHECK(purchase_units >= 0)');
    });

    it('should include foreign key references in schema', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 0 });

      await runMigrations(mockDb);

      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      const schemaSql = execCalls.find((sql: string) =>
        sql.includes('CREATE TABLE IF NOT EXISTS recipes')
      );

      // Verify foreign keys
      expect(schemaSql).toContain('REFERENCES recipes(id) ON DELETE CASCADE');
      expect(schemaSql).toContain('REFERENCES ingredients(id) ON DELETE CASCADE');
      expect(schemaSql).toContain('REFERENCES menu_plans(id) ON DELETE CASCADE');
      expect(schemaSql).toContain('REFERENCES shopping_lists(id) ON DELETE CASCADE');
      expect(schemaSql).toContain('REFERENCES recipes(id)');
      expect(schemaSql).toContain('REFERENCES ingredients(id)');
    });
  });
});
