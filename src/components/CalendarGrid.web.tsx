import React, { useMemo } from 'react';
import type { MenuPlan, Recipe } from '../models/types';
import type { MealSlot } from '../models/enums';
import { useI18n } from '../i18n';

export interface SlotRef { day: number; slot: MealSlot; }

export interface CalendarGridProps {
  plan: MenuPlan;
  onSlotPress: (day: number, slot: MealSlot) => void;
  onDayNotePress?: (dayIndex: number) => void;
  recipes?: Recipe[];
  unassignedRecipes?: Recipe[]; 
  
  draggingSlot?: SlotRef | { isUnassigned: true, recipeId: string } | null;
  onMove?: (from: SlotRef, to: SlotRef) => void;
  onMoveToUnassigned?: (from: SlotRef) => void;
  onMoveFromUnassigned?: (recipeId: string, to: SlotRef) => void;
  
  onPickUp?: (slot: SlotRef | { isUnassigned: true, recipeId: string }) => void;
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
  orientation = 'vertical',
}) => {
  const { t } = useI18n();
  const isHorizontal = orientation === 'horizontal';

  const startDate = useMemo(() => plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate), [plan.startDate]);
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);

  const getRecipe = (day: number, slot: MealSlot): Recipe | null => {
    const assignment = plan.assignments.find((item) => item.dayIndex === day && item.slot === slot);
    if (!assignment) return null;
    return assignment.recipe ?? recipesById.get(assignment.recipeId) ?? null;
  };
  
  const isFree = (day: number, slot: MealSlot) => plan.freeDays.some((item) => item.dayIndex === day && (item.type === slot || item.type === 'ambas'));
  const isDraggingSlot = (day: number, slot: MealSlot) => !draggingSlot?.isUnassigned && draggingSlot?.day === day && draggingSlot?.slot === slot;

  const draggedRecipe = draggingSlot 
    ? (draggingSlot.isUnassigned 
        ? unassignedRecipes.find(r => r.id === draggingSlot.recipeId)
        : getRecipe(draggingSlot.day, draggingSlot.slot))
    : null;

  return (
    <div style={styles.wrapper}>
      
      <div 
        style={{ ...styles.unassignedZone, ...(draggingSlot && !draggingSlot.isUnassigned ? styles.unassignedZoneActive : {}) }}
        onDragOver={(event) => {
          event.preventDefault(); 
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingSlot && !draggingSlot.isUnassigned) {
            onMoveToUnassigned?.(draggingSlot as SlotRef);
          }
          onCancelPickUp?.();
        }}
      >
        <h4 style={styles.unassignedTitle}>📥 Sin Asignar</h4>
        {unassignedRecipes.length === 0 ? (
          <p style={styles.unassignedEmpty}>Arrastra aquí platos para quitarlos del calendario.</p>
        ) : (
          <div style={styles.unassignedList}>
            {unassignedRecipes.map(recipe => (
              <div 
                key={recipe.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  setTimeout(() => onPickUp?.({ isUnassigned: true, recipeId: recipe.id }), 0);
                }}
                onDragEnd={() => onCancelPickUp?.()}
                style={styles.unassignedCard}
              >
                {recipe.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...styles.container, ...(isHorizontal ? styles.horizontalContainer : {}) }} aria-label={t('planning.calendarTitle')}>
        {Array.from({ length: plan.periodDays }, (_, day) => {
          const date = addDays(startDate, day);
          const dayNote = plan.dayNotes ? plan.dayNotes[day.toString()] || plan.dayNotes[day as any] : null;

          return (
            <div key={day} style={{ ...styles.dayWrapper, ...(isHorizontal ? styles.dayWrapperHorizontal : {}) }}>
              <div style={{ ...styles.dayRow, ...(isHorizontal ? styles.dayRowHorizontal : {}) }}>
                <div 
                  style={{ ...styles.date, ...(isHorizontal ? styles.dateHorizontal : {}) }} 
                  onClick={() => onDayNotePress?.(day)}
                  title={dayNote ? `Nota: ${dayNote}` : "Añadir nota de día"}
                >
                  <strong style={{marginRight: isHorizontal ? '6px' : 0}}>{WEEKDAYS[date.getDay()].slice(0, 3)}</strong>
                  <span style={{marginRight: isHorizontal ? '6px' : 0}}>{date.getDate()}</span>
                  <small style={{marginRight: isHorizontal ? '6px' : 0}}>{MONTHS[date.getMonth()]}</small>
                  <span style={{ fontSize: '11px', cursor: 'pointer', background: dayNote ? '#FFF59D' : 'transparent', padding: '1px 4px', borderRadius: '4px' }}>
                    {dayNote ? '📝' : '+📝'}
                  </span>
                </div>
                
                <div style={{ ...styles.slots, ...(isHorizontal ? styles.slotsHorizontal : {}) }}>
                  {SLOTS.map((slot) => {
                    const free = isFree(day, slot);
                    const recipe = getRecipe(day, slot);
                    const movable = Boolean(recipe);
                    const dragging = isDraggingSlot(day, slot);
                    const mealNote = plan.mealNotes ? plan.mealNotes[`${day}:${slot}`] : null;
                    
                    const mealTypeMismatch = draggedRecipe?.mealType && draggedRecipe.mealType !== 'ambas' && draggedRecipe.mealType !== slot;
                    const isBlocked = draggingSlot && mealTypeMismatch; 
                    const isComplex = recipe?.prepTime === 'elaborado';

                    return (
                      <div
                        key={slot}
                        data-plan-slot={`${day}:${slot}`}
                        role="button"
                        tabIndex={0}
                        draggable={movable && !draggingSlot} 
                        onClick={() => !isBlocked && !draggingSlot && onSlotPress(day, slot)}
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

                          if (draggingSlot.isUnassigned) {
                            onMoveFromUnassigned?.(draggingSlot.recipeId, { day, slot });
                          } else {
                            onMove?.(draggingSlot as SlotRef, { day, slot });
                          }
                          onCancelPickUp?.();
                        }}
                        onDragEnd={() => onCancelPickUp?.()}

                        style={{ 
                          ...styles.card, 
                          ...(free ? styles.free : {}), 
                          ...(dragging ? styles.dragging : {}), 
                          ...(isBlocked ? styles.blocked : {}),
                          ...(isComplex && !dragging ? styles.complexRecipe : {}),
                          cursor: isBlocked ? 'not-allowed' : (movable ? 'grab' : 'pointer') 
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <small style={free ? styles.freeLabel : styles.label}>{slot}</small>
                          {mealNote && <small title={mealNote}>📌</small>}
                        </div>
                        
                        {free && !recipe ? (
                          <span style={styles.freeValueEmpty}>{t('planning.notNeeded')}</span>
                        ) : (
                          <span style={styles.value}>{recipe?.name ?? t('planning.emptySlot')}</span>
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
                <div style={{ ...styles.dayNoteFull, ...(isHorizontal ? styles.dayNoteFullHorizontal : {}) }} onClick={() => onDayNotePress?.(day)}>
                  📝 {dayNote}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', height: '100%' },
  container: { flex: 1, overflowY: 'auto', padding: '0 12px 24px' },
  horizontalContainer: { display: 'flex', flexDirection: 'row', gap: 12, overflowX: 'auto', overflowY: 'hidden', paddingBottom: '16px' },
  
  unassignedZone: { margin: '0 12px 12px', padding: '12px', border: '2px dashed #B0BEC5', borderRadius: 8, background: '#ECEFF1', transition: 'all 0.2s', minHeight: '60px' },
  unassignedZoneActive: { borderColor: '#007AFF', background: '#E3F2FD' },
  unassignedTitle: { margin: '0 0 8px 0', fontSize: '12px', color: '#546E7A', textTransform: 'uppercase' },
  unassignedEmpty: { fontSize: '13px', color: '#90A4AE', margin: 0, fontStyle: 'italic' },
  unassignedList: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  unassignedCard: { background: '#FFF', border: '1px solid #CFD8DC', padding: '6px 12px', borderRadius: '16px', fontSize: '13px', cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },

  dayWrapper: { marginBottom: 8 },
  dayWrapperHorizontal: { flex: '0 0 160px', marginBottom: 0 },
  
  dayRow: { alignItems: 'stretch', display: 'flex', gap: 8 },
  dayRowHorizontal: { flexDirection: 'column' },
  
  date: { alignItems: 'center', color: '#667085', display: 'flex', flexDirection: 'column', fontSize: 11, justifyContent: 'center', minWidth: 52, cursor: 'pointer', background: '#FAF9F6', borderRadius: 8, padding: '4px 0', border: '1px solid #EFECE6' },
  dateHorizontal: { width: '100%', marginBottom: '8px', padding: '8px 0', flexDirection: 'row' },
  
  slots: { display: 'flex', flex: 1, gap: 7, flexDirection: 'row' },
  slotsHorizontal: { flexDirection: 'column' },
  
  card: { background: '#F5F7FA', border: '1px solid #E6E9EE', borderRadius: 9, display: 'flex', flex: 1, flexDirection: 'column', minHeight: 58, padding: '8px 10px', userSelect: 'none', transition: 'all 0.2s ease' },
  label: { color: '#667085', fontWeight: 700, textTransform: 'uppercase' },
  value: { color: '#1A1A1A', fontSize: 13, marginTop: 3 },
  
  free: { background: '#FDECEA', borderColor: '#F5B7B1' },
  freeLabel: { color: '#C0392B', fontWeight: 700, textTransform: 'uppercase' },
  freeValueEmpty: { color: '#C0392B', fontSize: 13, fontWeight: 600, marginTop: 3, textDecoration: 'line-through' },
  
  dragging: { background: '#E3F2FD', border: '2px dashed #007AFF', opacity: 0.5 },
  blocked: { opacity: 0.3, filter: 'grayscale(100%)', background: '#e0e0e0' },
  complexRecipe: { borderLeft: '4px solid #F1C40F', background: '#FEF9E7' },
  mealNoteText: { fontSize: '11px', color: '#B7950B', fontStyle: 'italic', marginTop: '3px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' },
  
  dayNoteFull: { marginLeft: '60px', background: '#FFF9C4', padding: '8px', borderRadius: '6px', marginTop: '4px', fontSize: '13px', color: '#F57F17', fontWeight: 500, cursor: 'pointer' },
  dayNoteFullHorizontal: { marginLeft: 0 }
};