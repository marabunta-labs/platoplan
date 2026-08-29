/**
 * PlatoPlan - Assignment Repository
 * Handles CRUD operations for plan_assignments and free_days tables.
 * Implements IRepository for consistent interface with other repositories.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { PlanAssignment, FreeDay } from '../models/types';
import type { MealSlot, FreeDayType } from '../models/enums';
import type { IRepository } from './interfaces';
import { generateId, withTransaction } from '../database/database';

interface AssignmentRow {
  id: string;
  plan_id: string;
  day_index: number;
  slot: string;
  recipe_id: string;
  updated_at?: string;
}

interface FreeDayRow {
  id: string;
  plan_id: string;
  day_index: number;
  type: string;
  updated_at?: string;
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

/** Input for creating a plan assignment */
export interface CreateAssignmentInput {
  planId: string;
  dayIndex: number;
  slot: MealSlot;
  recipeId: string;
}

/** Input for updating a plan assignment */
export interface UpdateAssignmentInput {
  recipeId?: string;
}

/** Input for creating a free day */
export interface CreateFreeDayInput {
  planId: string;
  dayIndex: number;
  type: FreeDayType;
}

/**
 * AssignmentRepository class implementing IRepository for plan_assignments.
 */
export class AssignmentRepository
  implements IRepository<PlanAssignment, CreateAssignmentInput, UpdateAssignmentInput>
{
  constructor(private db: SQLiteDatabase) {}

  /**
   * Returns all plan assignments.
   */
  async getAll(): Promise<PlanAssignment[]> {
    const rows = await this.db.getAllAsync<AssignmentRow>(
      'SELECT * FROM plan_assignments ORDER BY plan_id, day_index, slot'
    );
    return rows.map(mapRowToAssignment);
  }

  /**
   * Returns a single assignment by ID, or null if not found.
   */
  async getById(id: string): Promise<PlanAssignment | null> {
    const row = await this.db.getFirstAsync<AssignmentRow>(
      'SELECT * FROM plan_assignments WHERE id = ?',
      id
    );
    return row ? mapRowToAssignment(row) : null;
  }

  /**
   * Creates a new plan assignment.
   */
  async create(input: CreateAssignmentInput): Promise<PlanAssignment> {
    const id = generateId();
    const now = new Date().toISOString();

    await this.db.runAsync(
      `INSERT INTO plan_assignments (id, plan_id, day_index, slot, recipe_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      input.planId,
      input.dayIndex,
      input.slot,
      input.recipeId,
      now
    );

    return {
      id,
      planId: input.planId,
      dayIndex: input.dayIndex,
      slot: input.slot,
      recipeId: input.recipeId,
    };
  }

  /**
   * Updates an existing assignment by ID.
   */
  async update(id: string, input: UpdateAssignmentInput): Promise<PlanAssignment> {
    const now = new Date().toISOString();
    if (input.recipeId !== undefined) {
      await this.db.runAsync(
        'UPDATE plan_assignments SET recipe_id = ?, updated_at = ? WHERE id = ?',
        input.recipeId,
        now,
        id
      );
    }

    const result = await this.getById(id);
    if (!result) {
      throw new Error(`Assignment with id '${id}' not found`);
    }
    return result;
  }

  /**
   * Deletes a specific assignment by ID.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.runAsync(
      'DELETE FROM plan_assignments WHERE id = ?',
      id
    );
    return result.changes > 0;
  }

  /**
   * Gets all assignments for a plan, ordered by day_index and slot.
   */
  async getByPlan(planId: string): Promise<PlanAssignment[]> {
    const rows = await this.db.getAllAsync<AssignmentRow>(
      'SELECT * FROM plan_assignments WHERE plan_id = ? ORDER BY day_index, slot',
      planId
    );
    return rows.map(mapRowToAssignment);
  }

  /**
   * Swaps the recipe_id between two assignments within a transaction.
   */
  async swap(assignmentId1: string, assignmentId2: string): Promise<void> {
    await withTransaction(this.db, async (txDb) => {
      const row1 = await txDb.getFirstAsync<AssignmentRow>(
        'SELECT * FROM plan_assignments WHERE id = ?',
        assignmentId1
      );
      const row2 = await txDb.getFirstAsync<AssignmentRow>(
        'SELECT * FROM plan_assignments WHERE id = ?',
        assignmentId2
      );

      if (!row1 || !row2) {
        throw new Error('One or both assignments not found');
      }

      const now = new Date().toISOString();
      await txDb.runAsync(
        'UPDATE plan_assignments SET recipe_id = ?, updated_at = ? WHERE id = ?',
        row2.recipe_id,
        now,
        assignmentId1
      );
      await txDb.runAsync(
        'UPDATE plan_assignments SET recipe_id = ?, updated_at = ? WHERE id = ?',
        row1.recipe_id,
        now,
        assignmentId2
      );
    });
  }
}

/**
 * FreeDayRepository — handles free_days CRUD.
 */
export class FreeDayRepository
  implements IRepository<FreeDay, CreateFreeDayInput, Partial<CreateFreeDayInput>>
{
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<FreeDay[]> {
    const rows = await this.db.getAllAsync<FreeDayRow>(
      'SELECT * FROM free_days ORDER BY plan_id, day_index'
    );
    return rows.map(mapRowToFreeDay);
  }

  async getById(id: string): Promise<FreeDay | null> {
    const row = await this.db.getFirstAsync<FreeDayRow>(
      'SELECT * FROM free_days WHERE id = ?',
      id
    );
    return row ? mapRowToFreeDay(row) : null;
  }

  async create(input: CreateFreeDayInput): Promise<FreeDay> {
    const id = generateId();
    const now = new Date().toISOString();

    await this.db.runAsync(
      `INSERT INTO free_days (id, plan_id, day_index, type, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      input.planId,
      input.dayIndex,
      input.type,
      now
    );

    return {
      id,
      planId: input.planId,
      dayIndex: input.dayIndex,
      type: input.type,
    };
  }

  async update(id: string, input: Partial<CreateFreeDayInput>): Promise<FreeDay> {
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (input.type !== undefined) {
      setClauses.push('type = ?');
      params.push(input.type);
    }
    if (input.dayIndex !== undefined) {
      setClauses.push('day_index = ?');
      params.push(input.dayIndex);
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      params.push(now);
      params.push(id);

      await this.db.runAsync(
        `UPDATE free_days SET ${setClauses.join(', ')} WHERE id = ?`,
        ...params
      );
    }

    const result = await this.getById(id);
    if (!result) {
      throw new Error(`FreeDay with id '${id}' not found`);
    }
    return result;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.runAsync(
      'DELETE FROM free_days WHERE id = ?',
      id
    );
    return result.changes > 0;
  }

  /**
   * Gets all free days for a plan, ordered by day_index.
   */
  async getByPlan(planId: string): Promise<FreeDay[]> {
    const rows = await this.db.getAllAsync<FreeDayRow>(
      'SELECT * FROM free_days WHERE plan_id = ? ORDER BY day_index',
      planId
    );
    return rows.map(mapRowToFreeDay);
  }
}

// ============================================================================
// Legacy module-level functions for backward compatibility with existing callers.
// ============================================================================

/**
 * Creates a new plan assignment.
 * @deprecated Use AssignmentRepository class instance instead
 */
export async function createAssignment(
  db: SQLiteDatabase,
  planId: string,
  dayIndex: number,
  slot: MealSlot,
  recipeId: string
): Promise<PlanAssignment> {
  const id = generateId();

  await db.runAsync(
    `INSERT INTO plan_assignments (id, plan_id, day_index, slot, recipe_id)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    planId,
    dayIndex,
    slot,
    recipeId
  );

  return {
    id,
    planId,
    dayIndex,
    slot,
    recipeId,
  };
}

/**
 * Deletes a specific assignment by ID.
 * @deprecated Use AssignmentRepository class instance instead
 */
export async function deleteAssignment(
  db: SQLiteDatabase,
  assignmentId: string
): Promise<void> {
  await db.runAsync(
    'DELETE FROM plan_assignments WHERE id = ?',
    assignmentId
  );
}

/**
 * Gets all assignments for a plan, ordered by day_index and slot.
 * @deprecated Use AssignmentRepository class instance instead
 */
export async function getAssignmentsByPlan(
  db: SQLiteDatabase,
  planId: string
): Promise<PlanAssignment[]> {
  const rows = await db.getAllAsync<AssignmentRow>(
    'SELECT * FROM plan_assignments WHERE plan_id = ? ORDER BY day_index, slot',
    planId
  );

  return rows.map(mapRowToAssignment);
}

/**
 * Swaps the recipe_id between two assignments within a transaction.
 * @deprecated Use AssignmentRepository class instance instead
 */
export async function swapAssignments(
  db: SQLiteDatabase,
  assignmentId1: string,
  assignmentId2: string
): Promise<void> {
  await withTransaction(db, async (txDb) => {
    const row1 = await txDb.getFirstAsync<AssignmentRow>(
      'SELECT * FROM plan_assignments WHERE id = ?',
      assignmentId1
    );
    const row2 = await txDb.getFirstAsync<AssignmentRow>(
      'SELECT * FROM plan_assignments WHERE id = ?',
      assignmentId2
    );

    if (!row1 || !row2) {
      throw new Error('One or both assignments not found');
    }

    await txDb.runAsync(
      'UPDATE plan_assignments SET recipe_id = ? WHERE id = ?',
      row2.recipe_id,
      assignmentId1
    );
    await txDb.runAsync(
      'UPDATE plan_assignments SET recipe_id = ? WHERE id = ?',
      row1.recipe_id,
      assignmentId2
    );
  });
}

/**
 * Adds a free day record for a plan.
 * @deprecated Use FreeDayRepository class instance instead
 */
export async function addFreeDay(
  db: SQLiteDatabase,
  planId: string,
  dayIndex: number,
  type: FreeDayType
): Promise<FreeDay> {
  const id = generateId();

  await db.runAsync(
    `INSERT INTO free_days (id, plan_id, day_index, type)
     VALUES (?, ?, ?, ?)`,
    id,
    planId,
    dayIndex,
    type
  );

  return {
    id,
    planId,
    dayIndex,
    type,
  };
}

/**
 * Removes a free day by ID.
 * @deprecated Use FreeDayRepository class instance instead
 */
export async function removeFreeDay(
  db: SQLiteDatabase,
  freeDayId: string
): Promise<void> {
  await db.runAsync(
    'DELETE FROM free_days WHERE id = ?',
    freeDayId
  );
}

/**
 * Gets all free days for a plan, ordered by day_index.
 * @deprecated Use FreeDayRepository class instance instead
 */
export async function getFreeDays(
  db: SQLiteDatabase,
  planId: string
): Promise<FreeDay[]> {
  const rows = await db.getAllAsync<FreeDayRow>(
    'SELECT * FROM free_days WHERE plan_id = ? ORDER BY day_index',
    planId
  );

  return rows.map(mapRowToFreeDay);
}
