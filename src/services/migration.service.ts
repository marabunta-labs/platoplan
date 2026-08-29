/**
 * PlatoPlan - Migration Service
 *
 * Handles one-time migration of existing local SQLite data to Supabase
 * when a user authenticates for the first time with pre-existing local data.
 *
 * Responsibilities:
 * - Detect whether migration is needed (local data exists + no sync metadata)
 * - Upload all entities table-by-table in foreign-key-safe order
 * - Track succeeded/failed entities for partial failure handling
 * - Mark local data as synced upon completion
 *
 * Table upload order (for FK safety):
 * 1. ingredients
 * 2. recipes
 * 3. recipe_ingredients (depends on recipes + ingredients)
 * 4. pantry_entries (depends on ingredients)
 * 5. menu_plans
 * 6. plan_assignments (depends on menu_plans + recipes)
 * 7. free_days (depends on menu_plans)
 * 8. shopping_lists (depends on menu_plans)
 * 9. shopping_list_items (depends on shopping_lists + ingredients)
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Result of a migration entity upload attempt. */
export interface MigrationFailure {
  table: string;
  id: string;
  error: string;
}

/** Overall result of the migration process. */
export interface MigrationResult {
  succeeded: string[];
  failed: MigrationFailure[];
}

/**
 * Ordered list of tables to migrate, respecting foreign key dependencies.
 * Parent tables come before child tables.
 */
export const MIGRATION_TABLE_ORDER = [
  'ingredients',
  'recipes',
  'recipe_ingredients',
  'pantry_entries',
  'menu_plans',
  'plan_assignments',
  'free_days',
  'shopping_lists',
  'shopping_list_items',
] as const;

export type MigratableTable = (typeof MIGRATION_TABLE_ORDER)[number];

/**
 * MigrationService handles the one-time upload of local data to Supabase.
 */
export class MigrationService {
  /**
   * Detects whether migration is needed.
   *
   * Migration is needed when:
   * 1. Local SQLite contains existing data (any table has rows)
   * 2. No _sync_meta records exist (first-time sync for this user)
   *
   * @param db - The local SQLite database instance
   * @returns true if migration is needed, false otherwise
   */
  async detectMigrationNeeded(db: SQLiteDatabase): Promise<boolean> {
    // Check if _sync_meta table exists and has records
    const syncMetaExists = await this.tableExists(db, '_sync_meta');
    if (syncMetaExists) {
      const metaCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM _sync_meta WHERE last_synced_at IS NOT NULL'
      );
      if (metaCount && metaCount.count > 0) {
        // Already synced before — no migration needed
        return false;
      }
    }

