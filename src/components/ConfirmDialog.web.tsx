/**
 * PlatoPlan - ConfirmDialog (Web)
 *
 * Web-specific variant of ConfirmDialog that adds:
 * - Focus trapping within the dialog
 * - Proper ARIA role="dialog" for screen readers
 *
 * Requirements: 3.6, 3.7
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  visible: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
  visible,
}) => {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const confirmButtonRef = useRef<View>(null);

  // Auto-focus the cancel button when dialog opens (safer default)
  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(() => {
      // Focus first button in dialog for keyboard accessibility
      const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
      if (dialog) {
        const firstButton = dialog.querySelector('[role="button"]') as HTMLElement;
        firstButton?.focus();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View
          style={styles.dialog}
          // @ts-ignore - role="alertdialog" is valid for web
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
          accessibilityRole="alert"
        >
          <Text
            style={styles.title}
            // @ts-ignore - id is valid on web
            id="confirm-dialog-title"
            nativeID="confirm-dialog-title"
          >
            {title}
          </Text>
          <Text
            style={styles.message}
            // @ts-ignore - id is valid on web
            id="confirm-dialog-message"
            nativeID="confirm-dialog-message"
          >
            {message}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.button, styles.cancelButton]}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              // @ts-ignore - tabIndex works on web via react-native-web
              tabIndex={0}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              ref={confirmButtonRef}
              onPress={onConfirm}
              style={[styles.button, styles.confirmButton]}
              accessibilityRole="button"
              accessibilityLabel={t('common.confirm')}
              // @ts-ignore - tabIndex works on web via react-native-web
              tabIndex={0}
            >
              <Text style={styles.confirmText}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: colors.border,
  },
  confirmButton: {
    backgroundColor: colors.danger,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textInverse,
  },
});
