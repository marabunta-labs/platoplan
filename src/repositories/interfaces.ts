/**
 * PlatoPlan - Generic Repository Interface
 *
 * Defines the contract that all entity repositories must implement.
 * Supports local SQLite, Supabase remote, and synced orchestrator variants.
 */

/**
 * Generic repository interface for CRUD operations on any entity type.
 *
 * @typeParam T - The domain entity type returned by queries
 * @typeParam CreateInput - The input type for creating a new entity
 * @typeParam UpdateInput - The input type for updating an existing entity
 */
export interface IRepository<T, CreateInput, UpdateInput> {
  /** Returns all entities. */
  getAll(): Promise<T[]>;

  /** Returns a single entity by ID, or null if not found. */
  getById(id: string): Promise<T | null>;

  /** Creates a new entity from the given input. */
  create(input: CreateInput): Promise<T>;

  /** Updates an existing entity by ID. Returns the updated entity. */
  update(id: string, input: UpdateInput): Promise<T>;

  /** Deletes an entity by ID. Returns true if deleted, false if not found. */
  delete(id: string): Promise<boolean>;

  /** Optional: searches entities by a text query. */
  search?(query: string): Promise<T[]>;
}
