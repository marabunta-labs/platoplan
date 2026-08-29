-- Adds the number of diners a menu plan is generated for.
-- Recipe quantities are scaled by plan.servings / recipe.servings when
-- building the shopping list.

alter table public.menu_plans
  add column if not exists servings integer not null default 2
  check (servings between 1 and 20);
