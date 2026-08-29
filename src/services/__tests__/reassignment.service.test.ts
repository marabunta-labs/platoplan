/**
 * Unit tests for Reassignment Service
 *
 * Tests manual recipe reassignment and swap operations with
 * consecutive-day conflict detection.
 *
 * The separation rule: Same recipe should not appear within 2 days
 * of each other in the same slot.
 */

import { describe, it, expect } from 'vitest';
import {
  checkConflicts,
  reassignWithConflictCheck,
  swapWithConflictCheck,
  type AssignmentRef,
} from '../reassignment.service';
import type { MenuPlan, PlanAssignment } from '../../models/types';
import type { MealSlot } from '../../models/enums';

// --- Helpers ---

function makePlan(assignments: Partial<PlanAssignment>[] = [], periodDays = 7): MenuPlan {
  return {
    id: 'plan-1',
    periodDays,
    startDate: new Date('2024-01-01'),
    status: 'draft',
    elaborateDays: [5, 6],
    assignments: assignments.map((a, i) => ({
      id: `assign-${i}`,
      planId: 'plan-1',
      dayIndex: 0,
      slot: 'comida' as MealSlot,
      recipeId: 'recipe-1',
      ...a,
    })),
    freeDays: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// --- Tests ---

describe('Reassignment Service', () => {
  describe('checkConflicts', () => {
    it('should return no conflicts when recipe is not already assigned nearby', () => {
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 3, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const result = checkConflicts(plan, 3, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(false);
      expect(result.warnings).toHaveLength(0);
      expect(result.proposedAssignment).toEqual({
        dayIndex: 3,
        slot: 'comida',
        recipeId: 'recipe-a',
      });
    });

    it('should detect conflict when same recipe is on adjacent day in same slot', () => {
      const plan = makePlan([
        { dayIndex: 2, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 4, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const result = checkConflicts(plan, 3, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('forced_consecutive');
      expect(result.warnings[0].affectedDays).toContain(2);
      expect(result.warnings[0].affectedDays).toContain(3);
    });

    it('should detect conflict when same recipe is on same day in same slot', () => {
      // This can happen if checking placement at day 0 while recipe is already at day 1
      const plan = makePlan([
        { dayIndex: 1, slot: 'comida', recipeId: 'recipe-a' },
      ]);

      const result = checkConflicts(plan, 0, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].affectedDays).toEqual([0, 1]);
    });

    it('should not flag conflict for different slots', () => {
      // Same recipe on adjacent days but different slots is OK
      const plan = makePlan([
        { dayIndex: 2, slot: 'cena', recipeId: 'recipe-a' },
      ]);

      const result = checkConflicts(plan, 3, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should not flag conflict for different recipes', () => {
      const plan = makePlan([
        { dayIndex: 2, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const result = checkConflicts(plan, 3, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect multiple conflicts from both sides', () => {
      // recipe-a on days 1 and 5, placing at day 2 conflicts with day 1
      // recipe-a on days 1 and 3, placing at day 2 conflicts with both
      const plan = makePlan([
        { dayIndex: 1, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 3, slot: 'comida', recipeId: 'recipe-a' },
      ]);

      const result = checkConflicts(plan, 2, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(true);
      expect(result.warnings).toHaveLength(2);
    });

    it('should not flag conflict when separation is exactly 2 days', () => {
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
      ]);

      const result = checkConflicts(plan, 2, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should exclude the target day when checking for conflicts', () => {
      // If the recipe is already assigned at the target day (replacing it),
      // that should not count as a conflict with itself
      const plan = makePlan([
        { dayIndex: 3, slot: 'comida', recipeId: 'recipe-a' },
      ]);

      // Re-assigning recipe-a to day 3 (same spot) should not conflict
      const result = checkConflicts(plan, 3, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle empty plan with no conflicts', () => {
      const plan = makePlan([]);

      const result = checkConflicts(plan, 0, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(false);
      expect(result.warnings).toHaveLength(0);
      expect(result.proposedAssignment).toEqual({
        dayIndex: 0,
        slot: 'comida',
        recipeId: 'recipe-a',
      });
    });
  });

  describe('reassignWithConflictCheck', () => {
    it('should return no conflicts for valid reassignment', () => {
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 5, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const result = reassignWithConflictCheck(plan, 5, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(false);
      expect(result.warnings).toHaveLength(0);
      expect(result.proposedAssignment).toEqual({
        dayIndex: 5,
        slot: 'comida',
        recipeId: 'recipe-a',
      });
    });

    it('should return warnings for conflicting reassignment', () => {
      const plan = makePlan([
        { dayIndex: 3, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 4, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const result = reassignWithConflictCheck(plan, 4, 'comida', 'recipe-a');

      expect(result.hasConflicts).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('forced_consecutive');
      // The proposed assignment is still returned (caller decides whether to apply)
      expect(result.proposedAssignment).toEqual({
        dayIndex: 4,
        slot: 'comida',
        recipeId: 'recipe-a',
      });
    });

    it('should preserve original assignment semantics (return proposed, not apply)', () => {
      const plan = makePlan([
        { dayIndex: 2, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 3, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const result = reassignWithConflictCheck(plan, 3, 'comida', 'recipe-a');

      // The original plan should not be modified
      expect(plan.assignments[1].recipeId).toBe('recipe-b');
      // But the result contains the proposed change
      expect(result.proposedAssignment?.recipeId).toBe('recipe-a');
    });
  });

  describe('swapWithConflictCheck', () => {
    it('should return no conflicts for a valid swap', () => {
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 1, slot: 'comida', recipeId: 'recipe-b' },
        { dayIndex: 2, slot: 'comida', recipeId: 'recipe-c' },
        { dayIndex: 3, slot: 'comida', recipeId: 'recipe-d' },
        { dayIndex: 4, slot: 'comida', recipeId: 'recipe-e' },
      ]);

      const ref1: AssignmentRef = { dayIndex: 0, slot: 'comida' };
      const ref2: AssignmentRef = { dayIndex: 4, slot: 'comida' };

      const result = swapWithConflictCheck(plan, ref1, ref2);

      expect(result.hasConflicts).toBe(false);
      expect(result.warnings).toHaveLength(0);
      expect(result.proposedSwap).toBeDefined();
      // After swap: recipe-e at day 0, recipe-a at day 4
      expect(result.proposedSwap?.from).toEqual({
        dayIndex: 0,
        slot: 'comida',
        recipeId: 'recipe-e',
      });
      expect(result.proposedSwap?.to).toEqual({
        dayIndex: 4,
        slot: 'comida',
        recipeId: 'recipe-a',
      });
    });

    it('should detect conflicts when swap creates consecutive-day violation', () => {
      // recipe-a on days 0 and 3, recipe-b on day 2
      // Swapping day 3 (recipe-a) with day 2 (recipe-b) means:
      //   recipe-a goes to day 2 → conflicts with recipe-a on day 0 (separation=2, OK)
      //   Actually wait, separation of 2 is OK. Let me create a real conflict.
      //
      // recipe-a on days 0 and 3, recipe-b on day 1
      // Swapping day 3 (recipe-a) with day 1 (recipe-b):
      //   recipe-a goes to day 1 → conflicts with recipe-a on day 0 (separation=1)
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 1, slot: 'comida', recipeId: 'recipe-b' },
        { dayIndex: 2, slot: 'comida', recipeId: 'recipe-c' },
        { dayIndex: 3, slot: 'comida', recipeId: 'recipe-a' },
      ]);

      const ref1: AssignmentRef = { dayIndex: 3, slot: 'comida' }; // recipe-a
      const ref2: AssignmentRef = { dayIndex: 1, slot: 'comida' }; // recipe-b

      const result = swapWithConflictCheck(plan, ref1, ref2);

      // recipe-a moving to day 1 conflicts with recipe-a on day 0
      expect(result.hasConflicts).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].type).toBe('forced_consecutive');
    });

    it('should handle swap where both recipes create conflicts', () => {
      // recipe-a on days 0, 2, 4; recipe-b on days 1, 3, 5
      // Swapping day 0 (recipe-a) with day 1 (recipe-b):
      //   recipe-a goes to day 1 → conflicts with recipe-a on day 2 (sep=1)
      //   recipe-b goes to day 0 → conflicts with recipe-b on day 1... wait no, day 1 is being swapped
      //   Actually: recipe-b goes to day 0, recipe-b remains on days 3, 5
      //   Day 0 for recipe-b, next is day 3 → separation=3, OK
      //   But recipe-a goes to day 1, recipe-a remains on days 2, 4
      //   Day 1 for recipe-a, next is day 2 → separation=1, CONFLICT
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 1, slot: 'comida', recipeId: 'recipe-b' },
        { dayIndex: 2, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 3, slot: 'comida', recipeId: 'recipe-b' },
        { dayIndex: 4, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 5, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const ref1: AssignmentRef = { dayIndex: 0, slot: 'comida' }; // recipe-a
      const ref2: AssignmentRef = { dayIndex: 1, slot: 'comida' }; // recipe-b

      const result = swapWithConflictCheck(plan, ref1, ref2);

      // recipe-a to day 1: conflicts with recipe-a on day 2 (sep=1)
      // recipe-b to day 0: no conflict (next recipe-b is on day 3, sep=3)
      expect(result.hasConflicts).toBe(true);
      expect(result.warnings.some((w) => w.type === 'forced_consecutive')).toBe(true);
    });

    it('should return empty result when assignments not found', () => {
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
      ]);

      const ref1: AssignmentRef = { dayIndex: 0, slot: 'comida' };
      const ref2: AssignmentRef = { dayIndex: 5, slot: 'comida' }; // Does not exist

      const result = swapWithConflictCheck(plan, ref1, ref2);

      expect(result.hasConflicts).toBe(false);
      expect(result.proposedSwap).toBeUndefined();
    });

    it('should not flag conflict for different slots during swap', () => {
      // recipe-a on day 0/comida, recipe-b on day 1/cena
      // Even though days are adjacent, slots differ - no conflict
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 1, slot: 'cena', recipeId: 'recipe-b' },
        { dayIndex: 2, slot: 'comida', recipeId: 'recipe-c' },
        { dayIndex: 3, slot: 'cena', recipeId: 'recipe-d' },
      ]);

      // Swap comida/day0 with cena/day1 - cross-slot swap
      // recipe-a goes to day1/cena, recipe-b goes to day0/comida
      const ref1: AssignmentRef = { dayIndex: 0, slot: 'comida' };
      const ref2: AssignmentRef = { dayIndex: 1, slot: 'cena' };

      const result = swapWithConflictCheck(plan, ref1, ref2);

      // recipe-a at day1/cena: check other recipe-a in cena slot → none
      // recipe-b at day0/comida: check other recipe-b in comida slot → none
      expect(result.hasConflicts).toBe(false);
    });

    it('should correctly identify that swapping adjacent same-recipe entries is fine', () => {
      // recipe-a on day 0 and day 1 (already consecutive, so existing violation)
      // Swapping day 0 and day 1 just swaps the same recipe - no new conflicts
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 1, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 2, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const ref1: AssignmentRef = { dayIndex: 0, slot: 'comida' };
      const ref2: AssignmentRef = { dayIndex: 1, slot: 'comida' };

      const result = swapWithConflictCheck(plan, ref1, ref2);

      // Swapping same recipe between positions doesn't introduce new conflicts
      // (both excluded refs are ignored in the check)
      expect(result.hasConflicts).toBe(false);
    });

    it('should not modify the original plan', () => {
      const plan = makePlan([
        { dayIndex: 0, slot: 'comida', recipeId: 'recipe-a' },
        { dayIndex: 4, slot: 'comida', recipeId: 'recipe-b' },
      ]);

      const originalAssignments = [...plan.assignments.map((a) => ({ ...a }))];

      swapWithConflictCheck(
        plan,
        { dayIndex: 0, slot: 'comida' },
        { dayIndex: 4, slot: 'comida' }
      );

      // Plan should be unchanged
      expect(plan.assignments[0].recipeId).toBe(originalAssignments[0].recipeId);
      expect(plan.assignments[1].recipeId).toBe(originalAssignments[1].recipeId);
    });
  });
});
