/**
 * Unit tests for ConflictResolver.
 *
 * Validates that last-write-wins conflict resolution works correctly
 * with various timestamp formats and tie-breaking scenarios.
 *
 * Validates: Requirements 6.4
 */

import { describe, it, expect } from 'vitest';
import { ConflictResolver, type ConflictRecord } from './conflict-resolver';

describe('ConflictResolver', () => {
  const resolver = new ConflictResolver();

  describe('resolve() - last-write-wins', () => {
    it('should return the local record when it has a more recent timestamp', () => {
      const local: ConflictRecord = {
        id: '1',
        updatedAt: '2024-06-15T12:00:00.000Z',
        name: 'local version',
      };
      const remote: ConflictRecord = {
        id: '1',
        updatedAt: '2024-06-15T11:00:00.000Z',
        name: 'remote version',
      };

      const result = resolver.resolve(local, remote);
      expect(result).toBe(local);
      expect(result.name).toBe('local version');
    });

    it('should return the remote record when it has a more recent timestamp', () => {
      const local: ConflictRecord = {
        id: '1',
        updatedAt: '2024-06-15T10:00:00.000Z',
        name: 'local version',
      };
      const remote: ConflictRecord = {
        id: '1',
        updatedAt: '2024-06-15T12:00:00.000Z',
        name: 'remote version',
      };

      const result = resolver.resolve(local, remote);
      expect(result).toBe(remote);
      expect(result.name).toBe('remote version');
    });

    it('should prefer remote when timestamps are exactly equal (server wins tie)', () => {
      const timestamp = '2024-06-15T12:00:00.000Z';
      const local: ConflictRecord = {
        id: '1',
        updatedAt: timestamp,
        name: 'local version',
      };
      const remote: ConflictRecord = {
        id: '1',
        updatedAt: timestamp,
        name: 'remote version',
      };

      const result = resolver.resolve(local, remote);
      expect(result).toBe(remote);
      expect(result.name).toBe('remote version');
    });

    it('should handle Date objects as updatedAt values', () => {
      const local: ConflictRecord = {
        id: '1',
        updatedAt: new Date('2024-06-15T14:00:00.000Z'),
        name: 'local version',
      };
      const remote: ConflictRecord = {
        id: '1',
        updatedAt: new Date('2024-06-15T12:00:00.000Z'),
        name: 'remote version',
      };

      const result = resolver.resolve(local, remote);
      expect(result).toBe(local);
    });

    it('should handle mixed Date and string updatedAt values', () => {
      const local: ConflictRecord = {
        id: '1',
        updatedAt: new Date('2024-06-15T10:00:00.000Z'),
        name: 'local version',
      };
      const remote: ConflictRecord = {
        id: '1',
        updatedAt: '2024-06-15T12:00:00.000Z',
        name: 'remote version',
      };

      const result = resolver.resolve(local, remote);
      expect(result).toBe(remote);
    });

    it('should preserve all fields on the winning record', () => {
      const local = {
        id: '1',
        updatedAt: '2024-06-15T14:00:00.000Z',
        name: 'Arroz',
        unit: 'gramos',
        category: 'cereales',
        quantity: 500,
      };
      const remote = {
        id: '1',
        updatedAt: '2024-06-15T10:00:00.000Z',
        name: 'Arroz viejo',
        unit: 'gramos',
        category: 'cereales',
        quantity: 250,
      };

      const result = resolver.resolve(local, remote);
      expect(result).toBe(local);
      expect(result.name).toBe('Arroz');
      expect(result.quantity).toBe(500);
    });

    it('should work with timestamps that differ by milliseconds', () => {
      const local: ConflictRecord = {
        id: '1',
        updatedAt: '2024-06-15T12:00:00.001Z',
        name: 'local',
      };
      const remote: ConflictRecord = {
        id: '1',
        updatedAt: '2024-06-15T12:00:00.000Z',
        name: 'remote',
      };

      const result = resolver.resolve(local, remote);
      expect(result).toBe(local);
    });
  });
});
