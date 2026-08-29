/**
 * PlatoPlan - WebAccessible
 *
 * Utility components and helpers for web accessibility:
 * - FocusTrap: Traps focus within a modal/dialog on web
 * - Pressable with tabIndex: Ensures keyboard-navigable interactive elements
 *
 * On native, these are pass-through wrappers.
 *
 * Requirements: 3.6
 */

import React, { useEffect, useRef } from 'react';
import { View, Platform } from 'react-native';
import type { ViewProps } from 'react-native';

export interface FocusTrapProps extends ViewProps {
  /** Whether the focus trap is active */
  active: boolean;
  children: React.ReactNode;
}

/**
 * Traps keyboard focus within its children when active.
 * On native platforms, this is a pass-through View.
 * On web, it manages focus cycling using Tab/Shift+Tab.
 */
export function FocusTrap({ active, children, ...viewProps }: FocusTrapProps) {
  const containerRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;

    const container = containerRef.current as unknown as HTMLElement;
    if (!container) return;

    // Focus the first focusable element when trap activates
    const focusableElements = getFocusableElements(container);
    if (focusableElements.length > 0) {
      // Delay to allow modal animation to complete
      const timer = setTimeout(() => {
        focusableElements[0].focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [active]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;

    const container = containerRef.current as unknown as HTMLElement;
    if (!container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift+Tab: cycle backwards
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: cycle forwards
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [active]);

  return (
    <View ref={containerRef} {...viewProps}>
      {children}
    </View>
  );
}

/**
 * Gets all focusable elements within a container.
 * Used for focus trapping in modals on web.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[role="button"]:not([disabled])',
  ].join(', ');

  return Array.from(container.querySelectorAll(selector)) as HTMLElement[];
}
