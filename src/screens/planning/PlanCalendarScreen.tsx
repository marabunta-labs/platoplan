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
import { AlertCompat } from '../../utils/alert';
import { shareText } from '../../utils/share';

type ScreenRoute = RouteProp<PlanningStackParamList, 'PlanCalendar'>;

export function PlanCalendarScreen() {
  const { t, locale } = useI18n();
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

  const [draggingSlot, setDraggingSlot] = useState<SlotRef | { isUnassigned: true; recipeId: string } | null>(null);
  const [unassignedRecipeIds, setUnassignedRecipeIds] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  
  const [showDoneOptions, setShowDoneOptions] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<{ day: number; slot: MealSlot; } | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

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

  const availableRecipes = useMemo(() => {
    if (!selectedSlot) return [];
    return recipes.filter((r) => r.mealType === selectedSlot.slot || r.mealType === 'ambas')
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [selectedSlot, recipes, locale]);

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
    setPickerVisible(true);
  }, []);

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
    setUnassignedRecipeIds((prev) => prev.includes(source.recipeId) ? prev : [...prev, source.recipeId]);
  }, [plan, applyDistribution, updatePlan]);

  const handleMoveFromUnassigned = useCallback(async (recipeId: string, to: SlotRef) => {
    if (!plan) return;
    const recipe = recipes.find((item) => item.id === recipeId);
    if (!recipe || (recipe.mealType !== 'ambas' && recipe.mealType !== to.slot)) return;
    const target = plan.assignments.find((a) => a.dayIndex === to.day && a.slot === to.slot);
    const next = plan.assignments.filter((a) => a.id !== target?.id).map((a) => ({ dayIndex: a.dayIndex, slot: a.slot, recipeId: a.recipeId }));
    next.push({ dayIndex: to.day, slot: to.slot, recipeId });
    await applyDistribution(plan.id, next);
    setUnassignedRecipeIds((prev) => [...prev.filter((id) => id !== recipeId), ...(target && !prev.includes(target.recipeId) ? [target.recipeId] : [])]);
  }, [plan, recipes, applyDistribution]);

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
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={{ marginTop: 12, color: '#666' }}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentMealNote = selectedSlot ? (plan.mealNotes?.[`${selectedSlot.day}:${selectedSlot.slot}`] || '') : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
            <Text style={styles.backButton}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>{t('planning.calendarTitle')}</Text>
        <View style={styles.headerRow}>
          <Text style={styles.subtitle}>
            {t('planning.periodInfo', { days: plan.periodDays })}
          </Text>
          <TouchableOpacity style={styles.orientationButton} onPress={() => setOrientation((val) => val === 'vertical' ? 'horizontal' : 'vertical')}>
            <Text style={styles.orientationButtonText}>{orientation === 'vertical' ? '↔ Horizontal' : '↕ Vertical'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {warnings.length > 0 && (
          <View style={styles.warningsContainer}>
            <Text style={styles.warningsTitle}>⚠️ Advertencias</Text>
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
          <Text style={styles.finishButtonText}>Hecho</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showDoneOptions} transparent animationType="fade" onRequestClose={() => setShowDoneOptions(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>¡Plan Guardado!</Text>
            <Text style={styles.modalText}>¿Qué quieres hacer ahora?</Text>
            
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={() => { setShowDoneOptions(false); navigation.navigate('ShoppingTab' as any, { screen: 'ShoppingList', params: { planId: plan.id } }); }}>
              <Text style={styles.modalButtonTextPrimary}>Ver lista de la compra</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={handleExport}>
              <Text style={styles.modalButtonTextSecondary}>Exportar plan como texto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel, { marginTop: 8 }]} onPress={() => { setShowDoneOptions(false); navigation.navigate('PlanHistory' as any); }}>
              <Text style={[styles.modalButtonTextCancel, { color: '#C0392B' }]}>Salir al Historial</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setShowDoneOptions(false)}>
              <Text style={styles.modalButtonTextCancel}>Cerrar y seguir editando</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingNote} transparent animationType="slide" onRequestClose={() => setEditingNote(null)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {editingNote?.type === 'day' ? `Nota del Día ${editingNote.day + 1}` : `Nota de la ${editingNote?.slot}`}
              </Text>
              <TouchableOpacity onPress={() => setEditingNote(null)}>
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <TextInput
                style={styles.noteInput}
                multiline
                placeholder="Escribe aquí aclaraciones, recordatorios o cambios..."
                value={editingNote?.text || ''}
                onChangeText={(text) => setEditingNote(prev => prev ? { ...prev, text } : null)}
              />
              <TouchableOpacity style={styles.saveNoteButton} onPress={handleSaveNote}>
                <Text style={styles.saveNoteButtonText}>Guardar Nota</Text>
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
              <Text style={styles.noteButtonText}>📝 {currentMealNote ? 'Editar nota de comida' : 'Añadir nota a esta comida'}</Text>
            </TouchableOpacity>

            {selectedSlot && plan.assignments.some((a) => a.dayIndex === selectedSlot.day && a.slot === selectedSlot.slot) && (
              <TouchableOpacity style={styles.removeAssignmentButton} onPress={handleRemoveSelected}>
                <Text style={styles.removeAssignmentText}>Eliminar esta comida</Text>
              </TouchableOpacity>
            )}
            {selectedSlot && !plan.freeDays.some((fd) => fd.dayIndex === selectedSlot.day && (fd.type === selectedSlot.slot || fd.type === 'ambas')) && (
              <TouchableOpacity style={styles.markFreeButton} onPress={handleMarkSelectedFree}>
                <Text style={styles.markFreeText}>Marcar {selectedSlot.slot} como no necesaria</Text>
              </TouchableOpacity>
            )}
            <FlatList
              data={availableRecipes}
              keyExtractor={(item) => item.id}
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
      <ConfirmDialog visible={Boolean(pendingMove)} title={pendingMove?.clearsFree ? 'Planificar en un día libre' : 'Intercambiar comidas'} message={pendingMove?.clearsFree ? 'Ese hueco estaba marcado como no necesario. Se habilitará y se moverá la comida. ¿Continuar?' : 'Ese hueco ya tiene una comida asignada. ¿Quieres intercambiarlas?'} onConfirm={confirmMove} onCancel={() => setPendingMove(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTopRow: { marginBottom: 8 },
  backButton: { fontSize: 15, color: '#007AFF', fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '700', color: '#1a1a1a' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  subtitle: { fontSize: 14, color: '#888' },
  orientationButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#EEF5FF' },
  orientationButtonText: { color: '#007AFF', fontSize: 12, fontWeight: '600' },
  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  footerHint: { fontSize: 13, color: '#E67E22', marginBottom: 8 },
  finishButton: { backgroundColor: '#34C759', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  finishButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  warningsContainer: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff3e0', borderRadius: 8, padding: 12 },
  warningsTitle: { fontSize: 14, fontWeight: '600', color: '#e65100', marginBottom: 4 },
  warningText: { fontSize: 13, color: '#bf360c', marginBottom: 2 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  pickerContainer: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%', paddingBottom: 24 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: '#333', flex: 1 },
  pickerClose: { fontSize: 20, color: '#888', paddingLeft: 12 },
  pickerItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  removeAssignmentButton: { marginHorizontal: 12, marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: '#FDECEA', alignItems: 'center' },
  removeAssignmentText: { color: '#C0392B', fontWeight: '600' },
  markFreeButton: { marginHorizontal: 12, marginVertical: 12, padding: 10, borderRadius: 8, backgroundColor: '#FDECEA', alignItems: 'center' },
  markFreeText: { color: '#C0392B', fontWeight: '600' },
  noteButton: { marginHorizontal: 12, marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: '#FFF9C4', alignItems: 'center' },
  noteButtonText: { color: '#F57F17', fontWeight: '600' },
  noteInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, minHeight: 120, textAlignVertical: 'top', fontSize: 15, color: '#333', marginBottom: 16 },
  saveNoteButton: { backgroundColor: '#007AFF', padding: 14, borderRadius: 10, alignItems: 'center' },
  saveNoteButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pickerItemName: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  pickerItemMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  emptyText: { fontSize: 14, color: '#888', fontStyle: 'italic', textAlign: 'center', padding: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 350, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 8 },
  modalText: { fontSize: 15, color: '#666', marginBottom: 24, textAlign: 'center' },
  modalButton: { width: '100%', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  modalButtonPrimary: { backgroundColor: '#007AFF' },
  modalButtonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalButtonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#007AFF' },
  modalButtonTextSecondary: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  modalButtonCancel: { backgroundColor: 'transparent', marginBottom: 0 },
  modalButtonTextCancel: { color: '#888', fontSize: 15, fontWeight: '500' }
});