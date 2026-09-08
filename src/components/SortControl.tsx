/**
 * PlatoPlan - SortControl
 *
 * A single, consistent sorting control reused across all list screens
 * (recipes, pantry, shopping list). It shows one chip per sort field plus a
 * direction toggle (A→Z / Z→A), so ordering behaves and looks the same
 * everywhere.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export type SortDirection = 'asc' | 'desc';

export interface SortField<K extends string = string> {
  key: K;
  label: string;
}

export interface SortControlProps<K extends string = string> {
  fields: SortField<K>[];
  activeField: K;
  direction: SortDirection;
  onFieldChange: (key: K) => void;
  onDirectionToggle: () => void;
}

export function SortControl<K extends string = string>({
  fields,
  activeField,
  direction,
  onFieldChange,
  onDirectionToggle,
}: SortControlProps<K>) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container} accessibilityRole="toolbar">
      <Text style={styles.label}>{t('common.sortBy')}</Text>
      <View style={styles.fields}>
        {fields.map((field) => {
          const active = field.key === activeField;
          return (
            <TouchableOpacity
              key={field.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onFieldChange(field.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={field.label}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{field.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={styles.direction}
        onPress={onDirectionToggle}
        accessibilityRole="button"
        accessibilityLabel={direction === 'asc' ? t('common.sortDescending') : t('common.sortAscending')}
      >
        <Text style={styles.directionText}>{direction === 'asc' ? 'A→Z' : 'Z→A'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  label: { fontSize: 12, color: colors.textFaint, fontWeight: '600' },
  fields: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  chipTextActive: { color: colors.textInverse },
  direction: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.border },
  directionText: { fontSize: 13, fontWeight: '700', color: colors.accent },
});
