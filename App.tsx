/**
 * PlatoPlan - App Root
 *
 * Wires all providers together in the correct hierarchy:
 * I18nProvider → AuthProvider → DatabaseProvider → [SyncProvider] → NavigationContainer → ResponsiveNavigator
 *
 * - I18nProvider manages locale state and translations.
 * - AuthProvider handles auth state; renders login screens when no session exists (unless guest).
 * - DatabaseProvider initializes SQLite and exposes `db` to the tree.
 * - SyncProvider (only when authenticated) initializes the SyncManager.
 * - RealtimeSyncBridge mounts `useRealtimeSync()` to bridge remote changes to local cache.
 * - ResponsiveNavigator renders sidebar (≥768px) or bottom tabs (<768px).
 *
 * When in guest mode: SyncProvider is NOT mounted; app works fully offline.
 * When authenticated: SyncedRepository instances route writes to both local + Supabase.
 * When offline with no session: local-only repositories serve all data from SQLite cache.
 *
 * Requirements: 4.8, 5.3, 6.1
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from '@/components/StatusBarCompat';
import { GuestBanner } from '@/components/GuestBanner';
import { AuthProvider, DatabaseProvider, SyncProvider, ThemeProvider } from '@/context';
import { useAuth } from '@/context';
import { ResponsiveNavigator } from '@/navigation';
import { useRealtimeSync } from '@/hooks';
import { useDatabase } from '@/context';
import { supabase } from '@/config/supabase';
import { I18nProvider } from '@/i18n';
import { AlertHost } from '@/components';
import { View } from 'react-native'
import { applyGlobalFont } from '@/constants/typography';

// Apply the app-wide font family once, before anything renders, so every
// Text/TextInput uses the same typeface across all screens.
applyGlobalFont();

/**
 * RealtimeSyncBridge
 *
 * Wrapper component that mounts the `useRealtimeSync()` hook.
 * Must be rendered inside both SyncProvider and DatabaseProvider so the hook
 * can access the SyncManager (for remote change listeners) and the db
 * (for writing remote changes to local SQLite).
 */
function RealtimeSyncBridge({ children }: { children: React.ReactNode }) {
  useRealtimeSync();
  return <>{children}</>;
}

/**
 * AuthenticatedApp
 *
 * Rendered when user is authenticated (or in guest mode).
 * When authenticated: wraps in SyncProvider + RealtimeSyncBridge.
 * When guest: skips SyncProvider entirely, using only local SQLite.
 */
function AuthenticatedApp() {
  const db = useDatabase();
  const { isGuest } = useAuth();

  if (isGuest) {
  // Guest mode: no sync, just local database + navigation
  return (
    <View style={{ flex: 1 }}>
      <GuestBanner />
      <NavigationContainer>
        <ResponsiveNavigator />
        <StatusBar style="auto" />
      </NavigationContainer>
    </View>
  );
}

  return (
    <SyncProvider db={db} supabaseClient={supabase}>
      <RealtimeSyncBridge>
        <NavigationContainer>
          <ResponsiveNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </RealtimeSyncBridge>
    </SyncProvider>
  );
}

/**
 * App entry point.
 *
 * Provider hierarchy:
 * - I18nProvider: manages locale and translations
 * - AuthProvider: gates on authentication; renders auth screens or children
 * - DatabaseProvider: initializes local SQLite database
 * - AuthenticatedApp: mounts SyncProvider (if authenticated) + navigation
 */
export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <DatabaseProvider>
            <AuthenticatedApp />
          </DatabaseProvider>
        </AuthProvider>
        {/* App-wide floating alert host (web renders in-app dialogs; native is a no-op) */}
        <AlertHost />
      </ThemeProvider>
    </I18nProvider>
  );
}
