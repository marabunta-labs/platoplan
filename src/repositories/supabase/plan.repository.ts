/**
 * PlatoPlan - Supabase Plan Repository
 *
 * Implements IRepository for the menu_plans, plan_assignments, and free_days tables
 * using Supabase client. Maps between snake_case DB columns and camelCase domain types.
 * All queries are scoped by user_id for data isolation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MenuPlan, PlanAssignment, FreeDay } from '../../models/types';
import type { PlanStatus, MealSlot, FreeDayType } from '../../models/enums';
import type { IRepository } from '../interfaces';
import type { CreatePlanInput, UpdatePlanInput } from '../plan.repository';

/** Row shape from the Supabase menu_plans table */
interface PlanRow {
  id: string;
  user_id: string;
  period_days: number;
  start_date: string;
  servings: number | null;
  status: string;
  elaborate_days_config: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

/** Row shape from the Supabase plan_assignments table */
interface AssignmentRow {
  id: string;
  user_id: string;
  plan_id: string;
  day_index: number;
  slot: string;
  recipe_id: string;
}

/** Row shape from the Supabase free_days table */
interface FreeDayRow {
  id: string;
  user_id: string;
  plan_id: string;
  day_index: number;
  type: string;
}

function mapRowToPlan(row: PlanRow): MenuPlan {
  return {
    id: row.id,
    periodDays: row.period_days,
    startDate: new Date(row.start_date),
    servings: row.servings ?? 2,
    status: row.status as PlanStatus,
    elaborateDays: JSON.parse(row.elaborate_days_config),
    assignments: [],
    freeDays: [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapRowToAssignment(row: AssignmentRow): PlanAssignment {
  return {
    id: row.id,
    planId: row.plan_id,
    dayIndex: row.day_index,
    slot: row.slot as MealSlot,
    recipeId: row.recipe_id,
  };
}

function mapRowToFreeDay(row: FreeDayRow): FreeDay {
  return {
    id: row.id,
    planId: row.plan_id,
    dayIndex: row.day_index,
    type: row.type as FreeDayType,
  };
}

export class SupabasePlanRepository
  implements IRepository<MenuPlan, CreatePlanInput, UpdatePlanInput>
{
  constructor(
    private client: SupabaseClient,
    private userId: string
  ) {}

  async getAll(): Promise<MenuPlan[]> {
    const { data, error } = await this.client
      .from('menu_plans')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch plans: ${error.message}`);
    }

    const plans = (data as PlanRow[]).map(mapRowToPlan);

    // Fetch assignments and free days for all plans
    for (const plan of plans) {
      plan.assignments = await this.fetchAssignments(plan.id);
      plan.freeDays = await this.fetchFreeDays(plan.id);
    }

    return plans;
  }

  async getById(id: string): Promise<MenuPlan | null> {
    const { data, error } = await this.client
      .from('menu_plans')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch plan: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const plan = mapRowToPlan(data as PlanRow);
    plan.assignments = await this.fetchAssignments(plan.id);
    plan.freeDays = await this.fetchFreeDays(plan.id);

    return plan;
  }

  async create(input: CreatePlanInput): Promise<MenuPlan> {
    const now = new Date().toISOString();
    const elaborateDaysConfig = JSON.stringify(input.elaborateDays ?? []);

    const { data, error } = await this.client
      .from('menu_plans')
      .insert({
        user_id: this.userId,
        period_days: input.periodDays,
        start_date: input.startDate.toISOString(),
        status: 'draft',
        elaborate_days_config: elaborateDaysConfig,
        created_at: now,
        updated_at: now,
        synced_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create plan: ${error.message}`);
    }

    const plan = mapRowToPlan(data as PlanRow);
    plan.assignments = [];
    plan.freeDays = [];

    return plan;
  }

  async update(id: string, input: UpdatePlanInput): Promise<MenuPlan> {
    const updates: Record<string, unknown> = {};

    if (input.status !== undefined) {
      updates.status = input.status;
    }
    if (input.elaborateDays !== undefined) {
      updates.elaborate_days_config = JSON.stringify(input.elaborateDays);
    }

    if (Object.keys(updates).length > 0) {
      updates.synced_at = new Date().toISOString();

      const { error } = await this.client
        .from('menu_plans')
        .update(updates)
        .eq('id', id)
        .eq('user_id', this.userId);

      if (error) {
        throw new Error(`Failed to update plan: ${error.message}`);
      }
    }

    const result = await this.getById(id);
    if (!result) {
      throw new Error(`Plan with id '${id}' not found`);
    }
    return result;
  }

  async delete(id: string): Promise<boolean> {
    // plan_assignments and free_days are cascade-deleted via foreign key
    const { error, count } = await this.client
      .from('menu_plans')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to delete plan: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  /**
   * Fetches plan assignments for a given plan.
   */
  private async fetchAssignments(planId: string): Promise<PlanAssignment[]> {
    const { data, error } = await this.client
      .from('plan_assignments')
      .select('id, user_id, plan_id, day_index, slot, recipe_id')
      .eq('plan_id', planId)
      .eq('user_id', this.userId)
      .order('day_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch plan assignments: ${error.message}`);
    }

    return (data as AssignmentRow[]).map(mapRowToAssignment);
  }

  /**
   * Fetches free days for a given plan.
   */
  private async fetchFreeDays(planId: string): Promise<FreeDay[]> {
    const { data, error } = await this.client
      .from('free_days')
      .select('id, user_id, plan_id, day_index, type')
      .eq('plan_id', planId)
      .eq('user_id', this.userId)
      .order('day_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch free days: ${error.message}`);
    }

    return (data as FreeDayRow[]).map(mapRowToFreeDay);
  }
}
