/**
 * PlatoPlan - Cross-platform Alert utility (Native)
 *
 * On native, delegates to React Native's Alert.alert().
 * On web, a `.web.ts` variant uses window.confirm/window.alert.
 *
 * Requirements: 3.7
 */

import { Alert as RNAlert } from 'react-native';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/**
 * Cross-platform alert that works on both native and web.
 */
export const AlertCompat = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    RNAlert.alert(
      title,
      message,
      buttons?.map((b) => ({
        text: b.text,
        onPress: b.onPress,
        style: b.style,
      }))
    );
  },
};
