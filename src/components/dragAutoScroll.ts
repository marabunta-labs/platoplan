/**
 * PlatoPlan - drag auto-scroll helpers
 *
 * Browsers only auto-scroll during an HTML5 drag when the pointer sits right on
 * the edge of the *window*, and not at all for nested scroll containers. When
 * the calendar has more rows than fit on screen, the drop target could not be
 * reached. These helpers compute how much a container should scroll per frame
 * while something is being dragged near its edges.
 */

export interface AxisRange {
  /** Container start edge in viewport coordinates (top / left). */
  start: number;
  /** Container end edge in viewport coordinates (bottom / right). */
  end: number;
}

export const AUTO_SCROLL_EDGE = 72;
export const AUTO_SCROLL_MAX_SPEED = 20;

/**
 * Returns the scroll delta (px per frame) for a pointer position along one axis.
 * Negative near the start edge, positive near the end edge, 0 elsewhere (and 0
 * when the pointer is outside the container). Speed ramps up towards the edge.
 */
export function computeAutoScrollDelta(
  pointer: number,
  range: AxisRange,
  edge: number = AUTO_SCROLL_EDGE,
  maxSpeed: number = AUTO_SCROLL_MAX_SPEED
): number {
  if (pointer < range.start || pointer > range.end) return 0;
  // Never let the two zones overlap on tiny containers.
  const zone = Math.min(edge, (range.end - range.start) / 2);
  if (zone <= 0) return 0;

  const fromStart = pointer - range.start;
  if (fromStart < zone) return -Math.ceil(maxSpeed * (1 - fromStart / zone));

  const fromEnd = range.end - pointer;
  if (fromEnd < zone) return Math.ceil(maxSpeed * (1 - fromEnd / zone));

  return 0;
}
