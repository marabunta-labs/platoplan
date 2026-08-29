/**
 * PlatoPlan - Web Compatibility Tests
 *
 * Tests for platform-specific alternatives and web accessibility utilities.
 * Validates Requirements: 3.6, 3.7
 *
 * Note: Tests that import react-native components are skipped in this
 * test environment since vitest doesn't configure react-native resolution.
 * These are tested via the web build and integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Alert Compatibility Tests (web variant doesn't import react-native) ---

describe('AlertCompat (web)', () => {
  let originalAlert: typeof globalThis.alert;
  let originalConfirm: typeof globalThis.confirm;

  beforeEach(() => {
    // Mock browser globals
    originalAlert = globalThis.alert;
    originalConfirm = globalThis.confirm;
    globalThis.alert = vi.fn();
    globalThis.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    globalThis.alert = originalAlert;
    globalThis.confirm = originalConfirm;
  });

  it('should call window.alert for single-button alerts', async () => {
    const { AlertCompat } = await import('../utils/alert.web');

    AlertCompat.alert('Error', 'Something went wrong');

    expect(globalThis.alert).toHaveBeenCalledWith('Error\n\nSomething went wrong');
  });

  it('should call window.alert with title only when no message', async () => {
    const { AlertCompat } = await import('../utils/alert.web');

    AlertCompat.alert('Info');

    expect(globalThis.alert).toHaveBeenCalledWith('Info');
  });

  it('should call window.confirm for two-button alerts', async () => {
    const { AlertCompat } = await import('../utils/alert.web');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);

    AlertCompat.alert('Confirm', 'Are you sure?', [
      { text: 'Cancel', onPress: onCancel, style: 'cancel' },
      { text: 'OK', onPress: onConfirm },
    ]);

    expect(globalThis.confirm).toHaveBeenCalledWith('Confirm\n\nAre you sure?');
    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('should call cancel handler when confirm returns false', async () => {
    const { AlertCompat } = await import('../utils/alert.web');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);

    AlertCompat.alert('Confirm', 'Are you sure?', [
      { text: 'Cancel', onPress: onCancel, style: 'cancel' },
      { text: 'OK', onPress: onConfirm },
    ]);

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('should handle empty buttons array like an alert', async () => {
    const { AlertCompat } = await import('../utils/alert.web');

    AlertCompat.alert('Title', 'Message', []);

    expect(globalThis.alert).toHaveBeenCalledWith('Title\n\nMessage');
  });

  it('should handle single button with onPress callback', async () => {
    const { AlertCompat } = await import('../utils/alert.web');
    const onPress = vi.fn();

    AlertCompat.alert('Done', 'Success', [
      { text: 'OK', onPress },
    ]);

    expect(globalThis.alert).toHaveBeenCalledWith('Done\n\nSuccess');
    expect(onPress).toHaveBeenCalled();
  });
});

// --- StatusBarCompat Web Tests (no react-native dependency) ---

describe('StatusBarCompat.web', () => {
  it('should export a StatusBar component that renders null', async () => {
    const { StatusBar } = await import('./StatusBarCompat.web');
    expect(StatusBar).toBeDefined();
    const result = StatusBar({ style: 'auto' });
    expect(result).toBeNull();
  });

  it('should accept all native StatusBar props without error', async () => {
    const { StatusBar } = await import('./StatusBarCompat.web');
    const result = StatusBar({
      style: 'dark',
      backgroundColor: '#fff',
      translucent: true,
      hidden: false,
      animated: true,
    });
    expect(result).toBeNull();
  });
});
