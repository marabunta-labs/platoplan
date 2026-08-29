import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations } from './migrations';

describe('migrations', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      execAsync: vi.fn().mockResolvedValue(undefined),
      getFirstAsync: vi.fn().mockResolvedValue({ user_version: 0 }),
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
      expect(execCalls).toContain('PRAGMA user_version = 4;');
    });

    it('should skip migrations when already at current version', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 4 });

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
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 4 });
      await runMigrations(mockDb);

      // Second run should not execute any SQL
      expect(mockDb.execAsync).not.toHaveBeenCalled();
    });

    it('should apply v3 migration to create sync tables', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ user_version: 0 });

      await runMigrations(mockDb);

      const execCalls = mockDb.execAsync.mock.calls.map((c: any[]) => c[0]);
      const syncSql = execCalls.find((sql: string) =>
        sql.includes('CREATE TABLE IF NOT EXISTS _sync_queue')
      );
      expect(syncSql).toBeDefined();

      // Verify sync queue table schema
      expect(syncSql).toContain('CREATE TABLE IF NOT EXISTS _sync_queue');
      expect(syncSql).toContain("operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete'))");
      expect(syncSql).toContain("status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'failed'))");
      expect(syncSql).toContain('retry_count INTEGER NOT NULL DEFAULT 0');

      // Verify sync meta table
      expect(syncSql).toContain('CREATE TABLE IF NOT EXISTS _sync_meta');
      expect(syncSql).toContain('last_synced_at TEXT');

      // Verify index
      expect(syncSql).toContain('CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON _sync_queue(status, created_at)');
    });

    it('should only apply v3 and v4 when upgrading from v2', async () => {
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

      // Should set version to 4
      expect(execCalls).toContain('PRAGMA user_version = 4;');
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
