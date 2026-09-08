/**
 * PlatoPlan - CalendarPicker
 * Compact inline calendar for selecting a date range.
 * User taps the start date first, then the end date.
 * Shows two months side by side when the viewport is wide enough, so ranges
 * that cross a month boundary stay visible without navigating.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface CalendarPickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onStartDateSelect: (date: Date) => void;
  onEndDateSelect: (date: Date) => void;
  /** Maximum number of days allowed in range (default 30) */
  maxRangeDays?: number;
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Below this width only one month fits comfortably. */
const TWO_MONTH_BREAKPOINT = 640;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isInRange(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const d = date.getTime();
  return d >= start.getTime() && d <= end.getTime();
}

function normalizeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatDateShort(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function daysBetween(start: Date, end: Date): number {
  const msPerDay = 86400000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}

/** Monday-based cell layout for a single month, padded with nulls. */
function buildMonthCells(month: Date): (Date | null)[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  let startDow = new Date(year, monthIndex, 1).getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: startDow }, () => null);

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, monthIndex, d));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

interface MonthViewProps {
  month: Date;
  today: Date;
  start: Date | null;
  end: Date | null;
  onDayPress: (date: Date) => void;
  styles: ReturnType<typeof makeStyles>;
}

function MonthView({ month, today, start, end, onDayPress, styles }: MonthViewProps) {
  const cells = useMemo(() => buildMonthCells(month), [month]);

  return (
    <View style={styles.month}>
      <Text style={styles.monthTitle}>
        {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
      </Text>

      <View style={styles.weekRow}>
        {DAY_LABELS.map((label, index) => (
          <View key={`${label}-${index}`} style={styles.weekCell}>
            <Text style={styles.weekLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date, index) => {
          if (!date) {
            return <View key={`blank-${index}`} style={styles.dayCell} />;
          }

          const isToday = isSameDay(date, today);
          const isStart = start ? isSameDay(date, start) : false;
          const isEnd = end ? isSameDay(date, end) : false;
          const inRange = isInRange(date, start, end);
          const isPast = date.getTime() < today.getTime();

          return (
            <TouchableOpacity
              key={date.toISOString()}
              style={styles.dayCell}
              onPress={() => onDayPress(date)}
              disabled={isPast}
              accessibilityRole="button"
              accessibilityLabel={`${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`}
              accessibilityState={{ selected: isStart || isEnd, disabled: isPast }}
            >
              <View
                style={[
                  styles.dayPill,
                  inRange && styles.dayPillInRange,
                  (isStart || isEnd) && styles.dayPillSelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    isToday && styles.dayTextToday,
                    (isStart || isEnd) && styles.dayTextSelected,
                    isPast && styles.dayTextPast,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export const CalendarPicker: React.FC<CalendarPickerProps> = ({
  startDate,
  endDate,
  onStartDateSelect,
  onEndDateSelect,
  maxRangeDays = 30,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const showTwoMonths = width >= TWO_MONTH_BREAKPOINT;

  const today = useMemo(() => normalizeDate(new Date()), []);
  const [viewMonth, setViewMonth] = useState(() => {
    const anchor = startDate ?? today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  const normalizedStart = startDate ? normalizeDate(startDate) : null;
  const normalizedEnd = endDate ? normalizeDate(endDate) : null;

  // Keep the end of the range in view when it falls outside the shown months.
  useEffect(() => {
    if (!normalizedEnd) return;
    const lastVisible = showTwoMonths ? addMonths(viewMonth, 1) : viewMonth;
    const endMonth = new Date(normalizedEnd.getFullYear(), normalizedEnd.getMonth(), 1);
    if (endMonth.getTime() > lastVisible.getTime()) {
      setViewMonth(showTwoMonths ? addMonths(endMonth, -1) : endMonth);
    }
  }, [normalizedEnd?.getTime(), showTwoMonths]);

  const goToPrevMonth = useCallback(() => setViewMonth((prev) => addMonths(prev, -1)), []);
  const goToNextMonth = useCallback(() => setViewMonth((prev) => addMonths(prev, 1)), []);

  const [selectionPhase, setSelectionPhase] = useState<'start' | 'end'>(
    startDate && !endDate ? 'end' : 'start'
  );

  const handleDayPress = useCallback(
    (date: Date) => {
      if (selectionPhase === 'start') {
        onStartDateSelect(date);
        setSelectionPhase('end');
        return;
      }
      // Tapping before the start restarts the range instead of creating an invalid one.
      if (startDate && date.getTime() < normalizeDate(startDate).getTime()) {
        onStartDateSelect(date);
        return;
      }
      onEndDateSelect(date);
      setSelectionPhase('start');
    },
    [selectionPhase, startDate, onStartDateSelect, onEndDateSelect]
  );

  const rangeLength =
    normalizedStart && normalizedEnd ? daysBetween(normalizedStart, normalizedEnd) : 0;

  return (
    <View style={styles.container}>
      {/* Range summary */}
      <View style={styles.summary}>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>Inicio</Text>
          <Text style={[styles.summaryValue, selectionPhase === 'start' && styles.summaryValueActive]}>
            {normalizedStart ? formatDateShort(normalizedStart) : '—'}
          </Text>
        </View>
        <Text style={styles.summaryArrow}>→</Text>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>Fin</Text>
          <Text style={[styles.summaryValue, selectionPhase === 'end' && styles.summaryValueActive]}>
            {normalizedEnd ? formatDateShort(normalizedEnd) : '—'}
          </Text>
        </View>
        {rangeLength > 0 && (
          <View style={styles.summaryBadge}>
            <Text style={styles.summaryBadgeText}>{rangeLength} días</Text>
          </View>
        )}
      </View>

      {rangeLength > maxRangeDays && (
        <Text style={styles.rangeError}>Máximo {maxRangeDays} días</Text>
      )}

      <Text style={styles.hint}>
        {selectionPhase === 'start'
          ? 'Selecciona la fecha de inicio'
          : 'Selecciona la fecha de fin'}
      </Text>

      {/* Month navigation */}
      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={goToPrevMonth}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
        >
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={goToNextMonth}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
        >
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.monthsRow}>
        <MonthView
          month={viewMonth}
          today={today}
          start={normalizedStart}
          end={normalizedEnd}
          onDayPress={handleDayPress}
          styles={styles}
        />
        {showTwoMonths && (
          <MonthView
            month={addMonths(viewMonth, 1)}
            today={today}
            start={normalizedStart}
            end={normalizedEnd}
            onDayPress={handleDayPress}
            styles={styles}
          />
        )}
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryBlock: {
    minWidth: 90,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textFaint,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  summaryValueActive: {
    color: colors.accent,
  },
  summaryArrow: {
    fontSize: 16,
    color: colors.textFaint,
  },
  summaryBadge: {
    marginLeft: 'auto',
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  summaryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentText,
  },
  rangeError: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 6,
  },
  hint: {
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 8,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.border,
  },
  navButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.accent,
    lineHeight: 22,
  },
  monthsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  month: {
    flex: 1,
    minWidth: 0,
  },
  monthTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 4,
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textFaint,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillInRange: {
    backgroundColor: colors.accentSoft,
  },
  dayPillSelected: {
    backgroundColor: colors.accent,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  dayTextToday: {
    color: colors.accent,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  dayTextPast: {
    color: colors.textFaint,
  },
});
