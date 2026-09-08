/**
 * PlatoPlan - Typography
 *
 * A single font family applied app-wide so every screen uses the same typeface.
 * On web we use the native system font stack; on native we let the platform
 * default render (San Francisco / Roboto), which visually matches the web stack.
 */

import { Platform, Text, TextInput } from 'react-native';

/** The app-wide font family (web system stack; native uses platform default). */
export const FONT_FAMILY = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined, // native: platform default (SF / Roboto)
});

/**
 * Applies the app-wide font family as the default style for all Text and
 * TextInput components. Call once at app startup (before rendering).
 */
export function applyGlobalFont(): void {
  if (!FONT_FAMILY) return;

  const components: any[] = [Text, TextInput];
  for (const Component of components) {
    // React Native components expose a mutable defaultProps we can extend so
    // every instance inherits the font without touching each StyleSheet.
    Component.defaultProps = Component.defaultProps || {};
    const existing = Component.defaultProps.style;
    Component.defaultProps.style = [{ fontFamily: FONT_FAMILY }, existing].filter(Boolean);
  }
}
