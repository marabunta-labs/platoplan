/**
 * PlatoPlan - PlanCalendarScreen
 * Displays the generated plan calendar with:
 * - CalendarGrid showing recipe assignments
 * - Tap slot to reassign recipe
 * - Edit notes for specific meals or whole days
 * - ConfirmDialog when conflict detected
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import type { PlanningStackParamList } from '../../navigation/types';
import type { MenuPlan, Recipe } from '../../models/types';
import type { MealSlot } from '../../models/enums';
import { CalendarGrid, ConfirmDialog, type SlotRef } from '../../components';
import { usePlanning, useRecipes } from '../../hooks';
import { useI18n } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';
import { AlertCompat } from '../../utils/alert';
import { shareText } from '../../utils/share';
import { exportPdf, escapeHtml } from '../../utils/exportPdf';
import { confirmLeavePlan } from './confirmLeavePlan';

type ScreenRoute = RouteProp<PlanningStackParamList, 'PlanCalendar'>;

export function PlanCalendarScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation();
  const route = useRoute<ScreenRoute>();
  const { planId } = route.params;

  const {
    activePlan,
    loading,
    loadPlan,
    updatePlan,
    applyDistribution,
    assignRecipe: assignRecipeService,
    markFreeDay,
  } = usePlanning();
  const { recipes } = useRecipes();

  const [plan, setPlan] = useState<MenuPlan | null>(null);

  useEffect(() => {
    loadPlan(planId);
  }, [planId]);

  useEffect(() => {
    if (activePlan?.id === planId) {
      setPlan(activePlan);
    }
  }, [activePlan, planId]);

  const [draggingSlot, setDraggingSlot] = useState<SlotRef | { isUnassigned: true; recipeId: string; index: number } | null>(null);
  const [unassignedRecipeIds, setUnassignedRecipeIds] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  
  const [showDoneOptions, setShowDoneOptions] = useState(false);
  const [pdfChoiceVisible, setPdfChoiceVisible] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<{ day: number; slot: MealSlot; } | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');

  const [editingNote, setEditingNote] = useState<{
    type: 'day' | 'meal';
    day: number;
    slot?: MealSlot;
    text: string;
  } | null>(null);

  const [conflictDialogVisible, setConflictDialogVisible] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<{
    day: number;
    slot: MealSlot;
    recipe: Recipe;
    conflictMessage: string;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{ from: SlotRef; to: SlotRef; clearsFree?: boolean } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SlotRef | { isUnassigned: true; recipeId: string; index: number } | null>(null);

  const [warnings, setWarnings] = useState<string[]>([]);

  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const formatExportDate = (date: Date, dayOffset: number): string => {
    const d = new Date(date);
    d.setDate(d.getDate() + dayOffset);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${DAY_NAMES[d.getDay()]} ${dd}/${mm}`;
  };

  const handleExport = useCallback(() => {
    if (!plan) return;

    const startDate = plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.periodDays - 1);

    const startStr = `${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    const endStr = `${String(endDate.getDate()).padStart(2, '0')}/${String(endDate.getMonth() + 1).padStart(2, '0')}`;

    let text = `🗓️ Plan de Menú (${startStr} - ${endStr})\n`;
    if (plan.name) text += `🏷️ ${plan.name}\n`;
    text += `👥 Para ${plan.servings} persona(s)\n\n`;
    
    const elaborateReminders: string[] = [];

    for (let day = 0; day < plan.periodDays; day++) {
      const dayLabel = formatExportDate(startDate, day);
      text += `${dayLabel}:\n`;
      
      if (plan.dayNotes?.[day.toString()]) {
        text += `  📝 Nota del día: ${plan.dayNotes[day.toString()]}\n`;
      }

      const lunchAssignment = plan.assignments.find((a) => a.dayIndex === day && a.slot === 'comida');
      const dinnerAssignment = plan.assignments.find((a) => a.dayIndex === day && a.slot === 'cena');
      const freeDay = plan.freeDays.find((fd) => fd.dayIndex === day);

      if (freeDay && (freeDay.type === 'comida' || freeDay.type === 'ambas')) {
        text += `  🍽️ Comida: Libre\n`;
      } else if (lunchAssignment) {
        const recipeName = lunchAssignment.recipe?.name ?? recipes.find((r) => r.id === lunchAssignment.recipeId)?.name ?? 'Sin asignar';
        text += `  🍽️ Comida: ${recipeName}\n`;
        if (plan.mealNotes?.[`${day}:comida`]) text += `      (Nota: ${plan.mealNotes[`${day}:comida`]}\n`;
        
        const recipeData = lunchAssignment.recipe ?? recipes.find((r) => r.id === lunchAssignment.recipeId);
        if (recipeData?.prepTime === 'elaborado' && day > 0) {
          const prevDayLabel = formatExportDate(startDate, day - 1);
          elaborateReminders.push(`- ${prevDayLabel}: Preparar "${recipeName}" (elaborado) para ${dayLabel.split(' ')[0]}`);
        }
      } else {
        text += `  🍽️ Comida: Sin asignar\n`;
      }

      if (freeDay && (freeDay.type === 'cena' || freeDay.type === 'ambas')) {
        text += `  🌙 Cena: Libre\n`;
      } else if (dinnerAssignment) {
        const recipeName = dinnerAssignment.recipe?.name ?? recipes.find((r) => r.id === dinnerAssignment.recipeId)?.name ?? 'Sin asignar';
        text += `  🌙 Cena: ${recipeName}\n`;
        if (plan.mealNotes?.[`${day}:cena`]) text += `      (Nota: ${plan.mealNotes[`${day}:cena`]}\n`;
        
        const recipeData = dinnerAssignment.recipe ?? recipes.find((r) => r.id === dinnerAssignment.recipeId);
        if (recipeData?.prepTime === 'elaborado' && day > 0) {
          const prevDayLabel = formatExportDate(startDate, day - 1);
          elaborateReminders.push(`- ${prevDayLabel}: Preparar "${recipeName}" (elaborado) para ${dayLabel.split(' ')[0]}`);
        }
      } else {
        text += `  🌙 Cena: Sin asignar\n`;
      }
      text += '\n';
    }

    if (elaborateReminders.length > 0) {
      text += `⚠️ Preparar con antelación:\n`;
      text += elaborateReminders.join('\n');
      text += '\n';
    }

    shareText('Plan de Menú', text.trim());
    setShowDoneOptions(false);
  }, [plan, recipes]);

  const handleExportPdf = useCallback((orient: 'vertical' | 'horizontal' = 'vertical') => {
    if (!plan) return;

    const startDate = plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.periodDays - 1);
    const startStr = `${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    const endStr = `${String(endDate.getDate()).padStart(2, '0')}/${String(endDate.getMonth() + 1).padStart(2, '0')}`;

    const recipeName = (recipeId: string, recipe?: Recipe) =>
      recipe?.name ?? recipes.find((r) => r.id === recipeId)?.name ?? '';

    // Builds one meal card matching the app's calendar card look.
    const cardFor = (day: number, slot: MealSlot): string => {
      const slotLabel = escapeHtml(slot === 'comida' ? t('mealTypes.comida') : t('mealTypes.cena'));
      const note = plan.mealNotes?.[`${day}:${slot}`];
      const noteHtml = note ? `<div class="card-note">📌 ${escapeHtml(note)}</div>` : '';

      const freeDay = plan.freeDays.find((fd) => fd.dayIndex === day);
      const isFree = freeDay && (freeDay.type === slot || freeDay.type === 'ambas');
      if (isFree) {
        return `<div class="card card-free"><div class="card-label card-label-free">${slotLabel}</div><div class="card-value card-value-free">${escapeHtml(t('planning.notNeeded'))}</div>${noteHtml}</div>`;
      }
      const assignment = plan.assignments.find((a) => a.dayIndex === day && a.slot === slot);
      if (!assignment) {
        return `<div class="card card-empty"><div class="card-label">${slotLabel}</div><div class="card-value card-value-empty">${escapeHtml(t('planning.emptySlot'))}</div>${noteHtml}</div>`;
      }
      const recipeData = assignment.recipe ?? recipes.find((r) => r.id === assignment.recipeId);
      const name = recipeName(assignment.recipeId, assignment.recipe);
      const complex = recipeData?.prepTime === 'elaborado' ? ' card-complex' : '';
      return `<div class="card${complex}"><div class="card-label">${slotLabel}</div><div class="card-value">${escapeHtml(name)}</div>${noteHtml}</div>`;
    };

    const elaborateReminders: string[] = [];
    const dayBlocks: string[] = [];
    for (let day = 0; day < plan.periodDays; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);
      const weekday = escapeHtml(DAY_NAMES[date.getDay()]);
      const dayNum = String(date.getDate()).padStart(2, '0');
      const monthNum = String(date.getMonth() + 1).padStart(2, '0');
      const dayNote = plan.dayNotes?.[day.toString()];
      const dayNoteHtml = dayNote ? `<div class="day-note">📝 ${escapeHtml(dayNote)}</div>` : '';

      for (const slot of ['comida', 'cena'] as MealSlot[]) {
        const assignment = plan.assignments.find((a) => a.dayIndex === day && a.slot === slot);
        const recipeData = assignment?.recipe ?? (assignment ? recipes.find((r) => r.id === assignment.recipeId) : undefined);
        if (recipeData?.prepTime === 'elaborado' && day > 0) {
          const prevDayLabel = formatExportDate(startDate, day - 1);
          elaborateReminders.push(`${prevDayLabel}: ${t('planning.prepareAhead', { name: recipeData.name })}`);
        }
      }

      dayBlocks.push(
        `<div class="day-block">` +
          `<div class="day-row">` +
            `<div class="day-date"><div class="day-weekday">${weekday}</div><div class="day-number">${dayNum}</div><div class="day-month">${monthNum}</div></div>` +
            `<div class="day-cards">${cardFor(day, 'comida')}${cardFor(day, 'cena')}</div>` +
          `</div>` +
          dayNoteHtml +
        `</div>`
      );
    }

    const remindersHtml = elaborateReminders.length > 0
      ? `<div class="reminders"><h2>⚠️ ${escapeHtml(t('planning.prepareAheadTitle'))}</h2><ul>${elaborateReminders.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul></div>`
      : '';

    // Horizontal layout: a weeks grid (Mon–Sun columns) mirroring the calendar.
    const MONTHS_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const WEEKDAYS_MON = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    const weekCellFor = (day: number): string => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);
      const dayNum = String(date.getDate());
      const monthAbbr = MONTHS_ABBR[date.getMonth()];
      const weekdayAbbr = WEEKDAYS_MON[(date.getDay() + 6) % 7];
      const dayNote = plan.dayNotes?.[day.toString()];
      const dayNoteHtml = dayNote ? `<div class="day-note">📝 ${escapeHtml(dayNote)}</div>` : '';
      return `<div class="week-cell">` +
        `<div class="week-date"><span class="day-weekday">${escapeHtml(weekdayAbbr)}</span><span class="day-number">${dayNum}</span><span class="day-month">${escapeHtml(monthAbbr)}</span></div>` +
        cardFor(day, 'comida') + cardFor(day, 'cena') + dayNoteHtml +
      `</div>`;
    };

    // Group days into Monday-first weeks, padding the first week with blanks.
    const startOffset = (startDate.getDay() + 6) % 7;
    const weeks: (number | null)[][] = [];
    let current: (number | null)[] = Array.from({ length: startOffset }, () => null);
    for (let day = 0; day < plan.periodDays; day++) {
      current.push(day);
      if (current.length === 7) { weeks.push(current); current = []; }
    }
    if (current.length > 0) { while (current.length < 7) current.push(null); weeks.push(current); }

    const weeksHtml =
      `<div class="weeks">` +
        `<div class="week-header">${WEEKDAYS_MON.map((wd) => `<div class="week-header-cell">${escapeHtml(wd)}</div>`).join('')}</div>` +
        weeks.map((week) =>
          `<div class="week-row">${week.map((d) => d === null ? `<div class="week-cell week-cell-empty"></div>` : weekCellFor(d)).join('')}</div>`
        ).join('') +
      `</div>`;

    const daysHtml = orient === 'horizontal' ? weeksHtml : `<div class="days">${dayBlocks.join('')}</div>`;

    const bodyHtml =
      `<h1>🗓️ ${escapeHtml(plan.name || t('planning.calendarTitle'))}</h1>` +
      `<p class="subtitle">${startStr} – ${endStr} · 👥 ${escapeHtml(t('planning.servingsSummary', { count: plan.servings }))}</p>` +
      daysHtml +
      remindersHtml;

    exportPdf({ title: plan.name || t('planning.calendarTitle'), bodyHtml, orientation: orient });
    setShowDoneOptions(false);
  }, [plan, recipes, t]);

  const availableRecipes = useMemo(() => {
    if (!selectedSlot) return [];
    const query = recipeSearch.trim().toLowerCase();
    return recipes.filter((r) => r.mealType === selectedSlot.slot || r.mealType === 'ambas')
      .filter((r) => query === '' || r.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [selectedSlot, recipes, locale, recipeSearch]);

  // Recipes currently sitting in the "unassigned" drawer that fit this slot,
  // offered as quick candidates at the top of the picker.
  const unassignedForSlot = useMemo(() => {
    if (!selectedSlot) return [] as Recipe[];
    return unassignedRecipeIds
      .map((id) => recipes.find((r) => r.id === id))
      .filter((r): r is Recipe => Boolean(r) && (r!.mealType === selectedSlot.slot || r!.mealType === 'ambas'));
  }, [selectedSlot, unassignedRecipeIds, recipes]);

  const checkConflict = useCallback((day: number, slot: MealSlot, recipeId: string): string | null => {
    if (!plan) return null;
    const prevDay = plan.assignments.find((a) => a.dayIndex === day - 1 && a.slot === slot && a.recipeId === recipeId);
    const nextDay = plan.assignments.find((a) => a.dayIndex === day + 1 && a.slot === slot && a.recipeId === recipeId);
    if (prevDay || nextDay) {
      const recipeName = recipes.find((r) => r.id === recipeId)?.name ?? recipeId;
      const conflictDays: string[] = [];
      if (prevDay) conflictDays.push(`Día ${day}`);
      if (nextDay) conflictDays.push(`Día ${day + 2}`);
      return `"${recipeName}" ya está asignada en ${conflictDays.join(' y ')}, lo que crea una repetición consecutiva.`;
    }
    return null;
  }, [plan?.assignments, recipes]);

  const handleSlotPress = useCallback((day: number, slot: MealSlot) => {
    setSelectedSlot({ day, slot });
    setRecipeSearch('');
    setPickerVisible(true);
  }, []);

  // Picks up the meal in the currently-selected slot for tap-to-move, and
  // closes the picker so the user can tap a destination slot.
  const handleMoveSelected = useCallback(() => {
    if (!selectedSlot) return;
    setDraggingSlot({ day: selectedSlot.day, slot: selectedSlot.slot });
    setPickerVisible(false);
    setSelectedSlot(null);
  }, [selectedSlot]);

  const handleRecipePick = useCallback((recipe: Recipe) => {
    if (!selectedSlot) return;
    const conflict = checkConflict(selectedSlot.day, selectedSlot.slot, recipe.id);
    if (conflict) {
      setPendingAssignment({ day: selectedSlot.day, slot: selectedSlot.slot, recipe, conflictMessage: conflict });
      setPickerVisible(false);
      setConflictDialogVisible(true);
    } else {
      applyReassignment(selectedSlot.day, selectedSlot.slot, recipe);
      setPickerVisible(false);
      setSelectedSlot(null);
    }
  }, [selectedSlot, checkConflict, applyReassignment]);

  function applyReassignment(day: number, slot: MealSlot, recipe: Recipe) {
    setPlan((prev) => {
      if (!prev) return prev;
      const existing = prev.assignments.find((a) => a.dayIndex === day && a.slot === slot);
      const updatedAssignments = existing
        ? prev.assignments.map((a) => a === existing ? { ...a, recipeId: recipe.id, recipe } : a)
        : [...prev.assignments, { id: `pending-${day}-${slot}`, planId: prev.id, dayIndex: day, slot, recipeId: recipe.id, recipe }];
      return { ...prev, assignments: updatedAssignments, updatedAt: new Date() };
    });
    if (plan) assignRecipeService(plan.id, day, slot, recipe.id);
  }

  const handleSaveNote = async () => {
    if (!plan || !editingNote) return;
    const { type, day, slot, text } = editingNote;
    
    const dayNotes = { ...(plan.dayNotes || {}) };
    const mealNotes = { ...(plan.mealNotes || {}) };
    
    if (type === 'day') {
      if (text.trim()) {
        dayNotes[day.toString()] = text.trim();
      } else {
        delete dayNotes[day.toString()];
      }
    } else if (slot) {
      const key = `${day}:${slot}`;
      if (text.trim()) {
        mealNotes[key] = text.trim();
      } else {
        delete mealNotes[key];
      }
    }

    const updatedPlan: MenuPlan = {
      ...plan,
      dayNotes,
      mealNotes,
      updatedAt: new Date(),
    };
    
    setPlan(updatedPlan);
    setEditingNote(null);
    try {
      await updatePlan(plan.id, { dayNotes, mealNotes } as any);
    } catch (e) {
      console.error('Error guardando nota:', e);
    }
  };

  // MEJORA CLAVE: Mover las notas asociadas al hacer un drag & drop
  const handleMove = useCallback(async (from: SlotRef, to: SlotRef, confirmed = false) => {
    setDraggingSlot(null);
    if (!plan) return;
    if (from.day === to.day && from.slot === to.slot) return;
    const isTargetFree = plan.freeDays.some((fd) => fd.dayIndex === to.day && (fd.type === to.slot || fd.type === 'ambas'));
    const source = plan.assignments.find((a) => a.dayIndex === from.day && a.slot === from.slot);
    if (!source) return;
    const target = plan.assignments.find((a) => a.dayIndex === to.day && a.slot === to.slot);

    if ((target || isTargetFree) && !confirmed) {
      setPendingMove({ from, to, clearsFree: isTargetFree });
      return;
    }

    const recipeOf = (recipeId: string) => recipes.find((r) => r.id === recipeId);
    const acceptsSlot = (recipeId: string, slot: MealSlot) => {
      const recipe = recipeOf(recipeId);
      return !recipe || recipe.mealType === slot || recipe.mealType === 'ambas';
    };

    if (!acceptsSlot(source.recipeId, to.slot)) {
      AlertCompat.alert(t('common.error'), `"${recipeOf(source.recipeId)?.name ?? ''}" no es válida para ${to.slot}.`);
      return;
    }
    if (target && !acceptsSlot(target.recipeId, from.slot)) {
      AlertCompat.alert(t('common.error'), `"${recipeOf(target.recipeId)?.name ?? ''}" no es válida para ${from.slot}.`);
      return;
    }

    // INTERCAMBIAR LAS NOTAS DE COMIDA
    const fromKey = `${from.day}:${from.slot}`;
    const toKey = `${to.day}:${to.slot}`;
    const newMealNotes = { ...(plan.mealNotes || {}) };
    const fromNote = newMealNotes[fromKey];
    const toNote = newMealNotes[toKey];

    if (toNote) newMealNotes[fromKey] = toNote;
    else delete newMealNotes[fromKey];

    if (fromNote) newMealNotes[toKey] = fromNote;
    else delete newMealNotes[toKey];

    // Aplicar los cambios en local de forma inmediata
    setPlan((prev) => prev ? { ...prev, mealNotes: newMealNotes } : prev);
    updatePlan(plan.id, { mealNotes: newMealNotes } as any).catch(console.error);

    // Mover las asignaciones
    const next = plan.assignments.filter((a) => a !== source && a !== target).map((a) => ({ dayIndex: a.dayIndex, slot: a.slot, recipeId: a.recipeId }));
    next.push({ dayIndex: to.day, slot: to.slot, recipeId: source.recipeId });
    if (target) next.push({ dayIndex: from.day, slot: from.slot, recipeId: target.recipeId });
    await applyDistribution(plan.id, next);
  }, [plan, recipes, applyDistribution, updatePlan, t]);

  const handleMoveToUnassigned = useCallback(async (from: SlotRef) => {
    if (!plan) return;
    const source = plan.assignments.find((a) => a.dayIndex === from.day && a.slot === from.slot);
    if (!source) return;

    // Limpiamos la nota si la receta se devuelve al cajón "Sin Asignar"
    const fromKey = `${from.day}:${from.slot}`;
    if (plan.mealNotes && plan.mealNotes[fromKey]) {
      const newMealNotes = { ...plan.mealNotes };
      delete newMealNotes[fromKey];
      setPlan((prev) => prev ? { ...prev, mealNotes: newMealNotes } : prev);
      updatePlan(plan.id, { mealNotes: newMealNotes } as any).catch(console.error);
    }

    await applyDistribution(plan.id, plan.assignments.filter((a) => a.id !== source.id).map((a) => ({ dayIndex: a.dayIndex, slot: a.slot, recipeId: a.recipeId })));
    // Allow the same recipe to sit in the drawer more than once (e.g. the same
    // dish removed from two different days), so we always append a new instance.
    setUnassignedRecipeIds((prev) => [...prev, source.recipeId]);
  }, [plan, applyDistribution, updatePlan]);

  const handleMoveFromUnassigned = useCallback(async (recipeId: string, to: SlotRef, index?: number) => {
    if (!plan) return;
    const recipe = recipes.find((item) => item.id === recipeId);
    if (!recipe || (recipe.mealType !== 'ambas' && recipe.mealType !== to.slot)) return;
    const target = plan.assignments.find((a) => a.dayIndex === to.day && a.slot === to.slot);
    const next = plan.assignments.filter((a) => a.id !== target?.id).map((a) => ({ dayIndex: a.dayIndex, slot: a.slot, recipeId: a.recipeId }));
    next.push({ dayIndex: to.day, slot: to.slot, recipeId });
    await applyDistribution(plan.id, next);
    // Remove exactly the dragged instance from the drawer (by position when we
    // know it), then append whatever recipe used to occupy the target slot.
    setUnassignedRecipeIds((prev) => {
      const withoutInstance = typeof index === 'number' && prev[index] === recipeId
        ? prev.filter((_, i) => i !== index)
        : (() => { const i = prev.indexOf(recipeId); return i >= 0 ? prev.filter((_, idx) => idx !== i) : prev; })();
      return target ? [...withoutInstance, target.recipeId] : withoutInstance;
    });
  }, [plan, recipes, applyDistribution]);

  // Dropping on the trash asks for confirmation first (keep the picked item
  // around until the user confirms or cancels).
  const handleDeleteDragged = useCallback((target: SlotRef | { isUnassigned: true; recipeId: string; index: number }) => {
    setPendingDelete(target);
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
    setDraggingSlot(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    setDraggingSlot(null);
    if (!plan || !target) return;
    if ('isUnassigned' in target) {
      // Remove exactly that instance from the drawer.
      setUnassignedRecipeIds((prev) =>
        prev[target.index] === target.recipeId
          ? prev.filter((_, i) => i !== target.index)
          : (() => { const i = prev.indexOf(target.recipeId); return i >= 0 ? prev.filter((_, idx) => idx !== i) : prev; })()
      );
      return;
    }
    // Delete a calendar meal entirely (do not send it to the drawer).
    const source = plan.assignments.find((a) => a.dayIndex === target.day && a.slot === target.slot);
    if (!source) return;
    const fromKey = `${target.day}:${target.slot}`;
    if (plan.mealNotes && plan.mealNotes[fromKey]) {
      const newMealNotes = { ...plan.mealNotes };
      delete newMealNotes[fromKey];
      setPlan((prev) => prev ? { ...prev, mealNotes: newMealNotes } : prev);
      updatePlan(plan.id, { mealNotes: newMealNotes } as any).catch(console.error);
    }
    await applyDistribution(plan.id, plan.assignments.filter((a) => a.id !== source.id).map((a) => ({ dayIndex: a.dayIndex, slot: a.slot, recipeId: a.recipeId })));
  }, [pendingDelete, plan, applyDistribution, updatePlan]);

  // Human-readable name of whatever is pending deletion, for the confirm dialog.
  const pendingDeleteName = useMemo(() => {
    if (!pendingDelete) return '';
    if ('isUnassigned' in pendingDelete) {
      return recipes.find((r) => r.id === pendingDelete.recipeId)?.name ?? '';
    }
    const a = plan?.assignments.find((x) => x.dayIndex === pendingDelete.day && x.slot === pendingDelete.slot);
    return a ? (a.recipe?.name ?? recipes.find((r) => r.id === a.recipeId)?.name ?? '') : '';
  }, [pendingDelete, plan, recipes]);

  const gapCount = useMemo(() => {
    if (!plan) return 0;
    let count = 0;
    for (let day = 0; day < plan.periodDays; day++) {
      for (const slot of ['comida', 'cena'] as MealSlot[]) {
        const free = plan.freeDays.some((fd) => fd.dayIndex === day && (fd.type === slot || fd.type === 'ambas'));
        if (free) continue;
        const assigned = plan.assignments.some((a) => a.dayIndex === day && a.slot === slot);
        if (!assigned) count++;
      }
    }
    return count;
  }, [plan]);

  const handleFinishPress = useCallback(async () => {
    if (!plan) return;
    await updatePlan(plan.id, { status: 'confirmed', allowGaps: true });
    setShowDoneOptions(true);
  }, [plan, updatePlan]);

  const handleConfirmConflict = useCallback(() => {
    if (pendingAssignment) {
      applyReassignment(pendingAssignment.day, pendingAssignment.slot, pendingAssignment.recipe);
      setWarnings((prev) => [...prev, `Día ${pendingAssignment.day + 1}: ${pendingAssignment.conflictMessage}`]);
    }
    setConflictDialogVisible(false);
    setPendingAssignment(null);
    setSelectedSlot(null);
  }, [pendingAssignment, applyReassignment]);

  const handleCancelConflict = useCallback(() => {
    setConflictDialogVisible(false);
    setPendingAssignment(null);
    setSelectedSlot(null);
  }, []);

  const handleClosePicker = useCallback(() => {
    setPickerVisible(false);
    setSelectedSlot(null);
    setRecipeSearch('');
  }, []);

  const handleRemoveSelected = useCallback(async () => {
    if (!plan || !selectedSlot) return;
    const next = plan.assignments.filter((a) => !(a.dayIndex === selectedSlot.day && a.slot === selectedSlot.slot)).map((a) => ({ dayIndex: a.dayIndex, slot: a.slot, recipeId: a.recipeId }));
    await applyDistribution(plan.id, next);
    handleClosePicker();
  }, [plan, selectedSlot, applyDistribution, handleClosePicker]);

  const handleMarkSelectedFree = useCallback(async () => {
    if (!plan || !selectedSlot) return;
    const current = plan.freeDays.find((fd) => fd.dayIndex === selectedSlot.day);
    const nextType = current?.type === 'comida' || current?.type === 'cena' ? 'ambas' : selectedSlot.slot;
    const next = plan.assignments.filter((a) => !(a.dayIndex === selectedSlot.day && a.slot === selectedSlot.slot)).map((a) => ({ dayIndex: a.dayIndex, slot: a.slot, recipeId: a.recipeId }));
    await applyDistribution(plan.id, next);
    await markFreeDay(plan.id, selectedSlot.day, nextType);
    handleClosePicker();
  }, [plan, selectedSlot, applyDistribution, markFreeDay, handleClosePicker]);

  const confirmMove = useCallback(() => {
    if (pendingMove) handleMove(pendingMove.from, pendingMove.to, true);
    setPendingMove(null);
  }, [pendingMove, handleMove]);

  if (loading || !plan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ marginTop: 12, color: colors.textMuted }}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentMealNote = selectedSlot ? (plan.mealNotes?.[`${selectedSlot.day}:${selectedSlot.slot}`] || '') : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => navigation.navigate('RecipeSelection', { planId: plan.id })}
            accessibilityRole="button"
          >
            <Text style={styles.backButton}>{t('common.back')}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => confirmLeavePlan(t, () => navigation.navigate('PlanHistory' as any))}
            accessibilityRole="button"
          >
            <Text style={styles.exitButton}>{t('planning.exit')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.stepBadge}>{t('planning.stepCounter', { current: 7, total: 7 })}</Text>
        <Text style={styles.title}>{t('planning.calendarTitle')}</Text>
        <View style={styles.headerRow}>
          <Text style={styles.subtitle}>
            {t('planning.periodInfo', { days: plan.periodDays })}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.pdfButton} onPress={() => setPdfChoiceVisible(true)} accessibilityRole="button" accessibilityLabel={t('planning.exportAsPdf')}>
              <Text style={styles.pdfButtonText}>🖨️ PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.orientationButton} onPress={() => setOrientation((val) => val === 'vertical' ? 'horizontal' : 'vertical')}>
              <Text style={styles.orientationButtonText}>{orientation === 'vertical' ? `↔ ${t('planning.horizontal')}` : `↕ ${t('planning.vertical')}`}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {warnings.length > 0 && (
          <View style={styles.warningsContainer}>
            <Text style={styles.warningsTitle}>{t('planning.warningsTitle')}</Text>
            {warnings.map((warning, index) => (
              <Text key={index} style={styles.warningText}>• {warning}</Text>
            ))}
          </View>
        )}

        <CalendarGrid
          plan={plan}
          recipes={recipes}
          unassignedRecipes={unassignedRecipeIds.map((id) => recipes.find((r) => r.id === id)).filter((r): r is Recipe => Boolean(r))}
          onSlotPress={handleSlotPress}
          onDayNotePress={(day) => {
            const text = plan.dayNotes?.[day.toString()] || '';
            setEditingNote({ type: 'day', day, text });
          }}
          draggingSlot={draggingSlot}
          onPickUp={setDraggingSlot}
          onCancelPickUp={() => setDraggingSlot(null)}
          onMove={handleMove}
          onMoveToUnassigned={handleMoveToUnassigned}
          onMoveFromUnassigned={handleMoveFromUnassigned}
          onDeleteDragged={handleDeleteDragged}
          orientation={orientation}
        />
      </View>

      <View style={styles.footer}>
        {gapCount > 0 && (
          <Text style={styles.footerHint}>
            ⚠️ {t('planning.planGaps', { count: gapCount })}
          </Text>
        )}
        <TouchableOpacity style={styles.finishButton} onPress={handleFinishPress}>
          <Text style={styles.finishButtonText}>{t('planning.done')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showDoneOptions} transparent animationType="fade" onRequestClose={() => setShowDoneOptions(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('planning.planSaved')}</Text>
            <Text style={styles.modalText}>{t('planning.whatNext')}</Text>
            
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={() => { setShowDoneOptions(false); navigation.navigate('ShoppingTab' as any, { screen: 'ShoppingList', params: { planId: plan.id } }); }}>
              <Text style={styles.modalButtonTextPrimary}>{t('planning.viewShoppingList')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={handleExport}>
              <Text style={styles.modalButtonTextSecondary}>{t('planning.exportAsText')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={() => { setShowDoneOptions(false); setPdfChoiceVisible(true); }}>
              <Text style={styles.modalButtonTextSecondary}>{t('planning.exportAsPdf')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel, { marginTop: 8 }]} onPress={() => { setShowDoneOptions(false); navigation.navigate('PlanHistory' as any); }}>
              <Text style={[styles.modalButtonTextCancel, { color: colors.dangerText }]}>{t('planning.exitToHistory')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setShowDoneOptions(false)}>
              <Text style={styles.modalButtonTextCancel}>{t('planning.keepEditingClose')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingNote} transparent animationType="slide" onRequestClose={() => setEditingNote(null)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {editingNote?.type === 'day' ? t('planning.dayNoteTitle', { day: editingNote.day + 1 }) : t('planning.mealNoteTitle', { slot: editingNote?.slot ? t(`mealTypes.${editingNote.slot}` as any) : '' })}
              </Text>
              <TouchableOpacity onPress={() => setEditingNote(null)}>
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <TextInput
                style={styles.noteInput}
                multiline
                placeholder={t('planning.notePlaceholder')}
                value={editingNote?.text || ''}
                onChangeText={(text) => setEditingNote(prev => prev ? { ...prev, text } : null)}
              />
              <TouchableOpacity style={styles.saveNoteButton} onPress={handleSaveNote}>
                <Text style={styles.saveNoteButtonText}>{t('planning.saveNote')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={handleClosePicker}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {t('planning.selectForSlot', { slot: selectedSlot?.slot === 'comida' ? t('mealTypes.comida') : t('mealTypes.cena'), day: selectedSlot ? selectedSlot.day + 1 : '' })}
              </Text>
              <TouchableOpacity onPress={handleClosePicker}>
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.noteButton} 
              onPress={() => {
                setEditingNote({ type: 'meal', day: selectedSlot!.day, slot: selectedSlot!.slot, text: currentMealNote });
                setPickerVisible(false);
              }}
            >
              <Text style={styles.noteButtonText}>📝 {currentMealNote ? t('planning.editMealNote') : t('planning.addMealNote')}</Text>
            </TouchableOpacity>

            {selectedSlot && plan.assignments.some((a) => a.dayIndex === selectedSlot.day && a.slot === selectedSlot.slot) && (
              <>
                <TouchableOpacity style={styles.moveAssignmentButton} onPress={handleMoveSelected}>
                  <Text style={styles.moveAssignmentText}>↔ {t('planning.moveMeal')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeAssignmentButton} onPress={handleRemoveSelected}>
                  <Text style={styles.removeAssignmentText}>{t('planning.removeMeal')}</Text>
                </TouchableOpacity>
              </>
            )}
            {selectedSlot && !plan.freeDays.some((fd) => fd.dayIndex === selectedSlot.day && (fd.type === selectedSlot.slot || fd.type === 'ambas')) && (
              <TouchableOpacity style={styles.markFreeButton} onPress={handleMarkSelectedFree}>
                <Text style={styles.markFreeText}>{t('planning.markNotNeeded', { slot: t(`mealTypes.${selectedSlot.slot}` as any) })}</Text>
              </TouchableOpacity>
            )}

            <TextInput
              style={styles.searchInput}
              placeholder={t('planning.searchRecipes')}
              value={recipeSearch}
              onChangeText={setRecipeSearch}
              clearButtonMode="while-editing"
            />

            <FlatList
              data={availableRecipes}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={
                unassignedForSlot.length > 0 && recipeSearch.trim() === '' ? (
                  <View style={styles.pickerSection}>
                    <Text style={styles.pickerSectionTitle}>📥 {t('planning.unassignedTitle')}</Text>
                    {unassignedForSlot.map((item, idx) => (
                      <TouchableOpacity
                        key={`${item.id}-${idx}`}
                        style={[styles.pickerItem, styles.pickerItemUnassigned]}
                        onPress={() => handleRecipePick(item)}
                      >
                        <Text style={styles.pickerItemName}>{item.name}</Text>
                        <Text style={styles.pickerItemMeta}>
                          {item.prepTime === 'elaborado' ? `👨‍🍳 ${t('prepTimes.elaborado')}` : `⚡ ${t('prepTimes.rapido')}`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={styles.pickerSectionTitle}>🍽️ {t('planning.allRecipes')}</Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerItem} onPress={() => handleRecipePick(item)}>
                  <Text style={styles.pickerItemName}>{item.name}</Text>
                  <Text style={styles.pickerItemMeta}>
                    {item.prepTime === 'elaborado' ? `👨‍🍳 ${t('prepTimes.elaborado')}` : `⚡ ${t('prepTimes.rapido')}`}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>{t('planning.noRecipesAvailable')}</Text>}
            />
          </View>
        </View>
      </Modal>

      <ConfirmDialog visible={conflictDialogVisible} title={t('planning.consecutiveWarningTitle')} message={pendingAssignment ? `${pendingAssignment.conflictMessage}\n\n¿Deseas confirmar el cambio de todas formas?` : ''} onConfirm={handleConfirmConflict} onCancel={handleCancelConflict} />
      <ConfirmDialog visible={Boolean(pendingMove)} title={pendingMove?.clearsFree ? t('planning.planFreeDayTitle') : t('planning.swapMealsTitle')} message={pendingMove?.clearsFree ? t('planning.planFreeDayMessage') : t('planning.swapMealsMessage')} onConfirm={confirmMove} onCancel={() => setPendingMove(null)} />
      <ConfirmDialog visible={Boolean(pendingDelete)} title={t('planning.deleteConfirmTitle')} message={t('planning.deleteConfirmMessage', { name: pendingDeleteName })} onConfirm={confirmDelete} onCancel={cancelDelete} />

      <Modal visible={pdfChoiceVisible} transparent animationType="fade" onRequestClose={() => setPdfChoiceVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('planning.pdfOrientationTitle')}</Text>
            <Text style={styles.modalText}>{t('planning.pdfOrientationHint')}</Text>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={() => { setPdfChoiceVisible(false); handleExportPdf('vertical'); }}>
              <Text style={styles.modalButtonTextPrimary}>↕ {t('planning.pdfVertical')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={() => { setPdfChoiceVisible(false); handleExportPdf('horizontal'); }}>
              <Text style={styles.modalButtonTextSecondary}>↔ {t('planning.pdfHorizontal')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setPdfChoiceVisible(false)}>
              <Text style={styles.modalButtonTextCancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backButton: { fontSize: 15, color: colors.accent, fontWeight: '500' },
  exitButton: { fontSize: 15, color: colors.dangerText, fontWeight: '600' },
  stepBadge: { fontSize: 12, fontWeight: '600', color: colors.textFaint, textTransform: 'uppercase', marginBottom: 2 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  subtitle: { fontSize: 14, color: colors.textFaint },
  orientationButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.accentSoft },
  orientationButtonText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pdfButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.successBg },
  pdfButtonText: { color: colors.successText, fontSize: 12, fontWeight: '600' },
  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  footerHint: { fontSize: 13, color: colors.warning, marginBottom: 8 },
  finishButton: { backgroundColor: colors.success, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  finishButtonText: { fontSize: 16, fontWeight: '600', color: colors.textInverse },
  warningsContainer: { marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.warningBg, borderRadius: 8, padding: 12 },
  warningsTitle: { fontSize: 14, fontWeight: '600', color: colors.warningText, marginBottom: 4 },
  warningText: { fontSize: 13, color: colors.warningText, marginBottom: 2 },
  pickerOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  pickerContainer: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%', paddingBottom: 24 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
  pickerClose: { fontSize: 20, color: colors.textFaint, paddingLeft: 12 },
  pickerItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  moveAssignmentButton: { marginHorizontal: 12, marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: colors.accentSoft, alignItems: 'center' },
  moveAssignmentText: { color: colors.accentText, fontWeight: '600' },
  searchInput: { marginHorizontal: 12, marginTop: 12, marginBottom: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  pickerSection: {},
  pickerSectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textFaint, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  pickerItemUnassigned: { backgroundColor: colors.accentSoft },
  removeAssignmentButton: { marginHorizontal: 12, marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: 'center' },
  removeAssignmentText: { color: colors.dangerText, fontWeight: '600' },
  markFreeButton: { marginHorizontal: 12, marginVertical: 12, padding: 10, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: 'center' },
  markFreeText: { color: colors.dangerText, fontWeight: '600' },
  noteButton: { marginHorizontal: 12, marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: colors.warningBg, alignItems: 'center' },
  noteButtonText: { color: colors.warningText, fontWeight: '600' },
  noteInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, minHeight: 120, textAlignVertical: 'top', fontSize: 15, color: colors.text, marginBottom: 16 },
  saveNoteButton: { backgroundColor: colors.accent, padding: 14, borderRadius: 10, alignItems: 'center' },
  saveNoteButtonText: { color: colors.textInverse, fontWeight: '600', fontSize: 16 },
  pickerItemName: { fontSize: 15, fontWeight: '500', color: colors.text },
  pickerItemMeta: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  emptyText: { fontSize: 14, color: colors.textFaint, fontStyle: 'italic', textAlign: 'center', padding: 24 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 350, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  modalText: { fontSize: 15, color: colors.textMuted, marginBottom: 24, textAlign: 'center' },
  modalButton: { width: '100%', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  modalButtonPrimary: { backgroundColor: colors.accent },
  modalButtonTextPrimary: { color: colors.textInverse, fontSize: 16, fontWeight: '600' },
  modalButtonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  modalButtonTextSecondary: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  modalButtonCancel: { backgroundColor: 'transparent', marginBottom: 0 },
  modalButtonTextCancel: { color: colors.textFaint, fontSize: 15, fontWeight: '500' }
});