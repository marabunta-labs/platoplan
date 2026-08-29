/**
 * PlatoPlan - ResponsiveLayout utility functions (pure logic, no React Native dependencies)
 * Extracted for testability in environments that cannot parse react-native.
 *
 * Requirements: 3.2, 3.5
 */

/** Breakpoint above which multi-column layout is used */
export const MULTI_COLUMN_BREAKPOINT = 1024;

/** Default minimum width for a single column */
export const DEFAULT_MIN_COLUMN_WIDTH = 300;

/**
 * Computes the number of columns based on viewport width and minimum column width.
 * Returns 1 when viewport is at or below the multi-column breakpoint.
 */
export function computeColumnCount(viewportWidth: number, minColumnWidth: number): number {
  if (viewportWidth <= MULTI_COLUMN_BREAKPOINT) {
    return 1;
  }
  return Math.max(1, Math.floor(viewportWidth / minColumnWidth));
}
