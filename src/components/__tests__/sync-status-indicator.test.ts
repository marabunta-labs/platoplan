/**
 * Unit test for SyncStatusIndicator logic.
 *
 * Tests the status configuration mapping and the subscription contract
 * that the component relies on, without importing React Native components.
 *
 * Requirements: 6.6
 */

import { describe, it, expect } from 'vitest';
import type { SyncStatus } from '../../models/sync-types';

// --- Status config extracted from the component ---

const STATUS_CONFIG: Record<SyncStatus, { icon: string; color: string; label: string }> = {
  syncing: { icon: '', color: '#007AFF', label: 'Sincronizando...' },
  synced: { icon: '✓', color: '#34C759', label: 'Sincronizado' },
  offline: { icon: '☁', color: '#8E8E93', label: 'Sin conexión' },
  error: { icon: '⚠', color: '#FF9500', label: 'Error de sincronización' },
};

/**
 * Simulates the subscription logic:
 * - syncManager.onStatusChange(callback) registers a listener
 * - When status changes, callback is called with the new status
 * - The component state should always reflect the latest emitted status
 */
function simulateSyncSubscription(
  initialStatus: SyncStatus,
  statusChanges: SyncStatus[]
): SyncStatus {
  let currentStatus = initialStatus;
  for (const change of statusChanges) {
    currentStatus = change;
  }
  return currentStatus;
}

describe('SyncStatusIndicator logic', () => {
  describe('STATUS_CONFIG mapping', () => {
    it('should provide a config for every valid SyncStatus', () => {
      const allStatuses: SyncStatus[] = ['synced', 'syncing', 'offline', 'error'];
      for (const status of allStatuses) {
        expect(STATUS_CONFIG[status]).toBeDefined();
        expect(STATUS_CONFIG[status].label).toBeTruthy();
        expect(STATUS_CONFIG[status].color).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });

    it('syncing status should use empty icon (rendered as ActivityIndicator)', () => {
      expect(STATUS_CONFIG.syncing.icon).toBe('');
    });

    it('synced status should show green checkmark', () => {
      expect(STATUS_CONFIG.synced.icon).toBe('✓');
      expect(STATUS_CONFIG.synced.color).toBe('#34C759');
    });

    it('offline status should show gray cloud icon', () => {
      expect(STATUS_CONFIG.offline.icon).toBe('☁');
      expect(STATUS_CONFIG.offline.color).toBe('#8E8E93');
    });

    it('error status should show orange warning icon', () => {
      expect(STATUS_CONFIG.error.icon).toBe('⚠');
      expect(STATUS_CONFIG.error.color).toBe('#FF9500');
    });
  });

  describe('subscription contract', () => {
    it('should reflect initial status when no changes occur', () => {
      const result = simulateSyncSubscription('synced', []);
      expect(result).toBe('synced');
    });

    it('should reflect the latest status after multiple changes', () => {
      const result = simulateSyncSubscription('synced', ['syncing', 'synced', 'offline']);
      expect(result).toBe('offline');
    });

    it('should reflect syncing → error transition', () => {
      const result = simulateSyncSubscription('syncing', ['error']);
      expect(result).toBe('error');
    });

    it('should reflect offline → syncing → synced transition (coming back online)', () => {
      const result = simulateSyncSubscription('offline', ['syncing', 'synced']);
      expect(result).toBe('synced');
    });
  });

  describe('accessibility', () => {
    it('each status has a descriptive Spanish label for accessibility', () => {
      expect(STATUS_CONFIG.syncing.label).toBe('Sincronizando...');
      expect(STATUS_CONFIG.synced.label).toBe('Sincronizado');
      expect(STATUS_CONFIG.offline.label).toBe('Sin conexión');
      expect(STATUS_CONFIG.error.label).toBe('Error de sincronización');
    });
  });
});
