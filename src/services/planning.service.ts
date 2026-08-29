/**
 * Planning Service - Business logic layer for menu plan management.
 * Validates plan configurations, enforces recipe type constraints,
 * calculates required meal slots accounting for free days, and
 * validates exact count match before plan confirmation.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MenuPlan } from '../models/types';
import type { MealSlot, FreeDayType } from '../models/enums';
import type { PlanConfig } from '../models/inputs';
import type { ValidationError, ConstraintError } from '../models/errors';
import * as planRepository from '../repositories/plan.repository';
import * as assignmentRepository from '../repositories/assignment.repository';
import * as recipeRepository from '../repositories/recipe.repository';

/** Reference to a specific day/slot assignment for swapping */
export interface SlotRef {
  dayIndex: number;
  slot: MealSlot;
}

/** Changes that can be applied to an existing plan */
export interface PlanChanges {
  status?: 'draft' | 'confirmed';
  elaborateDays?: number[];
  servings?: number;
  /** Confirm the plan even if some slots have no recipe assigned. */
  allowGaps?: boolean;
}

export type PlanningServiceError = ValidationError | ConstraintError;

export interface PlanningServiceResult<T> {
  success: true;
  data: T;
}

export interface PlanningServiceFailure {
  success: false;
  error: PlanningServiceError;
}

export type ServiceResult<T> = PlanningServiceResult<T> | PlanningServiceFailure;

/**
 * Calculates the number of required lunches given period days and free days.
 * Required lunches = periodDays - count of free days where type is 'comida' or 'ambas'
 */
export function calculateRequiredLunches(
  periodDays: number,
  freeDays: { dayIndex: number; type: FreeDayType }[]
): number {
  const lunchFreeDays = freeDays.filter(
    (fd) => fd.type === 'comida' || fd.type === 'ambas'
  );
  return periodDays - lunchFreeDays.length;
}

/**
 * Calculates the number of required dinners given period days and free days.
 * Required dinners = periodDays - count of free days where type is 'cena' or 'ambas'
 */
export function calculateRequiredDinners(
  periodDays: number,
  freeDays: { dayIndex: number; type: FreeDayType }[]
): number {
  const dinnerFreeDays = freeDays.filter(
    (fd) => fd.type === 'cena' || fd.type === 'ambas'
  );
  return periodDays - dinnerFreeDays.length;
}

/**
 * Validates that the period is between 1 and 30 days.
 */
function validatePeriod(periodDays: number): ValidationError | null {
  if (
    periodDays === null ||
    periodDays === undefined ||
    !Number.isInteger(periodDays) ||
    periodDays < 1 ||
    periodDays > 30
  ) {
    return {
      type: 'validation',
      fields: [
        {
          field: 'periodDays',
          message: 'El período de planificación debe ser entre 1 y 30 días',
        },
      ],
    };
  }
  return null;
}

/**
 * Validates that recipe type constraints are respected for meal slots.
 * Lunch slots accept only recipes with mealType 'comida' or 'ambas'.
 * Dinner slots accept only recipes with mealType 'cena' or 'ambas'.
 */
function isRecipeValidForSlot(
  recipeMealType: string,
  slot: MealSlot
): boolean {
  if (slot === 'comida') {
    return recipeMealType === 'comida' || recipeMealType === 'ambas';
  }
  if (slot === 'cena') {
    return recipeMealType === 'cena' || recipeMealType === 'ambas';
  }
  return false;
}

/**
 * Validates count match and returns a constraint error if counts don't match.
 * Reports exact numeric difference (e.g., "Faltan 2 comidas" or "Sobran 3 cenas").
 */
function validateCountMatch(
  selectedLunchCount: number,
  requiredLunches: number,
  selectedDinnerCount: number,
  requiredDinners: number
): ConstraintError | null {
  const messages: string[] = [];

  if (selectedLunchCount !== requiredLunches) {
    const diff = requiredLunches - selectedLunchCount;
    if (diff > 0) {
      messages.push(`Faltan ${diff} comidas`);
    } else {
      messages.push(`Sobran ${Math.abs(diff)} comidas`);
    }
  }

  if (selectedDinnerCount !== requiredDinners) {
    const diff = requiredDinners - selectedDinnerCount;
    if (diff > 0) {
      messages.push(`Faltan ${diff} cenas`);
    } else {
      messages.push(`Sobran ${Math.abs(diff)} cenas`);
    }
  }

  if (messages.length > 0) {
    return {
      type: 'constraint',
      message: messages.join('. '),
      details: {
        requiredLunches,
        selectedLunches: selectedLunchCount,
        requiredDinners,
        selectedDinners: selectedDinnerCount,
      },
    };
  }

  return null;
}

