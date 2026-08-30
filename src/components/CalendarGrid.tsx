import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import type { MenuPlan, Recipe } from '../models/types';
import type { MealSlot } from '../models/enums';
import { useI18n } from '../i18n';

export interface SlotRef {
  day: number;
  slot: MealSlot;
}

export interface CalendarGridProps {
  plan: MenuPlan;
  onSlotPress: (day: number, slot: MealSlot) => void;
  onDayNotePress?: (dayIndex: number) => void;
  recipes?: Recipe[];
  draggingSlot?: SlotRef | { isUnassigned: true; recipeId: string } | null;
  onMove?: (from: SlotRef, to: SlotRef) => void;
  unassignedRecipes?: Recipe[];
  onMoveToUnassigned?: (from: SlotRef) => void;
  onMoveFromUnassigned?: (recipeId: string, to: SlotRef) => void;
  onPickUp?: (slot: SlotRef | { isUnassigned: true; recipeId: string }) => void;
  onCancelPickUp?: () => void;
  orientation?: 'vertical' | 'horizontal';
}

const SLOTS: MealSlot[] = ['comida', 'cena'];

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dragProps(enabled: boolean, handlers: any): Record<string, unknown> {
  if (Platform.OS !== 'web') return {};
  return {
    draggable: enabled,
    onDragStart: (event: any) => {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', 'platoplan-meal');
      }
      handlers.onDragStart?.();
    },
    onDragEnd: () => handlers.onDragEnd?.(),
    onDragOver: (event: any) => event.preventDefault(),
    onDrop: (event: any) => {
      event.preventDefault();
      handlers.onDrop?.();
    },
  };
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  plan,
  onSlotPress,
  onDayNotePress,
  recipes = [],
  draggingSlot = null,
  onMove,
  onPickUp,
  onCancelPickUp,
  orientation = 'vertical',
}) => {
  const { t } = useI18n();
  const isHorizontal = orientation === 'horizontal';

  const startDate = useMemo(
    () => (plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate)),
    [plan.startDate]
  );

  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const days = Array.from({ length: plan.periodDays }, (_, i) => i);

  const getRecipeName = (dayIndex: number, slot: MealSlot): string | null => {
    const assignment = plan.assignments.find((a) => a.dayIndex === dayIndex && a.slot === slot);
    if (!assignment) return null;
    return assignment.recipe?.name ?? recipesById.get(assignment.recipeId)?.name ?? null;
  };

  const isFreeSlot = (dayIndex: number, slot: MealSlot) =>
    plan.freeDays.some((fd) => fd.dayIndex === dayIndex && (fd.type === slot || fd.type === 'ambas'));

  const getSlotLabel = (slot: MealSlot) => (slot === 'comida' ? t('mealTypes.comida') : t('mealTypes.cena'));

  const isDragging = (dayIndex: number, slot: MealSlot) =>
    !!draggingSlot && !('isUnassigned' in draggingSlot) && draggingSlot.day === dayIndex && draggingSlot.slot === slot;

  const handlePress = (dayIndex: number, slot: MealSlot) => {
    if (draggingSlot) {
      if ('isUnassigned' in draggingSlot) return;
      if (isDragging(dayIndex, slot)) {
        onCancelPickUp?.();
      } else {
        onMove?.(draggingSlot, { day: dayIndex, slot });
      }
      return;
    }
    onSlotPress(dayIndex, slot);
  };

  return (
    <View style={styles.wrapper}>
      {draggingSlot && (
        <View style={styles.moveHint}>
          <Text style={styles.moveHintText}>{t('planning.moveHint')}</Text>
        </View>
      )}

      <ScrollView
        horizontal={isHorizontal}
        showsHorizontalScrollIndicator={false}
        style={styles.container}
        contentContainerStyle={[styles.content, isHorizontal && styles.contentHorizontal]}
        accessibilityLabel={t('planning.calendarTitle')}
      >
        {days.map((dayIndex) => {
          const date = addDays(startDate, dayIndex);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const dayNote = plan.dayNotes ? plan.dayNotes[dayIndex.toString()] || plan.dayNotes[dayIndex as any] : null;

          return (
            <View key={dayIndex} style={[styles.dayWrapper, isHorizontal && styles.dayWrapperHorizontal]}>
              <View style={[styles.dayRow, isHorizontal && styles.dayRowHorizontal]}>
                <TouchableOpacity 
                  style={[styles.dateColumn, isHorizontal && styles.dateColumnHorizontal]}
                  onPress={() => onDayNotePress?.(dayIndex)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.weekday, isWeekend && styles.weekendText]}>
                    {WEEKDAYS[date.getDay()].slice(0, 3)}
                  </Text>
                  <Text style={[styles.dayNumber, isWeekend && styles.weekendText]}>
                    {date.getDate()}
                  </Text>
                  <Text style={styles.month}>{MONTHS[date.getMonth()]}</Text>
                  
                  <View style={[styles.noteBadge, dayNote ? styles.noteBadgeActive : null]}>
                    <Text style={styles.noteBadgeText}>{dayNote ? '📝' : '+📝'}</Text>
                  </View>
                </TouchableOpacity>

                <View style={[styles.slotsColumn, isHorizontal && styles.slotsColumnHorizontal]}>
                  {SLOTS.map((slot) => {
                    const free = isFreeSlot(dayIndex, slot);
                    const recipeName = getRecipeName(dayIndex, slot);
                    const dragging = isDragging(dayIndex, slot);
                    const empty = !free && !recipeName;
                    const movable = Boolean(recipeName) && !free;
                    const mealNote = plan.mealNotes ? plan.mealNotes[`${dayIndex}:${slot}`] : null;

                    return (
                      <Pressable
                        key={slot}
                        style={[
                          styles.slotCard,
                          free && styles.slotCardFree,
                          empty && styles.slotCardEmpty,
                          dragging && styles.slotCardDragging,
                        ]}
                        onPress={() => handlePress(dayIndex, slot)}
                        onLongPress={movable ? () => onPickUp?.({ day: dayIndex, slot }) : undefined}
                        accessibilityRole="button"
                        {...dragProps(movable, {
                          onDragStart: () => onPickUp?.({ day: dayIndex, slot }),
                          onDragEnd: () => onCancelPickUp?.(),
                          onDrop: () => draggingSlot && onMove?.(draggingSlot, { day: dayIndex, slot }),
                        })}
                      >
                        <View style={styles.slotHeader}>
                          <Text style={[styles.slotLabel, free && styles.slotLabelFree]}>
                            {getSlotLabel(slot)}
                          </Text>
                          {mealNote && <Text style={styles.mealNoteIcon}>📌</Text>}
                        </View>

                        <Text style={[styles.slotValue, free && styles.slotValueFree, empty && styles.slotValueEmpty]} numberOfLines={1}>
                          {free ? t('planning.notNeeded') : (recipeName ?? t('planning.emptySlot'))}
                        </Text>

                        {mealNote ? <Text style={styles.mealNoteText} numberOfLines={1}>{mealNote}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              
              {dayNote ? (
                <TouchableOpacity onPress={() => onDayNotePress?.(dayIndex)} style={[styles.dayNoteFull, isHorizontal && styles.dayNoteFullHorizontal]}>
                  <Text style={styles.dayNoteFullText} numberOfLines={isHorizontal ? 2 : undefined}>📝 {dayNote}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 24 },
  contentHorizontal: { flexDirection: 'row', paddingRight: 24 },
  moveHint: { backgroundColor: '#E3F2FD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 12, marginBottom: 8 },
  moveHintText: { fontSize: 13, color: '#1565C0' },
  
  dayWrapper: { marginBottom: 8 },
  dayWrapperHorizontal: { width: 140, marginRight: 12, marginBottom: 0 },
  
  dayRow: { flexDirection: 'row', alignItems: 'stretch' },
  dayRowHorizontal: { flexDirection: 'column' },
  
  dateColumn: { width: 52, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, backgroundColor: '#FAF9F6', borderRadius: 8, marginRight: 6, borderWidth: 1, borderColor: '#EFECE6' },
  dateColumnHorizontal: { width: '100%', marginRight: 0, marginBottom: 8, paddingVertical: 8, flexDirection: 'row', gap: 6 },
  
  weekday: { fontSize: 11, color: '#888', textTransform: 'uppercase' },
  dayNumber: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', lineHeight: 22 },
  month: { fontSize: 10, color: '#aaa' },
  weekendText: { color: '#007AFF' },
  
  noteBadge: { marginTop: 2, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  noteBadgeActive: { backgroundColor: '#FFF59D' },
  noteBadgeText: { fontSize: 10 },
  
  slotsColumn: { flex: 1, flexDirection: 'row', gap: 6 },
  slotsColumnHorizontal: { flexDirection: 'column' },
  
  slotCard: { flex: 1, minHeight: 58, justifyContent: 'center', backgroundColor: '#f5f7fa', borderRadius: 8, borderWidth: 1, borderColor: '#e6e9ee', paddingHorizontal: 10, paddingVertical: 6 },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealNoteIcon: { fontSize: 10 },
  slotCardFree: { backgroundColor: '#FDECEA', borderColor: '#F5B7B1' },
  slotCardEmpty: { borderStyle: 'dashed', borderColor: '#c9ced6', backgroundColor: '#fff' },
  slotCardDragging: { borderColor: '#007AFF', borderWidth: 2, backgroundColor: '#E3F2FD' },
  slotLabel: { fontSize: 10, fontWeight: '600', color: '#8a94a6', textTransform: 'uppercase', marginBottom: 2 },
  slotLabelFree: { color: '#C0392B' },
  slotValue: { fontSize: 13, color: '#1a1a1a' },
  slotValueFree: { color: '#C0392B', fontWeight: '600', textDecorationLine: 'line-through' },
  slotValueEmpty: { color: '#aab0b8', fontStyle: 'italic' },
  mealNoteText: { fontSize: 11, color: '#B7950B', fontStyle: 'italic', marginTop: 2 },
  
  dayNoteFull: { marginLeft: 58, backgroundColor: '#FFF9C4', padding: 8, borderRadius: 6, marginTop: 4 },
  dayNoteFullHorizontal: { marginLeft: 0 },
  dayNoteFullText: { fontSize: 13, color: '#F57F17', fontWeight: '500' }
});