/**
 * PlatoPlan - Guest Banner
 *
 * Displays a subtle banner when the user is in guest mode,
 * prompting them to register for cloud sync.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

export function GuestBanner() {
  const { isGuest, exitGuestMode } = useAuth();
  const { t } = useI18n();

  if (!isGuest) return null;

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.text}>{t('auth.guestBanner')}</Text>
      <TouchableOpacity
        onPress={exitGuestMode}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={t('auth.registerToSave')}
      >
        <Text style={styles.buttonText}>{t('auth.registerToSave')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
  },
  button: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
