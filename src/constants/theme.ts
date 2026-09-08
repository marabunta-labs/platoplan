/**
 * PlatoPlan - Theme palettes
 *
 * Two colour palettes (light / dark) exposed as semantic tokens. Every screen
 * and component reads colours from here via `useTheme()` so the whole app
 * switches between light and dark consistently.
 *
 * Token groups:
 * - Surfaces:   background, surface, card, inputBg
 * - Text:       text, textMuted, textFaint, textInverse
 * - Lines:      border, borderStrong
 * - Brand:      accent, accentSoft, accentText
 * - Status:     danger/dangerBg/dangerText, success/successBg/successText,
 *               warning/warningBg/warningText
 * - Nav:        navActive, navInactive
 * - Misc:       chipBg, chipText, overlay, shadow
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  // Surfaces
  background: string;
  surface: string;
  card: string;
  inputBg: string;

  // Text
  text: string;
  textMuted: string;
  textFaint: string;
  textInverse: string;

  // Lines
  border: string;
  borderStrong: string;

  // Brand / accent
  accent: string;
  accentSoft: string;
  accentText: string;

  // Status - danger
  danger: string;
  dangerBg: string;
  dangerText: string;

  // Status - success
  success: string;
  successBg: string;
  successText: string;

  // Status - warning
  warning: string;
  warningBg: string;
  warningText: string;

  // Navigation
  navActive: string;
  navInactive: string;

  // Misc
  chipBg: string;
  chipText: string;
  overlay: string;
  shadow: string;
}

export const LIGHT_COLORS: ThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  card: '#F5F7FA',
  inputBg: '#FFFFFF',

  text: '#1A1A1A',
  textMuted: '#666666',
  textFaint: '#999999',
  textInverse: '#FFFFFF',

  border: '#E0E0E0',
  borderStrong: '#CCCCCC',

  accent: '#007AFF',
  accentSoft: '#E3F2FD',
  accentText: '#1565C0',

  danger: '#C0392B',
  dangerBg: '#FDECEA',
  dangerText: '#C0392B',

  success: '#34C759',
  successBg: '#E8F5E9',
  successText: '#237A45',

  warning: '#FF9500',
  warningBg: '#FFF9C4',
  warningText: '#F57F17',

  navActive: '#007AFF',
  navInactive: '#8A94A6',

  chipBg: '#E2E8F0',
  chipText: '#475569',
  overlay: 'rgba(0,0,0,0.5)',
  shadow: '#000000',
};

export const DARK_COLORS: ThemeColors = {
  background: '#121417',
  surface: '#1C1F24',
  card: '#232830',
  inputBg: '#232830',

  text: '#F5F7FA',
  textMuted: '#B4BCC8',
  textFaint: '#8A929E',
  textInverse: '#121417',

  border: '#2C313A',
  borderStrong: '#3A404B',

  accent: '#4C9AFF',
  accentSoft: '#1E2A3A',
  accentText: '#8FC0FF',

  danger: '#FF6B5E',
  dangerBg: '#3A1F1D',
  dangerText: '#FF8A80',

  success: '#4CD964',
  successBg: '#17301F',
  successText: '#7DDFA0',

  warning: '#FFB340',
  warningBg: '#33290E',
  warningText: '#FFD27A',

  navActive: '#4C9AFF',
  navInactive: '#7A828F',

  chipBg: '#2C313A',
  chipText: '#B4BCC8',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
};

export function colorsFor(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}
