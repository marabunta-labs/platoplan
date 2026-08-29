-- Add descriptive names and editable day/meal notes to existing menu plans.
ALTER TABLE menu_plans
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS servings INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS day_notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS meal_notes JSONB NOT NULL DEFAULT '{}'::jsonb;