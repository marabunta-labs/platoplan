/**
 * PlatoPlan - Cross-platform Alert utility (Web)
 *
 * On web, alerts render as in-app FLOATING dialogs (via AlertHost) instead of
 * the browser's native window.alert/confirm, so every message in the app shares
 * the same floating style (no mix of browser + in-app dialogs).
 *
 * Requirements: 3.7
 */

import { showAppAlert } from '../components/alertStore.web';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export const AlertCompat = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    showAppAlert(title, message, buttons);
  },
};
