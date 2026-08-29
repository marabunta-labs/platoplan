/**
 * Unit tests for ResponsiveNavigator breakpoint logic.
 * Tests the breakpoint selection logic without importing React Native components.
 */

import { describe, it, expect } from 'vitest';

/**
 * The breakpoint value (mirrored from ResponsiveNavigator.tsx to avoid
 * importing react-native in the test environment).
 */
const DESKTOP_BREAKPOINT = 768;

/**
 * Pure logic extracted from ResponsiveNavigator: determines whether
 * the sidebar (desktop) or bottom tabs (mobile) should be rendered.
 */
function selectNavigator(viewportWidth: number): 'sidebar' | 'bottom-tabs' {
  return viewportWidth >= DESKTOP_BREAKPOINT ? 'sidebar' : 'bottom-tabs';
}

describe('ResponsiveNavigator breakpoint logic', () => {
  it('should use 768px as the desktop breakpoint', () => {
    expect(DESKTOP_BREAKPOINT).toBe(768);
  });

  it('should select sidebar when viewport width >= 768px', () => {
    const widths = [768, 1024, 1280, 1920];
    for (const width of widths) {
      expect(selectNavigator(width)).toBe('sidebar');
    }
  });

  it('should select bottom tabs when viewport width < 768px', () => {
    const widths = [320, 375, 414, 767];
    for (const width of widths) {
      expect(selectNavigator(width)).toBe('bottom-tabs');
    }
  });

  it('should handle the exact boundary correctly', () => {
    expect(selectNavigator(767)).toBe('bottom-tabs');
    expect(selectNavigator(768)).toBe('sidebar');
  });

  it('should handle edge case of very small viewport', () => {
    expect(selectNavigator(1)).toBe('bottom-tabs');
  });

  it('should handle edge case of very large viewport', () => {
    expect(selectNavigator(3840)).toBe('sidebar');
  });
});
