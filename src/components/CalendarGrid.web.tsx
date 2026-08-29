import React, { useMemo } from 'react';
import type { MenuPlan, Recipe, PlanAssignment } from '../models/types';
import type { MealSlot } from '../models/enums';
import { useI18n } from '../i18n';

export interface SlotRef { day: number; slot: MealSlot; }

export interface CalendarGridProps {
  plan: MenuPlan;
  onSlotPress: (day: number, slot: MealSlot) => void;
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
  draggingSlot = null, 
  onPickUp, 
  onCancelPickUp, 
  onMove, 
  onMoveToUnassigned, 
  onMoveFromUnassigned,
  orientation = 'vertical',
}) => {
  const { t } = useI18n();
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

      <div style={{ ...styles.container, ...(orientation === 'horizontal' ? styles.horizontalContainer : {}) }} aria-label={t('planning.calendarTitle')}>
        {Array.from({ length: plan.periodDays }, (_, day) => {
          const date = addDays(startDate, day);
          return (
            <div key={day} style={{ ...styles.dayRow, ...(orientation === 'horizontal' ? styles.horizontalDay : {}) }}>
              <div style={styles.date}>
                <strong>{WEEKDAYS[date.getDay()].slice(0, 3)}</strong>
                <span>{date.getDate()}</span>
                <small>{MONTHS[date.getMonth()]}</small>
              </div>
              
              <div style={{ ...styles.slots, ...(orientation === 'horizontal' ? { flexDirection: 'column' } : {}) }}>
                {SLOTS.map((slot) => {
                  const free = isFree(day, slot);
                  const recipe = getRecipe(day, slot);
                  const movable = Boolean(recipe);
                  const dragging = isDraggingSlot(day, slot);
                  
                  // Validación 100% tipada con tu MealType ('comida' | 'cena' | 'ambas')
                  const mealTypeMismatch = draggedRecipe?.mealType && draggedRecipe.mealType !== 'ambas' && draggedRecipe.mealType !== slot;
                  const isBlocked = draggingSlot && mealTypeMismatch; 
                  
                  // Validación 100% tipada con tu PrepTime
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
                      <small style={free ? styles.freeLabel : styles.label}>{slot}</small>
                      
                      {free && !recipe ? (
                        <span style={styles.freeValueEmpty}>{t('planning.notNeeded')}</span>
                      ) : (
                        <span style={styles.value}>{recipe?.name ?? t('planning.emptySlot')}</span>
                      )}
                    </div>
                  );
                })}
              </div>
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
  horizontalContainer: { display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden' },
  
  unassignedZone: {
    margin: '0 12px 12px', padding: '12px', border: '2px dashed #B0BEC5', borderRadius: 8, 
    background: '#ECEFF1', transition: 'all 0.2s', minHeight: '60px'
  },
  unassignedZoneActive: { borderColor: '#007AFF', background: '#E3F2FD' },
  unassignedTitle: { margin: '0 0 8px 0', fontSize: '12px', color: '#546E7A', textTransform: 'uppercase' },
  unassignedEmpty: { fontSize: '13px', color: '#90A4AE', margin: 0, fontStyle: 'italic' },
  unassignedList: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  unassignedCard: { background: '#FFF', border: '1px solid #CFD8DC', padding: '6px 12px', borderRadius: '16px', fontSize: '13px', cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },

  dayRow: { alignItems: 'stretch', display: 'flex', gap: 8, marginBottom: 7 },
  horizontalDay: { flex: '0 0 160px', flexDirection: 'column', marginBottom: 0 },
  date: { alignItems: 'center', color: '#667085', display: 'flex', flexDirection: 'column', fontSize: 11, justifyContent: 'center', minWidth: 48 },
  slots: { display: 'flex', flex: 1, gap: 7, flexDirection: 'row' },
  
  card: { background: '#F5F7FA', border: '1px solid #E6E9EE', borderRadius: 9, display: 'flex', flex: 1, flexDirection: 'column', minHeight: 58, padding: '8px 10px', userSelect: 'none', transition: 'all 0.2s ease' },
  label: { color: '#667085', fontWeight: 700, textTransform: 'uppercase' },
  value: { color: '#1A1A1A', fontSize: 13, marginTop: 3 },
  
  free: { background: '#FDECEA', borderColor: '#F5B7B1' },
  freeLabel: { color: '#C0392B', fontWeight: 700, textTransform: 'uppercase' },
  freeValueEmpty: { color: '#C0392B', fontSize: 13, fontWeight: 600, marginTop: 3, textDecoration: 'line-through' },
  
  dragging: { background: '#E3F2FD', border: '2px dashed #007AFF', opacity: 0.5 },
  
  blocked: { opacity: 0.3, filter: 'grayscale(100%)', background: '#e0e0e0' },
  complexRecipe: { borderLeft: '4px solid #F1C40F', background: '#FEF9E7' }
};
