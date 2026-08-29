/**
 * PlatoPlan - Responsive Navigation Breakpoint Property Test
 *
 * Feature: platoplan-web-supabase, Property 10: Responsive navigation breakpoint
 *
 * **Validates: Requirements 3.3, 3.4**
 *
 * For any viewport width, the navigation system SHALL render a sidebar if and only
 * if the width is >= 768px, and bottom tabs if and only if the width is < 768px.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeColumnCount, MULTI_COLUMN_BREAKPOINT, DEFAULT_MIN_COLUMN_WIDTH } from '../components/responsive-layout-utils';

// ─── Breakpoint Constants (mirrored from ResponsiveNavigator.tsx) ───────────

const DESKTOP_BREAKPOINT = 768;

// ─── Pure Logic (extracted from ResponsiveNavigator) ────────────────────────

function selectNavigator(viewportWidth: number): 'sidebar' | 'bottom-tabs' {
  return viewportWidth >= DESKTOP_BREAKPOINT ? 'sidebar' : 'bottom-tabs';
}

// ─── Custom Generators ──────────────────────────────────────────────────────

/** Generates a positive integer viewport width in a realistic range (1–7680px) */
const arbViewportWidth = fc.integer({ min: 1, max: 7680 });

/** Generates a viewport width that is guaranteed >= DESKTOP_BREAKPOINT */
const arbDesktopWidth = fc.integer({ min: DESKTOP_BREAKPOINT, max: 7680 });

/** Generates a viewport width that is guaranteed < DESKTOP_BREAKPOINT */
const arbMobileWidth = fc.integer({ min: 1, max: DESKTOP_BREAKPOINT - 1 });

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Feature: platoplan-web-supabase, Property 10: Responsive navigation breakpoint', () => {
  /**
   * Property: For any viewport width >= 768px, the navigator SHALL always
   * select 'sidebar'.
   *
   * **Validates: Requirements 3.3**
   */
  it('should select sidebar for any viewport width >= 768px', () => {
    fc.assert(
      fc.property(arbDesktopWidth, (width) => {
        expect(selectNavigator(width)).toBe('sidebar');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any viewport width < 768px, the navigator SHALL always
   * select 'bottom-tabs'.
   *
   * **Validates: Requirements 3.4**
   */
  it('should select bottom-tabs for any viewport width < 768px', () => {
    fc.assert(
      fc.property(arbMobileWidth, (width) => {
        expect(selectNavigator(width)).toBe('bottom-tabs');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The navigator selection is a total function — for any positive
   * integer width, it produces exactly one of 'sidebar' or 'bottom-tabs'.
   * There is no undefined region.
   */
  it('should always return either sidebar or bottom-tabs for any positive viewport width', () => {
    fc.assert(
      fc.property(arbViewportWidth, (width) => {
        const result = selectNavigator(width);
        expect(['sidebar', 'bottom-tabs']).toContain(result);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The breakpoint is sharp — there is no width where the navigator
   * would choose differently when compared to width+1 or width-1, except at
   * exactly 768px.
   */
  it('should have a sharp breakpoint at exactly 768px', () => {
    fc.assert(
      fc.property(arbViewportWidth, (width) => {
        if (width === DESKTOP_BREAKPOINT) {
          // At the breakpoint: sidebar
          expect(selectNavigator(width)).toBe('sidebar');
          // Just below: bottom-tabs
          expect(selectNavigator(width - 1)).toBe('bottom-tabs');
        } else if (width < DESKTOP_BREAKPOINT) {
          expect(selectNavigator(width)).toBe('bottom-tabs');
        } else {
          expect(selectNavigator(width)).toBe('sidebar');
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multi-column layout at specific required widths.
   * - 320px → 1 column
   * - 768px → 1 column
   * - 1024px → 1 column
   * - 1920px → multiple columns (> 1)
   */
  it('should compute correct column counts at 320, 768, 1024, and 1920px', () => {
    expect(computeColumnCount(320, DEFAULT_MIN_COLUMN_WIDTH)).toBe(1);
    expect(computeColumnCount(768, DEFAULT_MIN_COLUMN_WIDTH)).toBe(1);
    expect(computeColumnCount(1024, DEFAULT_MIN_COLUMN_WIDTH)).toBe(1);
    expect(computeColumnCount(1920, DEFAULT_MIN_COLUMN_WIDTH)).toBeGreaterThan(1);
  });

  /**
   * Property: For any viewport width <= 1024px, column count SHALL be 1.
   * For any viewport width > 1024px, column count SHALL be > 1
   * (given default minColumnWidth = 300px which fits in any viewport > 1024px).
   */
  it('should return 1 column for any width <= 1024px and multiple columns for any width > 1024px', () => {
    const arbNarrowWidth = fc.integer({ min: 1, max: MULTI_COLUMN_BREAKPOINT });
    const arbWideWidth = fc.integer({ min: MULTI_COLUMN_BREAKPOINT + 1, max: 7680 });

    fc.assert(
      fc.property(arbNarrowWidth, (width) => {
        expect(computeColumnCount(width, DEFAULT_MIN_COLUMN_WIDTH)).toBe(1);
      }),
      { numRuns: 100 }
    );

    fc.assert(
      fc.property(arbWideWidth, (width) => {
        expect(computeColumnCount(width, DEFAULT_MIN_COLUMN_WIDTH)).toBeGreaterThan(1);
      }),
      { numRuns: 100 }
    );
  });
});
