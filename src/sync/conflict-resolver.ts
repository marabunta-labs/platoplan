/**
 * PlatoPlan - Conflict Resolution Module
 *
 * Implements last-write-wins (LWW) conflict resolution for the sync engine.
 * When the same record is modified both locally and remotely, the resolver
 * compares `updatedAt` timestamps and returns the record with the more recent one.
 *
 * Tie-breaking rule: if timestamps are exactly equal, the remote record wins
 * (server authority).
 */

/**
 * A record that can participate in conflict resolution.
 * Must have an `id` and an `updatedAt` field (ISO string or Date).
 */
export interface ConflictRecord {
  id: string;
  updatedAt: string | Date;
  [key: string]: unknown;
}

/**
 * Interface for conflict resolution strategies.
 */
export interface IConflictResolver {
  /**
   * Given a local and remote version of the same record, resolve the conflict
   * by returning the winning record.
   */
  resolve<T extends ConflictRecord>(local: T, remote: T): T;
}

/**
 * Parses an `updatedAt` value into a numeric timestamp (milliseconds since epoch).
 * Accepts ISO 8601 strings or Date objects.
 */
function toTimestamp(value: string | Date): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  return new Date(value).getTime();
}

/**
 * Last-write-wins conflict resolver.
 *
 * Compares the `updatedAt` timestamps of two records and returns the one
 * that was modified most recently. If timestamps are equal, the remote
 * record is preferred (server wins tie).
 */
export class ConflictResolver implements IConflictResolver {
  /**
   * Resolve a conflict between a local and remote version of a record.
   *
   * @param local - The locally modified version of the record
   * @param remote - The remotely modified version of the record
   * @returns The record with the more recent `updatedAt`, or remote on tie
   */
  resolve<T extends ConflictRecord>(local: T, remote: T): T {
    const localTime = toTimestamp(local.updatedAt);
    const remoteTime = toTimestamp(remote.updatedAt);

    // Remote wins on tie (server authority)
    if (localTime > remoteTime) {
      return local;
    }
    return remote;
  }
}