    // Check if there is any local data across the main tables
    const hasData = await this.hasLocalData(db);
    return hasData;
  }

  /**
   * Performs the full migration: uploads all local entities to Supabase
   * in FK-safe order, preserving IDs, relationships, and timestamps.
   *
   * @param db - The local SQLite database instance
   * @param supabaseClient - Configured Supabase client
   * @param userId - The authenticated user's ID
   * @returns MigrationResult with succeeded entity IDs and failed entries
   */
  async migrate(
    db: SQLiteDatabase,
    supabaseClient: SupabaseClient,
    userId: string
  ): Promise<MigrationResult> {
    const result: MigrationResult = { succeeded: [], failed: [] };

    for (const table of MIGRATION_TABLE_ORDER) {
      const rows = await this.fetchLocalRows(db, table);

      for (const row of rows) {
        try {
          const remoteRow = this.mapToRemoteRow(table, row, userId);
          const entityId = this.getEntityId(table, row);

          const { error } = await supabaseClient
            .from(table)
            .upsert(remoteRow, { onConflict: this.getPrimaryKeyColumns(table) });

          if (error) {
            result.failed.push({ table, id: entityId, error: error.message });
          } else {
            result.succeeded.push(`${table}:${entityId}`);
          }
        } catch (err) {
          const entityId = this.getEntityId(table, row);
          const errorMessage = err instanceof Error ? err.message : String(err);
          result.failed.push({ table, id: entityId, error: errorMessage });
        }
      }
    }

    // Mark local data as synced for all tables that fully succeeded
    await this.markSyncedTables(db, result);

    return result;
  }

  /**
   * Retries migration for a specific set of failed entities.
   *
   * @param db - The local SQLite database instance
   * @param supabaseClient - Configured Supabase client
   * @param userId - The authenticated user's ID
   * @param failures - The subset of failures to retry
   * @returns MigrationResult for the retry attempt
   */
  async retryFailed(
    db: SQLiteDatabase,
    supabaseClient: SupabaseClient,
    userId: string,
    failures: MigrationFailure[]
  ): Promise<MigrationResult> {
    const result: MigrationResult = { succeeded: [], failed: [] };

    // Group failures by table to process in FK-safe order
    const failuresByTable = new Map<string, MigrationFailure[]>();
    for (const failure of failures) {
      const list = failuresByTable.get(failure.table) || [];
      list.push(failure);
      failuresByTable.set(failure.table, list);
    }

    for (const table of MIGRATION_TABLE_ORDER) {
      const tableFailures = failuresByTable.get(table);
      if (!tableFailures) continue;

      for (const failure of tableFailures) {
        try {
          const row = await this.fetchLocalRowById(db, table, failure.id);
          if (!row) {
            // Entity no longer exists locally — skip
            result.succeeded.push(`${table}:${failure.id}`);
            continue;
          }

          const remoteRow = this.mapToRemoteRow(table, row, userId);

          const { error } = await supabaseClient
            .from(table)
            .upsert(remoteRow, { onConflict: this.getPrimaryKeyColumns(table) });

          if (error) {
            result.failed.push({ table, id: failure.id, error: error.message });
          } else {
            result.succeeded.push(`${table}:${failure.id}`);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          result.failed.push({ table, id: failure.id, error: errorMessage });
        }
      }
    }

    // Mark synced if all entries for a table are now successful
    await this.markSyncedTables(db, result);

    return result;
  }

  // --- Private Helpers ---

  /**
   * Checks if a table exists in the local SQLite database.
   */
  private async tableExists(db: SQLiteDatabase, tableName: string): Promise<boolean> {
    const result = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
      tableName
    );
    return (result?.count ?? 0) > 0;
  }

  /**
   * Checks if any of the main data tables have rows.
   */
  private async hasLocalData(db: SQLiteDatabase): Promise<boolean> {
    const tablesToCheck = ['ingredients', 'recipes', 'pantry_entries', 'menu_plans', 'shopping_lists'];

    for (const table of tablesToCheck) {
      const exists = await this.tableExists(db, table);
      if (!exists) continue;

      const result = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${table}`
      );
      if (result && result.count > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Fetches all rows from a local SQLite table.
   */
  private async fetchLocalRows(
    db: SQLiteDatabase,
    table: MigratableTable
  ): Promise<Record<string, unknown>[]> {
    return db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }

  /**
   * Fetches a single row by its primary key.
   * Handles composite keys for recipe_ingredients.
   */
  private async fetchLocalRowById(
    db: SQLiteDatabase,
    table: string,
    id: string
  ): Promise<Record<string, unknown> | null> {
    if (table === 'recipe_ingredients') {
      // ID format: "recipe_id:ingredient_id"
      const [recipeId, ingredientId] = id.split(':');
      const row = await db.getFirstAsync<Record<string, unknown>>(
        `SELECT * FROM recipe_ingredients WHERE recipe_id = ? AND ingredient_id = ?`,
        recipeId,
        ingredientId
      );
      return row ?? null;
    }

    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE id = ?`,
      id
    );
    return row ?? null;
  }

  /**
   * Extracts the entity ID from a row, handling composite keys.
   */
  private getEntityId(table: string, row: Record<string, unknown>): string {
    if (table === 'recipe_ingredients') {
      return `${row.recipe_id}:${row.ingredient_id}`;
    }
    return row.id as string;
  }

  /**
   * Returns the primary key column(s) for upsert conflict resolution.
   */
  private getPrimaryKeyColumns(table: string): string {
    if (table === 'recipe_ingredients') {
      return 'recipe_id,ingredient_id';
    }
    return 'id';
  }

  /**
   * Maps a local SQLite row to the remote Supabase row format.
   * Adds user_id and synced_at, preserves all existing data including IDs and timestamps.
   */
  private mapToRemoteRow(
    table: MigratableTable,
    row: Record<string, unknown>,
    userId: string
  ): Record<string, unknown> {
    const now = new Date().toISOString();
    const base = { ...row, user_id: userId, synced_at: now };

    switch (table) {
      case 'ingredients':
        return {
          id: row.id,
          user_id: userId,
          name: row.name,
          unit: row.unit,
          purchase_format_desc: row.purchase_format_desc,
          purchase_format_quantity: row.purchase_format_quantity,
          category: row.category,
          created_at: row.created_at,
          updated_at: row.updated_at,
          synced_at: now,
        };

      case 'recipes':
        return {
          id: row.id,
          user_id: userId,
          name: row.name,
          meal_type: row.meal_type,
          prep_time: row.prep_time,
          created_at: row.created_at,
          updated_at: row.updated_at,
          synced_at: now,
        };

      case 'recipe_ingredients':
        return {
          recipe_id: row.recipe_id,
          ingredient_id: row.ingredient_id,
          user_id: userId,
          quantity: row.quantity,
          created_at: row.created_at ?? now,
          updated_at: row.updated_at ?? now,
          synced_at: now,
        };

      case 'pantry_entries':
        return {
          id: row.id,
          user_id: userId,
          ingredient_id: row.ingredient_id,
          quantity: row.quantity,
          created_at: row.created_at ?? row.updated_at ?? now,
          updated_at: row.updated_at,
          synced_at: now,
        };

      case 'menu_plans':
        return {
          id: row.id,
          user_id: userId,
          period_days: row.period_days,
          start_date: row.start_date,
          status: row.status,
          elaborate_days_config: row.elaborate_days_config,
          created_at: row.created_at,
          updated_at: row.updated_at,
          synced_at: now,
        };

      case 'plan_assignments':
        return {
          id: row.id,
          user_id: userId,
          plan_id: row.plan_id,
          day_index: row.day_index,
          slot: row.slot,
          recipe_id: row.recipe_id,
          created_at: row.created_at ?? now,
          updated_at: row.updated_at ?? now,
          synced_at: now,
        };

      case 'free_days':
        return {
          id: row.id,
          user_id: userId,
          plan_id: row.plan_id,
          day_index: row.day_index,
          type: row.type,
          created_at: row.created_at ?? now,
          updated_at: row.updated_at ?? now,
          synced_at: now,
        };

      case 'shopping_lists':
        return {
          id: row.id,
          user_id: userId,
          plan_id: row.plan_id,
          generated_at: row.generated_at,
          is_stale: row.is_stale,
          created_at: row.created_at ?? row.generated_at ?? now,
          updated_at: row.updated_at ?? now,
          synced_at: now,
        };

      case 'shopping_list_items':
        return {
          id: row.id,
          user_id: userId,
          list_id: row.list_id,
          ingredient_id: row.ingredient_id,
          total_quantity_needed: row.total_quantity_needed,
          pantry_quantity_deducted: row.pantry_quantity_deducted,
          net_quantity: row.net_quantity,
          purchase_units: row.purchase_units,
          is_manually_edited: row.is_manually_edited,
          is_removed: row.is_removed,
          created_at: row.created_at ?? now,
          updated_at: row.updated_at ?? now,
          synced_at: now,
        };

      default:
        return base;
    }
  }

  /**
   * Updates _sync_meta for tables where all entities migrated successfully.
   * A table is considered fully synced if no failures exist for it.
   */
  private async markSyncedTables(
    db: SQLiteDatabase,
    result: MigrationResult
  ): Promise<void> {
    const now = new Date().toISOString();
    const failedTables = new Set(result.failed.map((f) => f.table));

    // Ensure _sync_meta table exists
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS _sync_meta (
        table_name TEXT PRIMARY KEY,
        last_synced_at TEXT
      );
    `);

    for (const table of MIGRATION_TABLE_ORDER) {
      if (!failedTables.has(table)) {
        // All entities for this table succeeded — mark as synced
        await db.runAsync(
          'INSERT OR REPLACE INTO _sync_meta (table_name, last_synced_at) VALUES (?, ?)',
          table,
          now
        );
      }
    }
  }
}
