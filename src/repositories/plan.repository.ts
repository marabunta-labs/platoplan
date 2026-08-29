/**
 * PlatoPlan - Plan Repository
 * Handles CRUD operations for menu_plans table.
 * Implements IRepository for consistent interface with other repositories.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MenuPlan, PlanAssignment, FreeDay } from '../models/types';
import type { PlanStatus, MealSlot, FreeDayType } from '../models/enums';
import type { IRepository } from './interfaces';
import { generateId } from '../database/database';

interface PlanRow {
  id: string;
  name?: string | null;
  period_days: number;
  start_date: string;
  servings: number | null;
  status: string;
  elaborate_days_config: string;
  day_notes?: string | null;
  meal_notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface AssignmentRow {
  id: string;
  plan_id: string;
  day_index: number;
  slot: string;
  recipe_id: string;
}

interface FreeDayRow {
  id: string;
  plan_id: string;
  day_index: number;
  type: string;
}

function mapRowToPlan(row: PlanRow): MenuPlan {
  return {
    id: row.id,
    name: row.name ?? '',
    periodDays: row.period_days,
    startDate: new Date(row.start_date),
    servings: row.servings ?? 2,
    status: row.status as PlanStatus,
    elaborateDays: JSON.parse(row.elaborate_days_config),
    dayNotes: JSON.parse(row.day_notes ?? '{}'),
    mealNotes: JSON.parse(row.meal_notes ?? '{}'),
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

export interface CreatePlanInput {
  name?: string;
  periodDays: number;
  startDate: Date;
  servings?: number;
  elaborateDays?: number[];
  dayNotes?: Record<string, string>;
  mealNotes?: Record<string, string>;
}

export interface UpdatePlanInput {
  name?: string;
  periodDays?: number;
  startDate?: Date;
  status?: PlanStatus;
  servings?: number;
  elaborateDays?: number[];
  dayNotes?: Record<string, string>;
  mealNotes?: Record<string, string>;
}

/**
 * PlanRepository class implementing IRepository interface.
 */
