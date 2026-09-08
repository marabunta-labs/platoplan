import React, { useMemo } from 'react';
import type { MenuPlan, Recipe } from '../models/types';
import type { MealSlot } from '../models/enums';
import { useI18n } from '../i18n';
import { FONT_FAMILY } from '../constants/typography';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface SlotRef { day: number; slot: MealSlot; }

type DragTarget = SlotRef | { isUnassigned: true; recipeId: string; index: number };

export interface CalendarGridProps {
  plan: MenuPlan;
  onSlotPress: (day: number, slot: MealSlot) => void;
  onDayNotePress?: (dayIndex: number) => void;
  recipes?: Recipe[];
  unassignedRecipes?: Recipe[];

  draggingSlot?: DragTarget | null;
  onMove?: (from: SlotRef, to: SlotRef) => void;
  onMoveToUnassigned?: (from: SlotRef) => void;
  onMoveFromUnassigned?: (recipeId: string, to: SlotRef, index?: number) => void;
  /** Deletes the picked-up item entirely (calendar meal or unassigned card). */
  onDeleteDragged?: (target: SlotRef | { isUnassigned: true; recipeId: string; index: number }) => void;

  onPickUp?: (slot: DragTarget) => void;
  onCancelPickUp?: () => void;
  orientation?: 'vertical' | 'horizontal';
}

