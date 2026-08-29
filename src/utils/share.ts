/**
 * PlatoPlan - Share/Export utility
 * Uses React Native's built-in Share API (works on native and web).
 */

import { Share, Platform } from 'react-native';
import { AlertCompat } from './alert';

/**
 * Shares text content using the platform's native share dialog.
 * On web (react-native-web), Share.share copies to clipboard.
 */
export async function shareText(title: string, text: string): Promise<void> {
  try {
    await Share.share(
      { message: text, title },
      { dialogTitle: title }
    );
  } catch (error) {
    AlertCompat.alert('Error', 'No se pudo compartir el contenido.');
  }
}