export class PlanRepository
  implements IRepository<MenuPlan, CreatePlanInput, UpdatePlanInput>
{
  constructor(private db: SQLiteDatabase) {}

  /**
   * Returns all menu plans sorted by created_at descending.
   */
  async getAll(): Promise<MenuPlan[]> {
    const rows = await this.db.getAllAsync<PlanRow>(
      'SELECT * FROM menu_plans ORDER BY created_at DESC'
    );

    const plans: MenuPlan[] = [];
    for (const row of rows) {
      const plan = mapRowToPlan(row);

      const assignmentRows = await this.db.getAllAsync<AssignmentRow>(
        'SELECT * FROM plan_assignments WHERE plan_id = ? ORDER BY day_index, slot',
        plan.id
      );
      plan.assignments = assignmentRows.map(mapRowToAssignment);

      const freeDayRows = await this.db.getAllAsync<FreeDayRow>(
        'SELECT * FROM free_days WHERE plan_id = ? ORDER BY day_index',
        plan.id
      );
      plan.freeDays = freeDayRows.map(mapRowToFreeDay);

      plans.push(plan);
    }

    return plans;
  }

  /**
   * Gets a plan by ID with its assignments and free days populated.
   */
  async getById(planId: string): Promise<MenuPlan | null> {
    const row = await this.db.getFirstAsync<PlanRow>(
      'SELECT * FROM menu_plans WHERE id = ?',
      planId
    );

    if (!row) {
      return null;
    }

    const plan = mapRowToPlan(row);

    const assignmentRows = await this.db.getAllAsync<AssignmentRow>(
      'SELECT * FROM plan_assignments WHERE plan_id = ? ORDER BY day_index, slot',
      planId
    );
    plan.assignments = assignmentRows.map(mapRowToAssignment);

    const freeDayRows = await this.db.getAllAsync<FreeDayRow>(
      'SELECT * FROM free_days WHERE plan_id = ? ORDER BY day_index',
      planId
    );
    plan.freeDays = freeDayRows.map(mapRowToFreeDay);

    return plan;
  }

  /**
   * Creates a new menu plan record.
   */
  async create(input: CreatePlanInput): Promise<MenuPlan> {
    const id = generateId();
    const now = new Date().toISOString();
    const elaborateDaysConfig = JSON.stringify(input.elaborateDays ?? []);
    const servings = input.servings ?? 2;
    const name = input.name?.trim() ?? '';
    const dayNotes = JSON.stringify(input.dayNotes ?? {});
    const mealNotes = JSON.stringify(input.mealNotes ?? {});

    await this.db.runAsync(
      `INSERT INTO menu_plans (id, period_days, start_date, servings, status, elaborate_days_config, name, day_notes, meal_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      id,
      input.periodDays,
      input.startDate.toISOString(),
      servings,
      elaborateDaysConfig,
      name,
      dayNotes,
      mealNotes,
      now,
      now
    );

    return {
      id,
      name,
      periodDays: input.periodDays,
      startDate: input.startDate,
      servings,
      status: 'draft',
      elaborateDays: input.elaborateDays ?? [],
      dayNotes: input.dayNotes ?? {},
      mealNotes: input.mealNotes ?? {},
      assignments: [],
      freeDays: [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Updates an existing menu plan's fields.
   */
  async update(planId: string, changes: UpdatePlanInput): Promise<MenuPlan> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (changes.status !== undefined) {
      setClauses.push('status = ?');
      params.push(changes.status);
    }

    if (changes.name !== undefined) {
      setClauses.push('name = ?');
      params.push(changes.name.trim());
    }

    if (changes.periodDays !== undefined) {
      setClauses.push('period_days = ?');
      params.push(changes.periodDays);
    }

    if (changes.startDate !== undefined) {
      setClauses.push('start_date = ?');
      params.push(changes.startDate.toISOString());
    }

    if (changes.elaborateDays !== undefined) {
      setClauses.push('elaborate_days_config = ?');
      params.push(JSON.stringify(changes.elaborateDays));
    }

    if (changes.servings !== undefined) {
      setClauses.push('servings = ?');
      params.push(changes.servings);
    }

    if (changes.dayNotes !== undefined) {
      setClauses.push('day_notes = ?');
      params.push(JSON.stringify(changes.dayNotes));
    }

    if (changes.mealNotes !== undefined) {
      setClauses.push('meal_notes = ?');
      params.push(JSON.stringify(changes.mealNotes));
    }

    if (setClauses.length > 0) {
      setClauses.push("updated_at = datetime('now')");
      params.push(planId);

      await this.db.runAsync(
        `UPDATE menu_plans SET ${setClauses.join(', ')} WHERE id = ?`,
        ...params
      );
    }

    const result = await this.getById(planId);
    if (!result) {
      throw new Error(`Plan with id '${planId}' not found`);
    }
    return result;
  }

  /**
   * Deletes a plan by ID.
   * Returns true if deleted, false if not found.
   */
  async delete(planId: string): Promise<boolean> {
    const result = await this.db.runAsync(
      'DELETE FROM menu_plans WHERE id = ?',
      planId
    );
    return result.changes > 0;
  }

  /**
   * Returns the active plan: the most recent draft, or the most recently confirmed plan.
   */
  async getActivePlan(): Promise<MenuPlan | null> {
    // First try to find the most recent draft
    const draftRow = await this.db.getFirstAsync<PlanRow>(
      "SELECT * FROM menu_plans WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1"
    );

    if (draftRow) {
      return this.getById(draftRow.id);
    }

    // Otherwise, return the most recently confirmed plan
    const confirmedRow = await this.db.getFirstAsync<PlanRow>(
      "SELECT * FROM menu_plans WHERE status = 'confirmed' ORDER BY updated_at DESC LIMIT 1"
    );

    if (confirmedRow) {
      return this.getById(confirmedRow.id);
    }

    return null;
  }
}

// ============================================================================
// Legacy module-level functions for backward compatibility with existing callers.
// ============================================================================

/**
 * Creates a new menu plan record.
 * @deprecated Use PlanRepository class instance instead
 */
export async function createPlan(
  db: SQLiteDatabase,
  input: CreatePlanInput
): Promise<MenuPlan> {
  const repo = new PlanRepository(db);
  return repo.create(input);
}

/**
 * Updates an existing menu plan's fields.
 * @deprecated Use PlanRepository class instance instead
 */
export async function updatePlan(
  db: SQLiteDatabase,
  planId: string,
  changes: UpdatePlanInput
): Promise<void> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (changes.status !== undefined) {
    setClauses.push('status = ?');
    params.push(changes.status);
  }

  if (changes.name !== undefined) {
    setClauses.push('name = ?');
    params.push(changes.name.trim());
  }

  if (changes.periodDays !== undefined) {
    setClauses.push('period_days = ?');
    params.push(changes.periodDays);
  }

  if (changes.startDate !== undefined) {
    setClauses.push('start_date = ?');
    params.push(changes.startDate.toISOString());
  }

  if (changes.elaborateDays !== undefined) {
    setClauses.push('elaborate_days_config = ?');
    params.push(JSON.stringify(changes.elaborateDays));
  }

  if (changes.servings !== undefined) {
    setClauses.push('servings = ?');
    params.push(changes.servings);
  }

  if (changes.dayNotes !== undefined) {
    setClauses.push('day_notes = ?');
    params.push(JSON.stringify(changes.dayNotes));
  }

  if (changes.mealNotes !== undefined) {
    setClauses.push('meal_notes = ?');
    params.push(JSON.stringify(changes.mealNotes));
  }

  if (setClauses.length === 0) {
    return;
  }

  setClauses.push("updated_at = datetime('now')");
  params.push(planId);

  await db.runAsync(
    `UPDATE menu_plans SET ${setClauses.join(', ')} WHERE id = ?`,
    ...params
  );
}

/**
 * Gets a plan by ID with its assignments and free days populated.
 * @deprecated Use PlanRepository class instance instead
 */
export async function getPlanById(
  db: SQLiteDatabase,
  planId: string
): Promise<MenuPlan | null> {
  const repo = new PlanRepository(db);
  return repo.getById(planId);
}

/** Returns saved plans, newest first. */
export async function getAllPlans(db: SQLiteDatabase): Promise<MenuPlan[]> {
  return new PlanRepository(db).getAll();
}

/**
 * Returns the active plan: the most recent draft, or the most recently confirmed plan.
 * @deprecated Use PlanRepository class instance instead
 */
export async function getActivePlan(
  db: SQLiteDatabase
): Promise<MenuPlan | null> {
  const repo = new PlanRepository(db);
  return repo.getActivePlan();
}
