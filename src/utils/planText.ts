/**
 * PlatoPlan - plan text export
 *
 * Builds the plain-text version of a plan, tuned for pasting into WhatsApp:
 * - WhatsApp has no interactive checkboxes, so each meal starts with ⬜ (swap
 *   it for ✅ as you go) and headings use WhatsApp's *bold* syntax.
 */

import type { MenuPlan, Recipe } from '../models/types';
import type { MealSlot } from '../models/enums';

export const TICK_EMPTY = '⬜';
export const TICK_DONE = '✅';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const pad = (n: number) => String(n).padStart(2, '0');

function dateLabel(start: Date, offset: number): { label: string; weekday: string } {
  const d = new Date(start);
  d.setDate(d.getDate() + offset);
  const weekday = DAY_NAMES[d.getDay()];
  return { label: `${weekday} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, weekday };
}

export interface PlanTextOptions {
  plan: MenuPlan;
  recipes: Recipe[];
  emojiFor: (recipe: Recipe | undefined) => string;
}

export function buildPlanText({ plan, recipes, emojiFor }: PlanTextOptions): string {
  const start = plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + plan.periodDays - 1);
  const range = `${pad(start.getDate())}/${pad(start.getMonth() + 1)} - ${pad(end.getDate())}/${pad(end.getMonth() + 1)}`;

  let text = `🗓️ *Plan de Menú* (${range})\n`;
  if (plan.name) text += `🏷️ ${plan.name}\n`;
  text += `👥 Para ${plan.servings} persona(s)\n\n`;

  const reminders: string[] = [];
  const slots: { slot: MealSlot; icon: string; name: string }[] = [
    { slot: 'comida', icon: '🍽️', name: 'Comida' },
    { slot: 'cena', icon: '🌙', name: 'Cena' },
  ];

  for (let day = 0; day < plan.periodDays; day++) {
    const { label, weekday } = dateLabel(start, day);
    text += `*${label}*\n`;

    const dayNote = plan.dayNotes?.[day.toString()];
    if (dayNote) text += `📝 ${dayNote}\n`;

    const freeDay = plan.freeDays.find((fd) => fd.dayIndex === day);
    for (const { slot, icon, name } of slots) {
      if (freeDay && (freeDay.type === slot || freeDay.type === 'ambas')) {
        text += `➖ ${icon} ${name}: Libre\n`;
        continue;
      }
      const assignment = plan.assignments.find((a) => a.dayIndex === day && a.slot === slot);
      if (!assignment) {
        text += `${TICK_EMPTY} ${icon} ${name}: Sin asignar\n`;
        continue;
      }
      const recipe = assignment.recipe ?? recipes.find((r) => r.id === assignment.recipeId);
      const recipeName = recipe?.name ?? 'Sin asignar';
      text += `${TICK_EMPTY} ${icon} ${name}: ${emojiFor(recipe)} ${recipeName}\n`;
      const note = plan.mealNotes?.[`${day}:${slot}`];
      if (note) text += `      (Nota: ${note})\n`;
      if (recipe?.prepTime === 'elaborado' && day > 0) {
        reminders.push(`- ${dateLabel(start, day - 1).label}: Preparar "${recipeName}" (elaborado) para ${weekday}`);
      }
    }
    text += '\n';
  }

  if (reminders.length > 0) {
    text += `⚠️ *Preparar con antelación:*\n${reminders.join('\n')}\n`;
  }
  return text.trim();
}
