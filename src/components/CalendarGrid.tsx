import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
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
  /** Recipe catalogue, used when an assignment has no embedded recipe. */
  recipes?: Recipe[];
  /** Slot currently picked up, waiting to be dropped somewhere else. */
  draggingSlot?: SlotRef | { isUnassigned: true; recipeId: string } | null;
  /** Called when a meal is dropped on another slot. */
  onMove?: (from: SlotRef, to: SlotRef) => void;
  unassignedRecipes?: Recipe[];
  onMoveToUnassigned?: (from: SlotRef) => void;
  onMoveFromUnassigned?: (recipeId: string, to: SlotRef) => void;
  /** Called when a meal is picked up (long press or drag start). */
  onPickUp?: (slot: SlotRef | { isUnassigned: true; recipeId: string }) => void;
  onCancelPickUp?: () => void;
  orientation?: 'vertical' | 'horizontal';
}

const SLOTS: MealSlot[] = ['comida', 'cena'];

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Web-only DOM drag props; ignored by react-native on native platforms. */
function dragProps(
  enabled: boolean,
  handlers: {
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onDrop?: () => void;
  }
): Record<string, unknown> {
  if (Platform.OS !== 'web') return {};
  return {
    draggable: enabled,
    onDragStart: (event: { dataTransfer?: { effectAllowed: string; setData: (format: string, data: string) => void } }) => {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        // Setting data is required by Firefox and makes the HTML5 drag gesture
        // start reliably instead of being interpreted as a click by the browser.
        event.dataTransfer.setData('text/plain', 'platoplan-meal');
      }
      handlers.onDragStart?.();
    },
    onDragEnd: () => handlers.onDragEnd?.(),
    onDragOver: (event: { preventDefault: () => void }) => event.preventDefault(),
    onDrop: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      handlers.onDrop?.();
    },
  };
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  plan,
  onSlotPress,
  recipes = [],
  draggingSlot = null,
  onMove,
  onPickUp,
  onCancelPickUp,
}) => {
  const { t } = useI18n();

  const startDate = useMemo(
    () => (plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate)),
    [plan.startDate]
  );

  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const days = Array.from({ length: plan.periodDays }, (_, i) => i);

  const getRecipeName = (dayIndex: number, slot: MealSlot): string | null => {
    const assignment = plan.assignments.find(
      (a) => a.dayIndex === dayIndex && a.slot === slot
    );
    if (!assignment) return null;
    return assignment.recipe?.name ?? recipesById.get(assignment.recipeId)?.name ?? null;
  };

  const isFreeSlot = (dayIndex: number, slot: MealSlot) =>
    plan.freeDays.some(
      (fd) => fd.dayIndex === dayIndex && (fd.type === slot || fd.type === 'ambas')
    );

  const getSlotLabel = (slot: MealSlot) =>
    slot === 'comida' ? t('mealTypes.comida') : t('mealTypes.cena');

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      accessibilityLabel={t('planning.calendarTitle')}
    >
      {draggingSlot && (
        <View style={styles.moveHint}>
          <Text style={styles.moveHintText}>{t('planning.moveHint')}</Text>
        </View>
      )}

      {days.map((dayIndex) => {
        const date = addDays(startDate, dayIndex);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        return (
          <View key={dayIndex} style={styles.dayRow}>
            <View style={styles.dateColumn}>
              <Text style={[styles.weekday, isWeekend && styles.weekendText]}>
                {WEEKDAYS[date.getDay()].slice(0, 3)}
              </Text>
              <Text style={[styles.dayNumber, isWeekend && styles.weekendText]}>
                {date.getDate()}
              </Text>
              <Text style={styles.month}>{MONTHS[date.getMonth()]}</Text>
            </View>

            <View style={styles.slotsColumn}>
              {SLOTS.map((slot) => {
                const free = isFreeSlot(dayIndex, slot);
                const recipeName = getRecipeName(dayIndex, slot);
                const dragging = isDragging(dayIndex, slot);
                const empty = !free && !recipeName;
                const movable = Boolean(recipeName) && !free;

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
                    onLongPress={
                      movable ? () => onPickUp?.({ day: dayIndex, slot }) : undefined
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${getSlotLabel(slot)}: ${
                      free ? t('planning.notNeeded') : (recipeName ?? t('common.empty'))
                    }`}
                    {...dragProps(movable, {
                      onDragStart: () => onPickUp?.({ day: dayIndex, slot }),
                      onDragEnd: () => onCancelPickUp?.(),
                      onDrop: () =>
                        draggingSlot && onMove?.(draggingSlot, { day: dayIndex, slot }),
                    })}
                  >
                    <Text style={[styles.slotLabel, free && styles.slotLabelFree]}>
                      {getSlotLabel(slot)}
                    </Text>
                    <Text
                      style={[
                        styles.slotValue,
                        free && styles.slotValueFree,
                        empty && styles.slotValueEmpty,
                      ]}
                      numberOfLines={2}
                    >
                      {free ? t('planning.notNeeded') : (recipeName ?? t('planning.emptySlot'))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  moveHint: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  moveHintText: {
    fontSize: 13,
    color: '#1565C0',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 6,
  },
  dateColumn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  weekday: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 22,
  },
  month: {
    fontSize: 10,
    color: '#aaa',
  },
  weekendText: {
    color: '#007AFF',
  },
  slotsColumn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  slotCard: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    backgroundColor: '#f5f7fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6e9ee',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  slotCardFree: {
    backgroundColor: '#FDECEA',
    borderColor: '#F5B7B1',
  },
  slotCardEmpty: {
    borderStyle: 'dashed',
    borderColor: '#c9ced6',
    backgroundColor: '#fff',
  },
  slotCardDragging: {
    borderColor: '#007AFF',
    borderWidth: 2,
    backgroundColor: '#E3F2FD',
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8a94a6',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  slotLabelFree: {
    color: '#C0392B',
  },
  slotValue: {
    fontSize: 13,
    color: '#1a1a1a',
  },
  slotValueFree: {
    color: '#C0392B',
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  slotValueEmpty: {
    color: '#aab0b8',
    fontStyle: 'italic',
  },
});
