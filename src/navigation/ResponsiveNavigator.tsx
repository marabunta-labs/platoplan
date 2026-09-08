/**
 * PlatoPlan - Responsive navigator that switches between
 * sidebar (desktop, >= 768px) and bottom tabs (mobile, < 768px)
 * based on viewport width.
 *
 * Also renders the app "chrome": a branded header (brand + terms link,
 * language + theme toggles) and a footer (terms, copyright, attribution).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Linking } from 'react-native';

import { AppNavigator } from './AppNavigator';
import { SidebarNavigator } from './SidebarNavigator';
import { SyncStatusIndicator } from '../components/SyncStatusIndicator';
import { LanguageToggle } from '../components/LanguageToggle';
import { TermsModal } from '../components/TermsModal';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';

/** Breakpoint at which navigation switches from bottom tabs to sidebar */
export const DESKTOP_BREAKPOINT = 768;

const GITHUB_URL = 'https://github.com/marabunta-labs';

export function ResponsiveNavigator() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const { t } = useI18n();
  const { colors, isDark, toggleMode } = useTheme();

  // Extraemos isGuest del contexto de autenticación
  const { isGuest } = useAuth();
  const [termsVisible, setTermsVisible] = React.useState(false);

  const year = new Date().getFullYear();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.brand, { color: colors.text }]} accessibilityRole="header">
          🍽️ PlatoPlan
        </Text>
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          onPress={toggleMode}
          accessibilityRole="button"
          accessibilityLabel={isDark ? t('theme.toggleToLight') : t('theme.toggleToDark')}
          style={styles.themeToggle}
        >
          <Text style={styles.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
        <LanguageToggle />
        {/* Solo mostramos el indicador si el usuario NO es un invitado */}
        {!isGuest && <SyncStatusIndicator />}
      </View>

      <View style={styles.content}>
        {isDesktop ? <SidebarNavigator /> : <AppNavigator />}
      </View>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity onPress={() => setTermsVisible(true)} accessibilityRole="link">
          <Text style={[styles.footerLink, { color: colors.accent }]}>{t('terms.link')}</Text>
        </TouchableOpacity>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>{t('footer.copyright', { year })}</Text>
        <TouchableOpacity onPress={() => Linking.openURL(GITHUB_URL)} accessibilityRole="link" accessibilityLabel={t('footer.builtBy')}>
          <Text style={[styles.footerLink, { color: colors.accent }]}>{t('footer.builtBy')}</Text>
        </TouchableOpacity>
      </View>

      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    flex: 1,
  },
  themeToggle: {
    marginRight: 12,
    padding: 2,
  },
  themeToggleIcon: {
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontSize: 11,
  },
  footerLink: {
    fontSize: 11,
    fontWeight: '600',
  },
});
