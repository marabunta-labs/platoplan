/**
 * PlatoPlan - useWebKeyboard hook
 *
 * Provides keyboard shortcut handling for web:
 * - Escape key to dismiss modals/dialogs
 * - Enter key to submit forms
 *
 * On native platforms, this hook is a no-op since native components
 * handle hardware back button via onRequestClose.
 *
 * Requirements: 3.6
 */

import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

export interface WebKeyboardOptions {
  /** Called when Escape key is pressed. Use to close modals. */
  onEscape?: () => void;
  /** Called when Enter key is pressed (without modifiers). Use to submit forms. */
  onEnter?: () => void;
  /** Whether the keyboard listener is currently active */
  enabled?: boolean;
}

/**
 * Hook to handle keyboard shortcuts on web.
 * On native, this is a no-op since keyboard events are handled differently.
 *
 * @example
 * ```tsx
 * useWebKeyboard({
 *   onEscape: () => setVisible(false),
 *   onEnter: handleSubmit,
 *   enabled: isModalVisible,
 * });
 * ```
 */
export function useWebKeyboard({
  onEscape,
  onEnter,
  enabled = true,
}: WebKeyboardOptions): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      if (event.key === 'Escape' && onEscape) {
        event.preventDefault();
        onEscape();
      }

      if (event.key === 'Enter' && onEnter && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        // Only trigger if focus is not on a textarea (allow multiline input)
        const target = event.target as HTMLElement;
        if (target?.tagName !== 'TEXTAREA') {
          event.preventDefault();
          onEnter();
        }
      }
    },
    [enabled, onEscape, onEnter]
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}
