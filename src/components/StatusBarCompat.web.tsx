/**
 * PlatoPlan - StatusBarCompat (Web)
 *
 * No-op component for web since the native status bar concept
 * does not apply in a browser environment.
 *
 * Requirements: 3.7
 */

import React from 'react';

interface StatusBarProps {
  style?: 'auto' | 'inverted' | 'light' | 'dark';
  backgroundColor?: string;
  translucent?: boolean;
  hidden?: boolean;
  animated?: boolean;
  networkActivityIndicatorVisible?: boolean;
}

/**
 * StatusBar no-op for web. Renders nothing.
 */
export function StatusBar(_props: StatusBarProps): React.ReactElement | null {
  return null;
}
