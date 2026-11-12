import { describe, it, expect } from 'vitest';
import { buildPlanText, TICK_EMPTY } from './planText';
import type { MenuPlan, Recipe } from '../models/types';

const recipe = (id: string, name: string, prepTime: 'rapido' | 'elaborado' = 'rapido'): Recipe => ({
  id, name, mealType: 'ambas', prepTime, servings: 1, ingredients: [], createdAt: new Date(0), updatedAt: new Date(0),
});

const plan = (over: Partial<MenuPlan> = {}): MenuPlan => ({
  id: 'p', name: 'Semana', periodDays: 3, startDate: new Date(2026, 4, 11), // lunes 11/05/2026
  status: 'draft', servings: 2, elaborateDays: [], freeDays: [], assignments: [], createdAt: new Date(0), updatedAt: new Date(0),
  ...over,
} as MenuPlan);

const emojiFor = (r?: Recipe) => (r ? '🥩' : '🍽️');

describe('buildPlanText', () => {
  it('uses WhatsApp bold headings and tick boxes', () => {
    const text = buildPlanText({
      plan: plan({ assignments: [{ id: 'a', planId: 'p', dayIndex: 0, slot: 'comida', recipeId: 'r1' }] }),
      recipes: [recipe('r1', 'Pollo')],
      emojiFor,
    });
    expect(text).toContain('*Lunes 11/05*');
    expect(text).toContain(`${TICK_EMPTY} 🍽️ Comida: 🥩 Pollo`);
    expect(text).toContain(`${TICK_EMPTY} 🌙 Cena: Sin asignar`);
  });

  it('marks free slots without a tick', () => {
    const text = buildPlanText({
      plan: plan({ freeDays: [{ id: 'f', planId: 'p', dayIndex: 1, type: 'ambas' }] }),
      recipes: [],
      emojiFor,
    });
    expect(text).toContain('➖ 🍽️ Comida: Libre');
    expect(text).toContain('➖ 🌙 Cena: Libre');
  });

  it('includes closed note parentheses and advance-prep reminders', () => {
    const text = buildPlanText({
      plan: plan({
        assignments: [{ id: 'a', planId: 'p', dayIndex: 1, slot: 'cena', recipeId: 'r1' }],
        mealNotes: { '1:cena': 'sin sal' },
      }),
      recipes: [recipe('r1', 'Cocido', 'elaborado')],
      emojiFor,
    });
    expect(text).toContain('(Nota: sin sal)');
    expect(text).toContain('*Preparar con antelación:*');
    expect(text).toContain('Lunes 11/05: Preparar "Cocido"');
  });
});