/**
 * Creates the planning service bound to a specific database instance.
 */
export function createPlanningService(db: SQLiteDatabase) {
  return {
    /**
     * Creates a new menu plan from the given configuration.
     * Validates period, recipe type constraints, and count match.
     */
    async createPlan(config: PlanConfig): Promise<ServiceResult<MenuPlan>> {
      // Validate period
      const periodError = validatePeriod(config.periodDays);
      if (periodError) {
        return { success: false, error: periodError };
      }

      // Create the plan in the database as a draft.
      // Recipe selection and count validation happen later
      // (via assignRecipe and updatePlan with status='confirmed').
      const plan = await planRepository.createPlan(db, {
        periodDays: config.periodDays,
        startDate: config.startDate,
        servings: config.servings,
        elaborateDays: config.elaborateDays,
      });

      // Add free days
      for (const fd of config.freeDays) {
        await assignmentRepository.addFreeDay(
          db,
          plan.id,
          fd.dayIndex,
          fd.type
        );
      }

      // Return the full plan with free days
      const fullPlan = await planRepository.getPlanById(db, plan.id);
      return { success: true, data: fullPlan! };
    },

    /**
     * Updates an existing plan's status or configuration.
     */
    async updatePlan(
      planId: string,
      changes: PlanChanges
    ): Promise<ServiceResult<MenuPlan>> {
      const existing = await planRepository.getPlanById(db, planId);
      if (!existing) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [{ field: 'planId', message: 'El plan no existe' }],
          },
        };
      }

      // If confirming, validate count match
      if (changes.status === 'confirmed' && !changes.allowGaps) {
        const requiredLunches = calculateRequiredLunches(
          existing.periodDays,
          existing.freeDays
        );
        const requiredDinners = calculateRequiredDinners(
          existing.periodDays,
          existing.freeDays
        );

        const lunchAssignments = existing.assignments.filter(
          (a) => a.slot === 'comida'
        );
        const dinnerAssignments = existing.assignments.filter(
          (a) => a.slot === 'cena'
        );

        const countError = validateCountMatch(
          lunchAssignments.length,
          requiredLunches,
          dinnerAssignments.length,
          requiredDinners
        );
        if (countError) {
          return { success: false, error: countError };
        }
      }

      await planRepository.updatePlan(db, planId, {
        status: changes.status,
        elaborateDays: changes.elaborateDays,
        servings: changes.servings,
      });

      const updatedPlan = await planRepository.getPlanById(db, planId);
      return { success: true, data: updatedPlan! };
    },

    /**
     * Gets a plan by ID.
     */
    async getPlan(planId: string): Promise<MenuPlan | null> {
      return planRepository.getPlanById(db, planId);
    },

    async getPlans(): Promise<MenuPlan[]> {
      return planRepository.getAllPlans(db);
    },

    async deletePlan(planId: string): Promise<boolean> {
      return new planRepository.PlanRepository(db).delete(planId);
    },

    /**
     * Gets the currently active plan.
     */
    async getActivePlan(): Promise<MenuPlan | null> {
      return planRepository.getActivePlan(db);
    },

    /**
     * Assigns a recipe to a specific day/slot in the plan.
     * Validates recipe type constraint for the slot.
     */
    async assignRecipe(
      planId: string,
      day: number,
      slot: MealSlot,
      recipeId: string
    ): Promise<ServiceResult<MenuPlan>> {
      const plan = await planRepository.getPlanById(db, planId);
      if (!plan) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [{ field: 'planId', message: 'El plan no existe' }],
          },
        };
      }

      // Validate recipe exists and type constraint
      const recipe = await recipeRepository.getById(db, recipeId);
      if (!recipe) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [{ field: 'recipeId', message: 'La receta no existe' }],
          },
        };
      }

      if (!isRecipeValidForSlot(recipe.mealType, slot)) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [
              {
                field: 'recipeId',
                message: `La receta "${recipe.name}" no es válida para ${slot} (tipo: ${recipe.mealType})`,
              },
            ],
          },
        };
      }

      // A slot holds exactly one recipe, so replace any previous assignment.
      const existing = plan.assignments.find(
        (a) => a.dayIndex === day && a.slot === slot
      );
      if (existing) {
        await assignmentRepository.deleteAssignment(db, existing.id);
      }

      await assignmentRepository.createAssignment(db, planId, day, slot, recipeId);

      const updatedPlan = await planRepository.getPlanById(db, planId);
      return { success: true, data: updatedPlan! };
    },

    /**
     * Swaps two recipe assignments within the plan.
     */
    async swapAssignments(
      planId: string,
      assignment1: SlotRef,
      assignment2: SlotRef
    ): Promise<ServiceResult<MenuPlan>> {
      const plan = await planRepository.getPlanById(db, planId);
      if (!plan) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [{ field: 'planId', message: 'El plan no existe' }],
          },
        };
      }

      // Find the assignments to swap
      const a1 = plan.assignments.find(
        (a) => a.dayIndex === assignment1.dayIndex && a.slot === assignment1.slot
      );
      const a2 = plan.assignments.find(
        (a) => a.dayIndex === assignment2.dayIndex && a.slot === assignment2.slot
      );

      if (!a1 || !a2) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [
              {
                field: 'assignments',
                message: 'Una o ambas asignaciones no existen',
              },
            ],
          },
        };
      }

      // Validate type constraints after swap
      const recipe1 = await recipeRepository.getById(db, a1.recipeId);
      const recipe2 = await recipeRepository.getById(db, a2.recipeId);

      if (recipe1 && !isRecipeValidForSlot(recipe1.mealType, assignment2.slot)) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [
              {
                field: 'assignments',
                message: `La receta "${recipe1.name}" no es válida para ${assignment2.slot}`,
              },
            ],
          },
        };
      }

      if (recipe2 && !isRecipeValidForSlot(recipe2.mealType, assignment1.slot)) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [
              {
                field: 'assignments',
                message: `La receta "${recipe2.name}" no es válida para ${assignment1.slot}`,
              },
            ],
          },
        };
      }

      await assignmentRepository.swapAssignments(db, a1.id, a2.id);

      const updatedPlan = await planRepository.getPlanById(db, planId);
      return { success: true, data: updatedPlan! };
    },

    /**
     * Marks a day as free for the given type (comida, cena, or ambas).
     */
    async markFreeDay(
      planId: string,
      day: number,
      type: FreeDayType
    ): Promise<ServiceResult<MenuPlan>> {
      const plan = await planRepository.getPlanById(db, planId);
      if (!plan) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [{ field: 'planId', message: 'El plan no existe' }],
          },
        };
      }

      // Validate day is within the plan period
      if (day < 0 || day >= plan.periodDays) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [
              {
                field: 'day',
                message: `El día debe estar entre 0 y ${plan.periodDays - 1}`,
              },
            ],
          },
        };
      }

      await assignmentRepository.addFreeDay(db, planId, day, type);

      const updatedPlan = await planRepository.getPlanById(db, planId);
      return { success: true, data: updatedPlan! };
    },

    /** Makes one meal slot available again, preserving the other slot's free state. */
    async unmarkFreeSlot(planId: string, day: number, slot: MealSlot): Promise<ServiceResult<MenuPlan>> {
      const plan = await planRepository.getPlanById(db, planId);
      if (!plan) return { success: false, error: { type: 'validation', fields: [{ field: 'planId', message: 'El plan no existe' }] } };
      const freeDay = plan.freeDays.find((item) => item.dayIndex === day);
      if (!freeDay) return { success: true, data: plan };
      if (freeDay.type === 'ambas') {
        await db.runAsync('UPDATE free_days SET type = ? WHERE id = ?', [slot === 'comida' ? 'cena' : 'comida', freeDay.id]);
      } else if (freeDay.type === slot) {
        await assignmentRepository.removeFreeDay(db, freeDay.id);
      }
      return { success: true, data: (await planRepository.getPlanById(db, planId))! };
    },

    /**
     * Replaces every assignment of the plan with the given set.
     * Slots absent from `assignments` are left empty on purpose.
     */
    async applyDistribution(
      planId: string,
      assignments: { dayIndex: number; slot: MealSlot; recipeId: string }[]
    ): Promise<ServiceResult<MenuPlan>> {
      const plan = await planRepository.getPlanById(db, planId);
      if (!plan) {
        return {
          success: false,
          error: {
            type: 'validation',
            fields: [{ field: 'planId', message: 'El plan no existe' }],
          },
        };
      }

      for (const existing of plan.assignments) {
        await assignmentRepository.deleteAssignment(db, existing.id);
      }

      for (const assignment of assignments) {
        await assignmentRepository.createAssignment(
          db,
          planId,
          assignment.dayIndex,
          assignment.slot,
          assignment.recipeId
        );
      }

      const updatedPlan = await planRepository.getPlanById(db, planId);
      return { success: true, data: updatedPlan! };
    },
  };
}

export type IPlanningService = ReturnType<typeof createPlanningService>;
