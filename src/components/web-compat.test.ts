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
  // The web AlertCompat now renders in-app FLOATING dialogs (via the alert
  // store + AlertHost) instead of window.alert/window.confirm, so every message
  // shares the same floating style. We assert the enqueued request here.
  let received: any[] = [];
  let unsubscribe: () => void;

  beforeEach(async () => {
    received = [];
    const store = await import('./alertStore.web');
    unsubscribe = store.subscribeToAlerts((req) => received.push(req));
  });

  afterEach(() => {
    unsubscribe?.();
  });

  it('should NOT use window.alert/confirm (floating in-app dialog instead)', async () => {
    const alertSpy = vi.fn();
    const confirmSpy = vi.fn(() => true);
    const origAlert = globalThis.alert;
    const origConfirm = globalThis.confirm;
    globalThis.alert = alertSpy;
    globalThis.confirm = confirmSpy;

    const { AlertCompat } = await import('../utils/alert.web');
    AlertCompat.alert('Error', 'Something went wrong');

    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    globalThis.alert = origAlert;
    globalThis.confirm = origConfirm;
  });

  it('should enqueue an alert with title and message', async () => {
    const { AlertCompat } = await import('../utils/alert.web');
    AlertCompat.alert('Error', 'Something went wrong');

    const req = received[received.length - 1];
    expect(req.title).toBe('Error');
    expect(req.message).toBe('Something went wrong');
  });

  it('should default to a single OK button when none provided', async () => {
    const { AlertCompat } = await import('../utils/alert.web');
    AlertCompat.alert('Info');

    const req = received[received.length - 1];
    expect(req.title).toBe('Info');
    expect(req.buttons).toHaveLength(1);
  });

  it('should keep the provided two buttons for confirmation alerts', async () => {
    const { AlertCompat } = await import('../utils/alert.web');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    AlertCompat.alert('Confirm', 'Are you sure?', [
      { text: 'Cancel', onPress: onCancel, style: 'cancel' },
      { text: 'OK', onPress: onConfirm },
    ]);

    const req = received[received.length - 1];
    expect(req.buttons).toHaveLength(2);
    expect(req.buttons[0].style).toBe('cancel');
    // Pressing a button triggers its handler (as the host would on dismiss).
    req.buttons[1].onPress();
    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('should treat an empty buttons array as a default OK alert', async () => {
    const { AlertCompat } = await import('../utils/alert.web');
    AlertCompat.alert('Title', 'Message', []);

    const req = received[received.length - 1];
    expect(req.buttons).toHaveLength(1);
  });

  it('should preserve a single button with onPress callback', async () => {
    const { AlertCompat } = await import('../utils/alert.web');
    const onPress = vi.fn();

    AlertCompat.alert('Done', 'Success', [{ text: 'OK', onPress }]);

    const req = received[received.length - 1];
    expect(req.buttons).toHaveLength(1);
    req.buttons[0].onPress();
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
