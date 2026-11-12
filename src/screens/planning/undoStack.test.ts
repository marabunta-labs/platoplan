import { describe, it, expect } from 'vitest';
import { pushSnapshot, popSnapshot, UNDO_LIMIT, type PlanSnapshot } from './undoStack';

const snap = (n: number): PlanSnapshot => ({
  assignments: [{ dayIndex: n, slot: 'comida', recipeId: `r${n}` }],
  freeDays: [],
  mealNotes: {},
  unassigned: [],
});

describe('undo stack', () => {
  it('pops the most recent snapshot first', () => {
    let stack = pushSnapshot([], snap(1));
    stack = pushSnapshot(stack, snap(2));
    const { stack: rest, snapshot } = popSnapshot(stack);
    expect(snapshot).toEqual(snap(2));
    expect(rest).toEqual([snap(1)]);
  });

  it('returns null on an empty stack', () => {
    expect(popSnapshot([])).toEqual({ stack: [], snapshot: null });
  });

  it('does not stack identical consecutive snapshots', () => {
    const stack = pushSnapshot(pushSnapshot([], snap(1)), snap(1));
    expect(stack).toHaveLength(1);
  });

  it('keeps only the newest UNDO_LIMIT entries', () => {
    let stack: PlanSnapshot[] = [];
    for (let i = 0; i < UNDO_LIMIT + 5; i++) stack = pushSnapshot(stack, snap(i));
    expect(stack).toHaveLength(UNDO_LIMIT);
    expect(stack[0]).toEqual(snap(5));
  });

  it('does not mutate the input stack', () => {
    const stack = [snap(1)];
    pushSnapshot(stack, snap(2));
    expect(stack).toHaveLength(1);
  });
});
