-- PlatoPlan Initial Supabase Schema
-- Mirrors the existing SQLite schema with:
-- - UUID primary keys (matching local SQLite text/UUID format)
-- - user_id for row-level ownership
-- - created_at, updated_at, synced_at timestamps
-- - Row Level Security (RLS) policies for data isolation

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Recipes
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('comida', 'cena', 'ambas')),
  prep_time TEXT NOT NULL CHECK (prep_time IN ('rapido', 'elaborado')),
  description TEXT NOT NULL DEFAULT '',
  servings INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  UNIQUE(user_id, name)
);

-- Ingredients
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('gramos', 'mililitros', 'unidades')),
  purchase_format_desc TEXT NOT NULL,
  purchase_format_quantity REAL NOT NULL CHECK (purchase_format_quantity > 0),
  category TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  UNIQUE(user_id, name)
);

-- Recipe Ingredients (junction table)
CREATE TABLE recipe_ingredients (
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (recipe_id, ingredient_id)
);

-- Pantry Entries
CREATE TABLE pantry_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  UNIQUE(user_id, ingredient_id)
);

-- Menu Plans
CREATE TABLE menu_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_days INTEGER NOT NULL CHECK (period_days BETWEEN 1 AND 30),
  start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  elaborate_days_config TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ
);

-- Plan Assignments
CREATE TABLE plan_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('comida', 'cena')),
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  UNIQUE(plan_id, day_index, slot)
);

-- Free Days
CREATE TABLE free_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('comida', 'cena', 'ambas')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  UNIQUE(plan_id, day_index, type)
);

-- Shopping Lists
CREATE TABLE shopping_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_stale BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ
);

-- Shopping List Items
CREATE TABLE shopping_list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  total_quantity_needed REAL NOT NULL,
  pantry_quantity_deducted REAL NOT NULL DEFAULT 0,
  net_quantity REAL NOT NULL,
  purchase_units INTEGER NOT NULL CHECK (purchase_units >= 0),
  is_manually_edited BOOLEAN NOT NULL DEFAULT false,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_recipes_user ON recipes(user_id);
CREATE INDEX idx_ingredients_user ON ingredients(user_id);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX idx_recipe_ingredients_user ON recipe_ingredients(user_id);
CREATE INDEX idx_pantry_entries_user ON pantry_entries(user_id);
CREATE INDEX idx_pantry_entries_ingredient ON pantry_entries(ingredient_id);
CREATE INDEX idx_menu_plans_user ON menu_plans(user_id);
CREATE INDEX idx_plan_assignments_plan ON plan_assignments(plan_id);
CREATE INDEX idx_plan_assignments_user ON plan_assignments(user_id);
CREATE INDEX idx_free_days_plan ON free_days(plan_id);
CREATE INDEX idx_free_days_user ON free_days(user_id);
CREATE INDEX idx_shopping_lists_user ON shopping_lists(user_id);
CREATE INDEX idx_shopping_lists_plan ON shopping_lists(plan_id);
CREATE INDEX idx_shopping_list_items_list ON shopping_list_items(list_id);
CREATE INDEX idx_shopping_list_items_user ON shopping_list_items(user_id);
CREATE INDEX idx_shopping_list_items_ingredient ON shopping_list_items(ingredient_id);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantry_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- Each user can only SELECT, INSERT, UPDATE, DELETE their own rows.
-- ============================================================================

-- Recipes
CREATE POLICY "Users can select their own recipes"
  ON recipes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recipes"
  ON recipes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipes"
  ON recipes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipes"
  ON recipes FOR DELETE
  USING (auth.uid() = user_id);

-- Ingredients
CREATE POLICY "Users can select their own ingredients"
  ON ingredients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ingredients"
  ON ingredients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ingredients"
  ON ingredients FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ingredients"
  ON ingredients FOR DELETE
  USING (auth.uid() = user_id);

-- Recipe Ingredients
CREATE POLICY "Users can select their own recipe_ingredients"
  ON recipe_ingredients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recipe_ingredients"
  ON recipe_ingredients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipe_ingredients"
  ON recipe_ingredients FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipe_ingredients"
  ON recipe_ingredients FOR DELETE
  USING (auth.uid() = user_id);

-- Pantry Entries
CREATE POLICY "Users can select their own pantry_entries"
  ON pantry_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pantry_entries"
  ON pantry_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pantry_entries"
  ON pantry_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pantry_entries"
  ON pantry_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Menu Plans
CREATE POLICY "Users can select their own menu_plans"
  ON menu_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own menu_plans"
  ON menu_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own menu_plans"
  ON menu_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own menu_plans"
  ON menu_plans FOR DELETE
  USING (auth.uid() = user_id);

-- Plan Assignments
CREATE POLICY "Users can select their own plan_assignments"
  ON plan_assignments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own plan_assignments"
  ON plan_assignments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plan_assignments"
  ON plan_assignments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own plan_assignments"
  ON plan_assignments FOR DELETE
  USING (auth.uid() = user_id);

-- Free Days
CREATE POLICY "Users can select their own free_days"
  ON free_days FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own free_days"
  ON free_days FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own free_days"
  ON free_days FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own free_days"
  ON free_days FOR DELETE
  USING (auth.uid() = user_id);

-- Shopping Lists
CREATE POLICY "Users can select their own shopping_lists"
  ON shopping_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shopping_lists"
  ON shopping_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shopping_lists"
  ON shopping_lists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shopping_lists"
  ON shopping_lists FOR DELETE
  USING (auth.uid() = user_id);

-- Shopping List Items
CREATE POLICY "Users can select their own shopping_list_items"
  ON shopping_list_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shopping_list_items"
  ON shopping_list_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shopping_list_items"
  ON shopping_list_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shopping_list_items"
  ON shopping_list_items FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGER: Auto-update updated_at on row modification
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_recipe_ingredients_updated_at
  BEFORE UPDATE ON recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_pantry_entries_updated_at
  BEFORE UPDATE ON pantry_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_menu_plans_updated_at
  BEFORE UPDATE ON menu_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_plan_assignments_updated_at
  BEFORE UPDATE ON plan_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_free_days_updated_at
  BEFORE UPDATE ON free_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_shopping_lists_updated_at
  BEFORE UPDATE ON shopping_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_shopping_list_items_updated_at
  BEFORE UPDATE ON shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
