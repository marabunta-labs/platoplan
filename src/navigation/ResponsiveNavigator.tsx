/**
 * PlatoPlan - Responsive navigator that switches between
 * sidebar (desktop, >= 768px) and bottom tabs (mobile, < 768px)
 * based on viewport width.
 */

import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

import { AppNavigator } from './AppNavigator';
import { SidebarNavigator } from './SidebarNavigator';
import { SyncStatusIndicator } from '../components/SyncStatusIndicator';
import { LanguageToggle } from '../components/LanguageToggle';

import { useAuth } from '../context/AuthContext';

/** Breakpoint at which navigation switches from bottom tabs to sidebar */
export const DESKTOP_BREAKPOINT = 768;

export function ResponsiveNavigator() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  
  // Extraemos isGuest del contexto de autenticación
  const { isGuest } = useAuth();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <LanguageToggle />
        {/* Solo mostramos el indicador si el usuario NO es un invitado */}
        {!isGuest && <SyncStatusIndicator />}
      </View>
      <View style={styles.content}>
        {isDesktop ? <SidebarNavigator /> : <AppNavigator />}
      </View>
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
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 2,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerSpacer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});