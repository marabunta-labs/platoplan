/**
 * PlatoPlan - confirmLeavePlan
 *
 * Shared "leave plan" confirmation used across the planning flow
 * (PlanConfig, RecipeSelection, PlanCalendar).
 *
 * Plans are persisted automatically as soon as they are created, so leaving
 * mid-flow never loses data — the plan simply stays as a draft in the history.
 * This dialog states that truthfully instead of a misleading "won't be saved".
 */

import { AlertCompat } from '../../utils/alert';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Shows a consistent confirmation before leaving an in-progress plan.
 * Calls `onLeave` only if the user confirms.
 */
export function confirmLeavePlan(t: Translate, onLeave: () => void): void {
  AlertCompat.alert(t('planning.exitTitle'), t('planning.exitMessage'), [
    { text: t('planning.keepEditing'), style: 'cancel' },
    { text: t('planning.exitConfirm'), style: 'destructive', onPress: onLeave },
  ]);
}
