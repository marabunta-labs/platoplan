/**
 * PlatoPlan - Enum type definitions
 */

/** Classification of a recipe: lunch, dinner, or both */
export type MealType = 'comida' | 'cena' | 'ambas';

/** Preparation effort: quick (<30 min) or elaborate (>=30 min) */
export type PrepTime = 'rapido' | 'elaborado';

/** A specific meal slot in the calendar */
export type MealSlot = 'comida' | 'cena';

/** Type of free day marking */
export type FreeDayType = 'comida' | 'cena' | 'ambas';

/** Unit of measurement for ingredients */
export type MeasureUnit = 'gramos' | 'mililitros' | 'unidades';

/** Status of a menu plan */
export type PlanStatus = 'draft' | 'confirmed';
