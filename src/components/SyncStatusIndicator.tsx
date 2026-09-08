/**
 * PlatoPlan - Sync Status Indicator
 *
 * A compact visual indicator that shows the current sync status.
 * Designed to be placed in the app header or navigation bar area.
 *
 * Statuses:
 * - syncing: ActivityIndicator spinner
 * - synced: ✓ (green checkmark)
 * - offline: ☁ (gray cloud with "Sin conexión" tooltip)
 * - error: ⚠ (orange warning)
 *
 * Requirements: 6.6
 */

import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { SyncStatus } from '../models/sync-types';
import { useSync } from '../context/SyncContext';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface SyncStatusIndicatorProps {
  /** Optional: show a text label alongside the icon */
  showLabel?: boolean;
}

/**
 * SyncStatusIndicator subscribes to the SyncManager's status changes
 * and renders the appropriate icon/spinner for the current sync state.
 */
export function SyncStatusIndicator({ showLabel = false }: SyncStatusIndicatorProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const syncManager = useSync();
  const [status, setStatus] = useState<SyncStatus>(syncManager.syncStatus);

  const statusConfig: Record<SyncStatus, { icon: string; color: string; label: string }> = {
    syncing: { icon: '', color: colors.accent, label: t('sync.syncing') },
    synced: { icon: '✓', color: colors.success, label: t('sync.synced') },
    offline: { icon: '☁', color: colors.textFaint, label: t('sync.offline') },
    error: { icon: '⚠', color: colors.warning, label: t('sync.error') },
  };

  useEffect(() => {
    const unsubscribe = syncManager.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });
    // Sync the initial status in case it changed before subscription
    setStatus(syncManager.syncStatus);
    return unsubscribe;
  }, [syncManager]);

  const config = statusConfig[status];

  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={config.label}>
      {status === 'syncing' ? (
        <ActivityIndicator size="small" color={config.color} />
      ) : (
        <Text style={[styles.icon, { color: config.color }]}>{config.icon}</Text>
      )}
      {showLabel && (
        <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  icon: {
    fontSize: 16,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    marginLeft: 4,
  },
});
