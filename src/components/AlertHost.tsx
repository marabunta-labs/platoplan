/**
 * PlatoPlan - AlertHost (Native)
 *
 * On native, alerts are shown with React Native's Alert.alert (a floating
 * native dialog), so no host component is needed. This renders nothing.
 * The web variant (AlertHost.web.tsx) renders in-app floating dialogs.
 */

import React from 'react';

export function AlertHost(): React.ReactElement | null {
  return null;
}