const SLOTS: MealSlot[] = ['comida', 'cena'];
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEKDAYS_MON_FIRST = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  plan,
  recipes = [],
  unassignedRecipes = [],
  onSlotPress,
  onDayNotePress,
  draggingSlot = null,
  onPickUp,
  onCancelPickUp,
  onMove,
  onMoveToUnassigned,
  onMoveFromUnassigned,
  onDeleteDragged,
  orientation = 'vertical',
}) => {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isHorizontal = orientation === 'horizontal';

  const startDate = useMemo(() => plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate), [plan.startDate]);
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);

  const getRecipe = (day: number, slot: MealSlot): Recipe | null => {
    const assignment = plan.assignments.find((item) => item.dayIndex === day && item.slot === slot);
    if (!assignment) return null;
    return assignment.recipe ?? recipesById.get(assignment.recipeId) ?? null;
  };

  const isFree = (day: number, slot: MealSlot) => plan.freeDays.some((item) => item.dayIndex === day && (item.type === slot || item.type === 'ambas'));
  const isDraggingSlot = (day: number, slot: MealSlot) => !!draggingSlot && !('isUnassigned' in draggingSlot) && draggingSlot.day === day && draggingSlot.slot === slot;

  const draggedRecipe = draggingSlot
    ? ('isUnassigned' in draggingSlot
        ? (unassignedRecipes[draggingSlot.index] ?? unassignedRecipes.find((r) => r.id === draggingSlot.recipeId))
        : getRecipe(draggingSlot.day, draggingSlot.slot))
    : null;

  /**
   * Places whatever is currently "picked up" into the target slot.
   * Shared by both the tap-to-move (touch) and drag-and-drop (mouse) flows.
   */
  const placeInto = (day: number, slot: MealSlot) => {
    if (!draggingSlot) return;
    if ('isUnassigned' in draggingSlot) {
      onMoveFromUnassigned?.(draggingSlot.recipeId, { day, slot }, draggingSlot.index);
    } else {
      onMove?.(draggingSlot, { day, slot });
    }
    onCancelPickUp?.();
  };

  /**
   * Unified tap handler for a meal slot.
   * - If nothing is picked up: pick up this meal (if movable) or open the picker.
   * - If something is picked up: this slot is the drop target (or cancel if same slot).
   */
  const handleSlotTap = (day: number, slot: MealSlot, movable: boolean, blocked: boolean) => {
    if (draggingSlot) {
      if (isDraggingSlot(day, slot)) {
        onCancelPickUp?.();
        return;
      }
      if (blocked) return;
      placeInto(day, slot);
      return;
    }
    // A plain tap always opens the slot menu (change recipe / add note / remove
    // / move). Moving by tap-to-pick is triggered from that menu or by dragging,
    // so a filled slot is still reachable for editing its note.
    onSlotPress(day, slot);
  };

  const isPicking = !!draggingSlot;

  /**
   * Renders a single day's card (date header + comida/cena slots + day note).
   * Shared by the vertical (flat list) and horizontal (weeks grid) layouts.
   */
  const renderDayCell = (day: number, horizontal: boolean) => {
    const date = addDays(startDate, day);
    const dayNote = plan.dayNotes ? plan.dayNotes[day.toString()] || plan.dayNotes[day as any] : null;

    return (
      <div key={day} style={{ ...styles.dayWrapper, ...(horizontal ? styles.dayWrapperHorizontal : {}) }}>
        <div style={{ ...styles.dayRow, ...(horizontal ? styles.dayRowHorizontal : {}) }}>
          <div
            style={{ ...styles.date, ...(horizontal ? styles.dateHorizontal : {}) }}
            onClick={() => onDayNotePress?.(day)}
            title={dayNote ? `${t('planning.noteLabel')}: ${dayNote}` : t('planning.addDayNote')}
          >
            <strong style={{ marginRight: horizontal ? '6px' : 0, fontSize: '11px', fontWeight: 600, color: colors.textFaint, textTransform: 'uppercase' }}>{WEEKDAYS[date.getDay()].slice(0, 3)}</strong>
            <span style={{ marginRight: horizontal ? '6px' : 0, fontSize: '18px', fontWeight: 700, color: colors.text, lineHeight: '20px' }}>{date.getDate()}</span>
            <small style={{ marginRight: horizontal ? '6px' : 0, fontSize: '10px', color: colors.textFaint }}>{MONTHS[date.getMonth()]}</small>
            <span style={{ fontSize: '11px', cursor: 'pointer', background: dayNote ? colors.warningBg : 'transparent', padding: '1px 4px', borderRadius: '4px' }}>
              {dayNote ? '📝' : '+📝'}
            </span>
          </div>

          <div style={{ ...styles.slots, ...(horizontal ? styles.slotsHorizontal : {}) }}>
            {SLOTS.map((slot) => {
              const free = isFree(day, slot);
              const recipe = getRecipe(day, slot);
              const movable = Boolean(recipe);
              const dragging = isDraggingSlot(day, slot);
              const mealNote = plan.mealNotes ? plan.mealNotes[`${day}:${slot}`] : null;

              const mealTypeMismatch = draggedRecipe?.mealType && draggedRecipe.mealType !== 'ambas' && draggedRecipe.mealType !== slot;
              const isBlocked = Boolean(isPicking && mealTypeMismatch && !dragging);
              const isComplex = recipe?.prepTime === 'elaborado';
              const isDropTarget = isPicking && !dragging && !isBlocked;
              const isEmpty = !recipe && !free;

              return (
                <div
                  key={slot}
                  data-plan-slot={`${day}:${slot}`}
                  role="button"
                  tabIndex={0}
                  draggable={movable && !isPicking}
                  onClick={() => handleSlotTap(day, slot, movable, isBlocked)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => onPickUp?.({ day, slot }), 0);
                  }}
                  onDragOver={(event) => {
                    if (!isBlocked && !dragging) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggingSlot || isBlocked || dragging) return;
                    placeInto(day, slot);
                  }}
                  onDragEnd={() => onCancelPickUp?.()}
                  style={{
                    ...styles.card,
                    ...(isEmpty ? styles.emptyCard : {}),
                    ...(free ? styles.free : {}),
                    ...(dragging ? styles.dragging : {}),
                    ...(isBlocked ? styles.blocked : {}),
                    ...(isDropTarget ? styles.dropTarget : {}),
                    ...(isComplex && !dragging ? styles.complexRecipe : {}),
                    cursor: isBlocked ? 'not-allowed' : (isPicking ? 'pointer' : (movable ? 'grab' : 'pointer')),
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <small style={free ? styles.freeLabel : styles.label}>
                      {slot === 'comida' ? t('mealTypes.comida') : t('mealTypes.cena')}
                    </small>
                    {mealNote && <small title={mealNote}>📌</small>}
                  </div>

                  {free && !recipe ? (
                    <span style={styles.freeValueEmpty}>{t('planning.notNeeded')}</span>
                  ) : isEmpty ? (
                    <span style={styles.emptyValue}>{t('planning.emptySlot')}</span>
                  ) : (
                    <span style={styles.value}>{recipe?.name}</span>
                  )}

                  {mealNote && (
                    <small style={styles.mealNoteText} title={mealNote}>{mealNote}</small>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {dayNote && (
          <div style={{ ...styles.dayNoteFull, ...(horizontal ? styles.dayNoteFullHorizontal : {}) }} onClick={() => onDayNotePress?.(day)}>
            📝 {dayNote}
          </div>
        )}
      </div>
    );
  };

  // Group day indices into calendar weeks (Monday -> Sunday). The first week is
  // padded with nulls so the plan's start date lands in its real weekday column.
  const weeks = useMemo(() => {
    const result: (number | null)[][] = [];
    // Monday-first offset of the plan's start day (0 = Monday ... 6 = Sunday).
    const startOffset = (startDate.getDay() + 6) % 7;
    let current: (number | null)[] = Array.from({ length: startOffset }, () => null);
    for (let day = 0; day < plan.periodDays; day++) {
      current.push(day);
      if (current.length === 7) {
        result.push(current);
        current = [];
      }
    }
    if (current.length > 0) {
      while (current.length < 7) current.push(null);
      result.push(current);
    }
    return result;
  }, [startDate, plan.periodDays]);

  return (
    <div style={styles.wrapper}>
      {isPicking && (
        <div style={styles.moveHint}>
          <span style={styles.moveHintText}>
            {draggedRecipe?.name
              ? t('planning.moveHintNamed', { name: draggedRecipe.name })
              : t('planning.moveHint')}
          </span>
          <button type="button" style={styles.cancelMoveButton} onClick={() => onCancelPickUp?.()}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {(unassignedRecipes.length > 0 || (isPicking && !(draggingSlot && 'isUnassigned' in draggingSlot))) && (
      <div
        style={{ ...styles.unassignedZone, ...(isPicking && !(draggingSlot && 'isUnassigned' in draggingSlot) ? styles.unassignedZoneActive : {}) }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingSlot && !('isUnassigned' in draggingSlot)) {
            onMoveToUnassigned?.(draggingSlot);
          }
          onCancelPickUp?.();
        }}
        onClick={() => {
          // Tap-to-move: tapping the zone with a calendar meal picked up removes it from the calendar.
          if (draggingSlot && !('isUnassigned' in draggingSlot)) {
            onMoveToUnassigned?.(draggingSlot);
            onCancelPickUp?.();
          }
        }}
      >
        <h4 style={styles.unassignedTitle}>📥 {t('planning.unassignedTitle')}</h4>
        {unassignedRecipes.length === 0 ? (
          <p style={styles.unassignedEmpty}>{t('planning.unassignedEmpty')}</p>
        ) : (
          <div style={styles.unassignedList}>
            {unassignedRecipes.map((recipe, index) => {
              const picked = !!draggingSlot && 'isUnassigned' in draggingSlot && draggingSlot.index === index;
              return (
                <div
                  key={`${recipe.id}-${index}`}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => onPickUp?.({ isUnassigned: true, recipeId: recipe.id, index }), 0);
                  }}
                  onDragEnd={() => onCancelPickUp?.()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (picked) {
                      onCancelPickUp?.();
                    } else if (!draggingSlot) {
                      onPickUp?.({ isUnassigned: true, recipeId: recipe.id, index });
                    }
                  }}
                  style={{ ...styles.unassignedCard, ...(picked ? styles.unassignedCardPicked : {}) }}
                  title={recipe.name}
                >
                  <small style={styles.unassignedCardLabel}>
                    {recipe.mealType === 'comida'
                      ? t('mealTypes.comida')
                      : recipe.mealType === 'cena'
                        ? t('mealTypes.cena')
                        : t('planning.dish')}
                  </small>
                  <span style={styles.unassignedCardName}>{recipe.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {isPicking && (
        <div style={styles.deleteZoneRow}>
          <div
            style={styles.deleteZone}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingSlot) onDeleteDragged?.(draggingSlot);
            }}
            onClick={() => {
              if (draggingSlot) onDeleteDragged?.(draggingSlot);
            }}
          >
            <span style={styles.deleteZoneText}>🗑️ {t('planning.deleteZone')}</span>
          </div>
        </div>
      )}

      {isHorizontal ? (
        <div style={styles.weeksContainer} aria-label={t('planning.calendarTitle')}>
          <div style={styles.weekHeaderRow}>
            {WEEKDAYS_MON_FIRST.map((wd) => (
              <div key={wd} style={styles.weekHeaderCell}>{wd}</div>
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} style={styles.weekRow}>
              {week.map((day, columnIndex) =>
                day === null ? (
                  <div key={`empty-${weekIndex}-${columnIndex}`} style={styles.weekEmptyCell} />
                ) : (
                  <div key={day} style={styles.weekDayCell}>{renderDayCell(day, true)}</div>
                )
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.container} aria-label={t('planning.calendarTitle')}>
          {Array.from({ length: plan.periodDays }, (_, day) => renderDayCell(day, false))}
        </div>
      )}
    </div>
  );
};

const makeStyles = (colors: ThemeColors): Record<string, React.CSSProperties> => ({
  wrapper: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT_FAMILY },
  container: { flex: 1, overflowY: 'auto', padding: '0 12px 24px' },
  horizontalContainer: { display: 'flex', flexDirection: 'row', gap: 12, overflowX: 'auto', overflowY: 'hidden', paddingBottom: '16px' },

  moveHint: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 12px 12px', padding: '10px 14px', background: colors.accentSoft, borderRadius: 8 },
  moveHintText: { fontSize: '13px', color: colors.accentText, fontWeight: 500 },
  cancelMoveButton: { border: 'none', background: colors.accent, color: colors.textInverse, fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 },

  unassignedZone: { margin: '0 12px 12px', padding: '12px', border: `2px dashed ${colors.border}`, borderRadius: 8, background: colors.card, transition: 'all 0.2s', minHeight: '60px' },
  unassignedZoneActive: { borderColor: colors.accent, background: colors.accentSoft, cursor: 'pointer' },
  unassignedTitle: { margin: '0 0 8px 0', fontSize: '12px', color: colors.textMuted, textTransform: 'uppercase' },
  unassignedEmpty: { fontSize: '13px', color: colors.textFaint, margin: 0, fontStyle: 'italic' },
  unassignedList: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  unassignedCard: { display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', width: 150, minHeight: 58, boxSizing: 'border-box', background: colors.surface, border: `1px solid ${colors.border}`, padding: '8px 10px', borderRadius: 9, fontSize: '13px', cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  unassignedCardPicked: { borderColor: colors.accent, borderWidth: 2, background: colors.accentSoft },
  deleteZoneRow: { display: 'flex', justifyContent: 'flex-end', margin: '0 12px 12px' },
  deleteZone: { padding: '6px 12px', border: `1px dashed ${colors.danger}`, borderRadius: 8, background: colors.dangerBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', alignSelf: 'flex-end' },
  deleteZoneText: { fontSize: '12px', color: colors.dangerText, fontWeight: 600 },
  unassignedCardLabel: { color: colors.textFaint, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 },
  unassignedCardName: { color: colors.text, fontSize: 13, fontWeight: 500, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any },

  dayWrapper: { marginBottom: 8 },
  dayWrapperHorizontal: { width: '100%', marginBottom: 0 },

  dayRow: { alignItems: 'stretch', display: 'flex', gap: 8 },
  dayRowHorizontal: { flexDirection: 'column' },

  date: { alignItems: 'center', color: colors.textMuted, display: 'flex', flexDirection: 'column', fontSize: 11, justifyContent: 'center', minWidth: 52, cursor: 'pointer', background: colors.card, borderRadius: 8, padding: '4px 0', border: `1px solid ${colors.border}` },
  dateHorizontal: { width: '100%', marginBottom: '8px', padding: '8px 0', flexDirection: 'row' },

  slots: { display: 'flex', flex: 1, gap: 7, flexDirection: 'row' },
  slotsHorizontal: { flexDirection: 'column' },

  card: { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 9, display: 'flex', flex: 1, flexDirection: 'column', minHeight: 58, padding: '8px 10px', userSelect: 'none', transition: 'all 0.2s ease' },
  label: { color: colors.textFaint, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { color: colors.text, fontSize: 13, fontWeight: 500, marginTop: 3 },

  emptyCard: { background: colors.warningBg, border: `1px dashed ${colors.warning}` },
  emptyValue: { color: colors.warningText, fontSize: 13, fontWeight: 500, marginTop: 3, fontStyle: 'italic' },

  free: { background: colors.dangerBg, borderColor: colors.danger },
  freeLabel: { color: colors.dangerText, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 },
  freeValueEmpty: { color: colors.dangerText, fontSize: 13, fontWeight: 600, marginTop: 3, textDecoration: 'line-through' },

  dragging: { background: colors.accentSoft, border: `2px dashed ${colors.accent}`, opacity: 0.6 },
  dropTarget: { borderColor: colors.accent, borderStyle: 'dashed' },
  blocked: { opacity: 0.3, filter: 'grayscale(100%)', background: colors.border },
  complexRecipe: { borderLeft: `4px solid ${colors.warning}`, background: colors.warningBg },
  mealNoteText: { fontSize: '11px', color: colors.warning, fontStyle: 'italic', marginTop: '3px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' },

  dayNoteFull: { marginLeft: '60px', background: colors.warningBg, padding: '8px', borderRadius: '6px', marginTop: '4px', fontSize: '13px', color: colors.warningText, fontWeight: 500, cursor: 'pointer' },
  dayNoteFullHorizontal: { marginLeft: 0 },

  // Weeks (calendar) grid layout for horizontal orientation
  weeksContainer: { flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '0 12px 24px' },
  weekHeaderRow: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: 8, marginBottom: 8, minWidth: '840px' },
  weekHeaderCell: { fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' },
  weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: 8, marginBottom: 8, alignItems: 'start', minWidth: '840px' },
  weekDayCell: { minWidth: 0 },
  weekEmptyCell: { background: colors.card, border: `1px dashed ${colors.border}`, borderRadius: 9, minHeight: 58 },
});
