/**
 * PlatoPlan - Last-Write-Wins Conflict Resolution Property Test
 *
 * Feature: platoplan-web-supabase, Property 5: Last-write-wins conflict resolution
 *
 * **Validates: Requirements 6.4**
 *
 * For any two concurrent updates to the same record (same entity ID), the conflict
 * resolver SHALL select the update with the more recent updatedAt timestamp, and
 * the resulting record SHALL match that update's payload exactly.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ConflictResolver, type ConflictRecord } from '../conflict-resolver';

// ─── Custom Generators ──────────────────────────────────────────────────────

/** Generates a valid entity ID */
const arbEntityId = fc.uuid();

/** Generates a non-empty string for payload fields */
const arbPayloadString = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Min and max timestamps for date generation (2020-01-01 to 2030-12-31) */
const MIN_TIMESTAMP = new Date('2020-01-01T00:00:00.000Z').getTime();
const MAX_TIMESTAMP = new Date('2030-12-31T23:59:59.999Z').getTime();

/** Generates a valid ISO date string within a reasonable range using integer timestamps */
const arbIsoDate = fc
  .integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP })
  .map((ts) => new Date(ts).toISOString());

/** Generates a Date object within a reasonable range using integer timestamps */
const arbDateObject = fc
  .integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP })
  .map((ts) => new Date(ts));

/** Generates a random payload object (additional fields beyond id and updatedAt) */
const arbPayload = fc.record({
  name: arbPayloadString,
  unit: fc.constantFrom('gramos', 'mililitros', 'unidades'),
  quantity: fc.double({ min: 0.01, max: 10000, noNaN: true, noDefaultInfinity: true }),
  category: arbPayloadString,
});

/**
 * Generates two distinct ISO timestamps where one is strictly more recent than the other.
 * Returns [olderTimestamp, newerTimestamp].
 */
const arbDistinctTimestamps = fc
  .tuple(
    fc.integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP }),
    fc.integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP })
  )
  .filter(([a, b]) => a !== b)
  .map(([a, b]) => {
    const older = Math.min(a, b);
    const newer = Math.max(a, b);
    return [new Date(older).toISOString(), new Date(newer).toISOString()] as [string, string];
  });

/**
 * Generates a pair of ConflictRecords with the same id but different timestamps and payloads.
 */
function arbConflictPairWithDistinctTimestamps() {
  return fc.tuple(arbEntityId, arbDistinctTimestamps, arbPayload, arbPayload).map(
    ([id, [olderTs, newerTs], payloadOlder, payloadNewer]) => ({
      older: { id, updatedAt: olderTs, ...payloadOlder } as ConflictRecord,
      newer: { id, updatedAt: newerTs, ...payloadNewer } as ConflictRecord,
    })
  );
}

/**
 * Generates a pair of ConflictRecords with the same id and the SAME timestamp (for tie-breaking).
 */
function arbConflictPairWithSameTimestamp() {
  return fc.tuple(arbEntityId, arbIsoDate, arbPayload, arbPayload).map(
    ([id, timestamp, localPayload, remotePayload]) => ({
      local: { id, updatedAt: timestamp, ...localPayload } as ConflictRecord,
      remote: { id, updatedAt: timestamp, ...remotePayload } as ConflictRecord,
    })
  );
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Feature: platoplan-web-supabase, Property 5: Last-write-wins conflict resolution', () => {
  const resolver = new ConflictResolver();

  /**
   * Property 5a: The resolver always selects the record with the more recent timestamp.
   *
   * For any two records with distinct timestamps and the same ID, resolve() SHALL
   * return the record whose updatedAt is more recent, regardless of which is passed
   * as 'local' and which as 'remote'.
   *
   * **Validates: Requirements 6.4**
   */
  it('should always select the record with the more recent updatedAt timestamp', () => {
    fc.assert(
      fc.property(
        arbConflictPairWithDistinctTimestamps(),
        fc.boolean(), // whether the newer record is passed as local or remote
        ({ older, newer }, newerIsLocal) => {
          const local = newerIsLocal ? newer : older;
          const remote = newerIsLocal ? older : newer;

          const result = resolver.resolve(local, remote);

          // The winner must be the record with the more recent timestamp
          expect(result).toBe(newer);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5b: The returned record's payload matches exactly.
   *
   * The winning record SHALL be returned as-is, preserving all fields.
   *
   * **Validates: Requirements 6.4**
   */
  it('should return the winning record with all payload fields preserved exactly', () => {
    fc.assert(
      fc.property(
        arbConflictPairWithDistinctTimestamps(),
        ({ older, newer }) => {
          // Newer as local, older as remote
          const result = resolver.resolve(newer, older);

          // Result must be the exact same object reference (no modification)
          expect(result).toBe(newer);
          // Verify payload integrity
          expect(result.id).toBe(newer.id);
          expect(result.updatedAt).toBe(newer.updatedAt);
          expect(result.name).toBe(newer.name);
          expect(result.unit).toBe(newer.unit);
          expect(result.quantity).toBe(newer.quantity);
          expect(result.category).toBe(newer.category);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5c: On timestamp tie, remote always wins (server authority).
   *
   * For any two records with the exact same updatedAt timestamp, resolve() SHALL
   * return the remote record.
   *
   * **Validates: Requirements 6.4**
   */
  it('should prefer the remote record when timestamps are exactly equal (tie-breaking)', () => {
    fc.assert(
      fc.property(
        arbConflictPairWithSameTimestamp(),
        ({ local, remote }) => {
          const result = resolver.resolve(local, remote);

          // Remote wins on tie
          expect(result).toBe(remote);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5d: Resolution is consistent regardless of timestamp format (Date vs ISO string).
   *
   * The resolver SHALL produce the same winner whether updatedAt is provided as a
   * Date object or an ISO 8601 string representing the same instant.
   *
   * **Validates: Requirements 6.4**
   */
  it('should resolve consistently whether updatedAt is a Date object or ISO string', () => {
    fc.assert(
      fc.property(
        arbEntityId,
        arbDistinctTimestamps,
        arbPayload,
        arbPayload,
        (id, [olderTs, newerTs], payloadA, payloadB) => {
          // Create records with string timestamps
          const localString: ConflictRecord = { id, updatedAt: newerTs, ...payloadA };
          const remoteString: ConflictRecord = { id, updatedAt: olderTs, ...payloadB };

          // Create records with Date object timestamps
          const localDate: ConflictRecord = {
            id,
            updatedAt: new Date(newerTs),
            ...payloadA,
          };
          const remoteDate: ConflictRecord = {
            id,
            updatedAt: new Date(olderTs),
            ...payloadB,
          };

          const resultString = resolver.resolve(localString, remoteString);
          const resultDate = resolver.resolve(localDate, remoteDate);

          // Both should pick the record with the newer timestamp (local in this case)
          expect(resultString).toBe(localString);
          expect(resultDate).toBe(localDate);

          // Both winners should have the same payload
          expect(resultString.name).toBe(resultDate.name);
          expect(resultString.unit).toBe(resultDate.unit);
        }
      ),
      { numRuns: 100 }
    );
  });
});
