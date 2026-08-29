import * as SQLite from 'expo-sqlite';

/**
 * Schema version. Increment when adding new migrations.
 */
const CURRENT_VERSION = 5;

/**
 * Runs all pending migrations. Idempotent — safe to call on every app launch.
 * Uses the user_version PRAGMA to track which version has been applied.
 */
export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion >= CURRENT_VERSION) {
    return; // Already up to date
  }

  // Apply migrations in order
  if (currentVersion < 1) {
    await applyMigrationV1(db);
  }
  if (currentVersion < 2) {
    await applyMigrationV2(db);
  }
  if (currentVersion < 3) {
    await applyMigrationV3(db);
  }
  if (currentVersion < 4) {
    await applyMigrationV4(db);
  }
  if (currentVersion < 5) {
    await applyMigrationV5(db);
  }

  // Set the new version
  await db.execAsync(`PRAGMA user_version = ${CURRENT_VERSION};`);
}

/**
 * Migration v1: Creates the initial schema with all 8 tables, indexes, and constraints.
 */
async function applyMigrationV1(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_V1);
}

/**
 * Full initial schema for PlatoPlan.
 * Includes all 8 tables with constraints, foreign keys, and performance indexes.
 */
const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('comida', 'cena', 'ambas')),
  prep_time TEXT NOT NULL CHECK(prep_time IN ('rapido', 'elaborado')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL CHECK(unit IN ('gramos', 'mililitros', 'unidades')),
  purchase_format_desc TEXT NOT NULL,
  purchase_format_quantity REAL NOT NULL CHECK(purchase_format_quantity > 0),
  category TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK(quantity > 0),
  PRIMARY KEY (recipe_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS pantry_entries (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL UNIQUE REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK(quantity > 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_plans (
  id TEXT PRIMARY KEY,
  period_days INTEGER NOT NULL CHECK(period_days BETWEEN 1 AND 30),
  start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'confirmed')),
  elaborate_days_config TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plan_assignments (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  slot TEXT NOT NULL CHECK(slot IN ('comida', 'cena')),
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  UNIQUE(plan_id, day_index, slot)
);

CREATE TABLE IF NOT EXISTS free_days (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('comida', 'cena', 'ambas')),
  UNIQUE(plan_id, day_index, type)
);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_stale INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  total_quantity_needed REAL NOT NULL,
  pantry_quantity_deducted REAL NOT NULL DEFAULT 0,
  net_quantity REAL NOT NULL,
  purchase_units INTEGER NOT NULL CHECK(purchase_units >= 0),
  is_manually_edited INTEGER NOT NULL DEFAULT 0,
  is_removed INTEGER NOT NULL DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_plan_assignments_plan ON plan_assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_pantry_entries_ingredient ON pantry_entries(ingredient_id);
`;


/**
 * Migration v2: Adds `updated_at` column to tables that don't have it,
 * to support last-write-wins conflict resolution for sync.
 * Tables affected: recipe_ingredients, plan_assignments, free_days, shopping_list_items.
 *
 * NOTE: Each ALTER TABLE is run separately and guarded by a column-existence
 * check so this migration is safe to re-run if it was interrupted previously.
 */
async function applyMigrationV2(db: SQLite.SQLiteDatabase): Promise<void> {
  const tables: { table: string; column: string }[] = [
    { table: 'recipe_ingredients', column: 'updated_at' },
    { table: 'plan_assignments', column: 'updated_at' },
    { table: 'free_days', column: 'updated_at' },
    { table: 'shopping_list_items', column: 'updated_at' },
  ];

  for (const { table, column } of tables) {
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
    const hasColumn = cols.some((c) => c.name === column);
    if (!hasColumn) {
      await db.execAsync(
        `ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT (datetime('now'));`
      );
    }
  }
}


/**
 * Migration v3: Creates sync queue and metadata tables.
 * These tables are used by the offline-first sync engine to queue mutations
 * performed while offline and track per-table sync timestamps.
 *
 * NOTE: Each statement is executed separately to avoid Expo SQLite
 * multi-statement parsing issues.
 */
async function applyMigrationV3(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS _sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'failed'))
    );
  `);

  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON _sync_queue(status, created_at);`
  );

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS _sync_meta (
      table_name TEXT PRIMARY KEY,
      last_synced_at TEXT
    );
  `);
}


/**
 * Migration v4: Adds description and servings columns to recipes table.
 * - description: optional free-text field for preparation instructions
 * - servings: number of people the recipe serves (default 2)
 *
 * NOTE: Each ALTER TABLE is executed separately because Expo SQLite's
 * execAsync may not reliably process multiple statements in one call.
 */
async function applyMigrationV4(db: SQLite.SQLiteDatabase): Promise<void> {
  // Check if columns already exist before adding them (safe for re-runs)
  const tableInfo = (await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(recipes);`
  )) ?? [];
  const columnNames = tableInfo.map((col) => col.name);

  if (!columnNames.includes('description')) {
    await db.execAsync(`ALTER TABLE recipes ADD COLUMN description TEXT NOT NULL DEFAULT '';`);
  }
  if (!columnNames.includes('servings')) {
    await db.execAsync(`ALTER TABLE recipes ADD COLUMN servings INTEGER NOT NULL DEFAULT 2;`);
  }
}

/**
 * Migration v5: Adds the servings column to menu_plans so a plan can be
 * generated for a number of diners independent of each recipe's own servings.
 */
async function applyMigrationV5(db: SQLite.SQLiteDatabase): Promise<void> {
  const tableInfo = (await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(menu_plans);`
  )) ?? [];
  const columnNames = tableInfo.map((col) => col.name);

  if (!columnNames.includes('servings')) {
    await db.execAsync(
      `ALTER TABLE menu_plans ADD COLUMN servings INTEGER NOT NULL DEFAULT 2;`
    );
  }
}
