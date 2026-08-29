/**
 * PlatoPlan - usePlanning hook
 * Connects planning screens to the PlanningService via DatabaseContext.
 */

import { useState, useEffect, useCallback } from 'react';
import type { MenuPlan } from '../models/types';
import type { MealSlot, FreeDayType } from '../models/enums';
import type { PlanConfig } from '../models/inputs';
import { useDatabase } from '../context/DatabaseContext';
import { createPlanningService, type SlotRef, type PlanChanges } from '../services/planning.service';
import { useTableInvalidation } from './useTableInvalidation';

export function usePlanning() {
  const db = useDatabase();
  const [activePlan, setActivePlan] = useState<MenuPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const service = createPlanningService(db);

  const loadActivePlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const plan = await service.getActivePlan();
      setActivePlan(plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el plan');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadActivePlan();
  }, [loadActivePlan]);

  // Re-fetch when remote changes invalidate planning-related tables
  useTableInvalidation(['menu_plans', 'plan_assignments', 'free_days'], loadActivePlan);

  const createPlan = useCallback(
    async (config: PlanConfig) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.createPlan(config);
        if (!result.success) {
          const errMsg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : result.error.message;
          setError(errMsg);
          return result;
        }
        setActivePlan(result.data);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al crear plan';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  const updatePlan = useCallback(
    async (planId: string, changes: PlanChanges) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.updatePlan(planId, changes);
        if (!result.success) {
          const errMsg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : result.error.message;
          setError(errMsg);
          return result;
        }
        setActivePlan(result.data);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al actualizar plan';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  const assignRecipe = useCallback(
    async (planId: string, day: number, slot: MealSlot, recipeId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.assignRecipe(planId, day, slot, recipeId);
        if (!result.success) {
          const errMsg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : result.error.message;
          setError(errMsg);
          return result;
        }
        setActivePlan(result.data);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al asignar receta';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  const applyDistribution = useCallback(
    async (
      planId: string,
      assignments: { dayIndex: number; slot: MealSlot; recipeId: string }[]
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.applyDistribution(planId, assignments);
        if (!result.success) {
          const errMsg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : result.error.message;
          setError(errMsg);
          return result;
        }
        setActivePlan(result.data);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al generar el plan';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  const swapAssignments = useCallback(
    async (planId: string, assignment1: SlotRef, assignment2: SlotRef) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.swapAssignments(planId, assignment1, assignment2);
        if (!result.success) {
          const errMsg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : result.error.message;
          setError(errMsg);
          return result;
        }
        setActivePlan(result.data);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al intercambiar asignaciones';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  const markFreeDay = useCallback(
    async (planId: string, day: number, type: FreeDayType) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.markFreeDay(planId, day, type);
        if (!result.success) {
          const errMsg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : result.error.message;
          setError(errMsg);
          return result;
        }
        setActivePlan(result.data);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al marcar día libre';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  const loadPlan = useCallback(
    async (planId: string) => {
      setLoading(true);
      setError(null);
      try {
        const plan = await service.getPlan(planId);
        setActivePlan(plan);
        return plan;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar el plan');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  const loadPlans = useCallback(async () => service.getPlans(), [db]);

  const deletePlan = useCallback(async (planId: string) => service.deletePlan(planId), [db]);

  const unmarkFreeSlot = useCallback(
    async (planId: string, day: number, slot: MealSlot) => {
      const result = await service.unmarkFreeSlot(planId, day, slot);
      if (result.success) setActivePlan(result.data);
      return result;
    },
    [db]
  );

  return {
    activePlan,
    loading,
    error,
    createPlan,
    updatePlan,
    assignRecipe,
    applyDistribution,
    swapAssignments,
    markFreeDay,
    unmarkFreeSlot,
    loadPlan,
    loadPlans,
    deletePlan,
    refresh: loadActivePlan,
  };
}
