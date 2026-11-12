/**
 * PlatoPlan - undo history for the calendar
 *
 * Each destructive calendar action stores a snapshot of what it is about to
 * change (assignments, free slots, meal notes and the "Sin asignar" drawer) so
 * "Deshacer" can restore it.
 */

import type { MealSlot, FreeDayType } from '../../models/enums';

export interface PlanSnapshot {
  assignments: { dayIndex: number; slot: MealSlot; recipeId: string }[];
  freeDays: { dayIndex: number; type: FreeDayType }[];
  mealNotes: Record<string, string>;
  unassigned: string[];
}

export const UNDO_LIMIT = 20;

const same = (a: PlanSnapshot, b: PlanSnapshot) => JSON.stringify(a) === JSON.stringify(b);

/** Returns a new stack with `snapshot` on top (oldest entries dropped past the limit). */
export function pushSnapshot(stack: PlanSnapshot[], snapshot: PlanSnapshot, limit = UNDO_LIMIT): PlanSnapshot[] {
  const top = stack[stack.length - 1];
  if (top && same(top, snapshot)) return stack;
  return [...stack, snapshot].slice(-limit);
}

export function popSnapshot(stack: PlanSnapshot[]): { stack: PlanSnapshot[]; snapshot: PlanSnapshot | null } {
  if (stack.length === 0) return { stack, snapshot: null };
  return { stack: stack.slice(0, -1), snapshot: stack[stack.length - 1] };
}
