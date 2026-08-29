/**
 * PlatoPlan - Cross-platform Alert utility (Web)
 *
 * On web, uses window.confirm for two-button dialogs
 * and window.alert for single-button/informational alerts.
 * This replaces React Native's Alert.alert which is not supported
 * on web via react-native-web.
 *
 * Requirements: 3.7
 */

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/**
 * Cross-platform alert that works on web using browser dialogs.
 */
export const AlertCompat = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    const fullMessage = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length === 0 || buttons.length === 1) {
      // Simple informational alert
      globalThis.alert(fullMessage);
      if (buttons && buttons[0]?.onPress) {
        buttons[0].onPress();
      }
      return;
    }

    if (buttons.length === 2) {
      // Two-button dialog: use confirm
      const cancelButton = buttons.find((b) => b.style === 'cancel') ?? buttons[0];
      const confirmButton = buttons.find((b) => b.style !== 'cancel') ?? buttons[1];

      const result = globalThis.confirm(fullMessage);

      if (result) {
        confirmButton.onPress?.();
      } else {
        cancelButton.onPress?.();
      }
      return;
    }

    // Fallback for multi-button: just show alert and call first button
    globalThis.alert(fullMessage);
    buttons[0]?.onPress?.();
  },
};
