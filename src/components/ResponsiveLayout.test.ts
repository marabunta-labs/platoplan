/**
 * Unit tests for ResponsiveLayout column computation logic.
 * Tests the multi-column breakpoint and column count calculation.
 *
 * Requirements: 3.2, 3.5
 */

import { describe, it, expect } from 'vitest';
import { computeColumnCount, MULTI_COLUMN_BREAKPOINT, DEFAULT_MIN_COLUMN_WIDTH } from './responsive-layout-utils';

describe('ResponsiveLayout - computeColumnCount', () => {
  it('should export 1024 as the multi-column breakpoint', () => {
    expect(MULTI_COLUMN_BREAKPOINT).toBe(1024);
  });

  it('should export 300 as the default minimum column width', () => {
    expect(DEFAULT_MIN_COLUMN_WIDTH).toBe(300);
  });

  it('should return 1 column when viewport <= 1024px', () => {
    const widths = [320, 375, 414, 768, 1024];
    for (const width of widths) {
      expect(computeColumnCount(width, DEFAULT_MIN_COLUMN_WIDTH)).toBe(1);
    }
  });

  it('should return multiple columns when viewport > 1024px', () => {
    // 1200px / 300px min = 4 columns
    expect(computeColumnCount(1200, 300)).toBe(4);
    // 1920px / 300px min = 6 columns
    expect(computeColumnCount(1920, 300)).toBe(6);
  });

  it('should compute column count based on minColumnWidth', () => {
    // 1200px / 400px = 3 columns
    expect(computeColumnCount(1200, 400)).toBe(3);
    // 1200px / 600px = 2 columns
    expect(computeColumnCount(1200, 600)).toBe(2);
  });

  it('should return at least 1 column even if minColumnWidth > viewport', () => {
    // 1200px with huge minColumnWidth — floor(1200/2000) = 0, but clamped to 1
    expect(computeColumnCount(1200, 2000)).toBe(1);
  });

  it('should handle boundary at 1025px (just above breakpoint)', () => {
    // 1025px / 300px = floor(3.41) = 3
    expect(computeColumnCount(1025, 300)).toBe(3);
  });

  it('should handle the exact breakpoint (1024px) as single column', () => {
    expect(computeColumnCount(1024, 300)).toBe(1);
  });

  it('should handle very wide viewports', () => {
    // 3840px / 300px = 12 columns
    expect(computeColumnCount(3840, 300)).toBe(12);
  });

  it('should handle small minColumnWidth', () => {
    // 1200px / 100px = 12 columns
    expect(computeColumnCount(1200, 100)).toBe(12);
  });
});
