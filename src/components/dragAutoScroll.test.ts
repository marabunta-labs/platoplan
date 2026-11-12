import { describe, it, expect } from 'vitest';
import { computeAutoScrollDelta, AUTO_SCROLL_EDGE, AUTO_SCROLL_MAX_SPEED } from './dragAutoScroll';

const range = { start: 100, end: 700 };

describe('computeAutoScrollDelta', () => {
  it('does not scroll in the middle of the container', () => {
    expect(computeAutoScrollDelta(400, range)).toBe(0);
  });

  it('scrolls up (negative) near the start edge and down (positive) near the end', () => {
    expect(computeAutoScrollDelta(110, range)).toBeLessThan(0);
    expect(computeAutoScrollDelta(690, range)).toBeGreaterThan(0);
  });

  it('accelerates the closer the pointer is to the edge', () => {
    const far = Math.abs(computeAutoScrollDelta(100 + AUTO_SCROLL_EDGE - 10, range));
    const near = Math.abs(computeAutoScrollDelta(105, range));
    expect(near).toBeGreaterThan(far);
  });

  it('never exceeds the max speed', () => {
    expect(Math.abs(computeAutoScrollDelta(100, range))).toBeLessThanOrEqual(AUTO_SCROLL_MAX_SPEED);
    expect(Math.abs(computeAutoScrollDelta(700, range))).toBeLessThanOrEqual(AUTO_SCROLL_MAX_SPEED);
  });

  it('does nothing when the pointer is outside the container (e.g. over the tray)', () => {
    expect(computeAutoScrollDelta(50, range)).toBe(0);
    expect(computeAutoScrollDelta(800, range)).toBe(0);
  });

  it('handles containers smaller than two edge zones without overlapping', () => {
    const tiny = { start: 0, end: 40 };
    expect(computeAutoScrollDelta(10, tiny)).toBeLessThan(0);
    expect(computeAutoScrollDelta(30, tiny)).toBeGreaterThan(0);
    expect(computeAutoScrollDelta(20, tiny)).toBe(0);
  });

  it('returns 0 for a zero-size container', () => {
    expect(computeAutoScrollDelta(5, { start: 5, end: 5 })).toBe(0);
  });
});
