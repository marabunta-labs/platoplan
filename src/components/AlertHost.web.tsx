/**
 * PlatoPlan - AlertHost (Web)
 *
 * Renders in-app floating alert dialogs on web, replacing the browser's native
 * window.alert / window.confirm so ALL messages share the same floating style
 * as the app's other dialogs (ConfirmDialog, modals).
 *
 * The queue/logic lives in alertStore.web.ts (framework-free); this component
 * (mounted once at the app root) subscribes and renders the dialogs.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { subscribeToAlerts, type AlertButton, type AlertRequest } from './alertStore.web';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

// Re-export so existing imports of showAppAlert from this module keep working.
export { showAppAlert } from './alertStore.web';

function buttonStyle(styles: ReturnType<typeof makeStyles>, style?: AlertButton['style']) {
  if (style === 'destructive') return { bg: styles.destructiveButton, text: styles.destructiveText };
  if (style === 'cancel') return { bg: styles.cancelButton, text: styles.cancelText };
  return { bg: styles.defaultButton, text: styles.defaultText };
}

export function AlertHost() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [queue, setQueue] = useState<AlertRequest[]>([]);

  useEffect(() => subscribeToAlerts((req) => setQueue((q) => [...q, req])), []);

  const current = queue[0];

  const dismiss = (button?: AlertButton) => {
    setQueue((q) => q.slice(1));
    button?.onPress?.();
  };

  return (
    <Modal
      visible={!!current}
      transparent
      animationType="fade"
      onRequestClose={() => dismiss(current?.buttons.find((b) => b.style === 'cancel') ?? current?.buttons[current.buttons.length - 1])}
    >
      <View style={styles.overlay}>
        {current && (
          <View style={styles.dialog} accessibilityRole="alert">
            <Text style={styles.title}>{current.title}</Text>
            {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
            <View style={styles.actions}>
              {current.buttons.map((button, index) => {
                const bs = buttonStyle(styles, button.style);
                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => dismiss(button)}
                    style={[styles.button, bs.bg]}
                    accessibilityRole="button"
                    accessibilityLabel={button.text}
                  >
                    <Text style={bs.text}>{button.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: 12, padding: 24, width: '100%', maxWidth: 360 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 8 },
  message: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  defaultButton: { backgroundColor: colors.accent },
  defaultText: { fontSize: 14, fontWeight: '600', color: colors.textInverse },
  cancelButton: { backgroundColor: colors.border },
  cancelText: { fontSize: 14, fontWeight: '500', color: colors.text },
  destructiveButton: { backgroundColor: colors.danger },
  destructiveText: { fontSize: 14, fontWeight: '600', color: colors.textInverse },
});
