/**
 * PlatoPlan - Language Toggle
 *
 * A compact ES | EN toggle for switching the app locale.
 * Designed to sit in the navigation header alongside SyncStatusIndicator.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container} accessibilityRole="radiogroup" accessibilityLabel="Language selector">
      <TouchableOpacity
        onPress={() => setLocale('es')}
        style={[styles.option, locale === 'es' && styles.optionActive]}
        accessibilityRole="radio"
        accessibilityState={{ selected: locale === 'es' }}
        accessibilityLabel="Español"
      >
        <Text style={[styles.optionText, locale === 'es' && styles.optionTextActive]}>ES</Text>
      </TouchableOpacity>
      <Text style={styles.separator}>|</Text>
      <TouchableOpacity
        onPress={() => setLocale('en')}
        style={[styles.option, locale === 'en' && styles.optionActive]}
        accessibilityRole="radio"
        accessibilityState={{ selected: locale === 'en' }}
        accessibilityLabel="English"
      >
        <Text style={[styles.optionText, locale === 'en' && styles.optionTextActive]}>EN</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  option: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionActive: {
    backgroundColor: colors.accent,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textFaint,
  },
  optionTextActive: {
    color: colors.textInverse,
  },
  separator: {
    fontSize: 12,
    color: colors.border,
    marginHorizontal: 2,
  },
});
