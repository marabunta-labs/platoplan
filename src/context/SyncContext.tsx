/**
 * PlatoPlan - Sync Context
 *
 * Provides the SyncManager instance to the component tree via React context.
 * Initializes the SyncManager with its dependencies (OfflineQueue, ConflictResolver,
 * Supabase client) and manages its lifecycle.
 *
 * Requirements: 5.3, 6.1, 6.2
 */

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { SyncManager } from '../sync/sync-manager';
import type { ISyncManager } from '../sync/sync-manager';
import { OfflineQueue } from '../sync/offline-queue';
import { ConflictResolver } from '../sync/conflict-resolver';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SyncContextValue {
  syncManager: ISyncManager;
}

interface SyncProviderProps {
  children: React.ReactNode;
  /** The SQLite database instance for the offline queue. */
  db: SQLiteDatabase;
  /** The configured Supabase client. */
  supabaseClient: SupabaseClient;
}

/**
 * Tables that participate in the sync system.
 * These are subscribed to via Supabase Realtime for remote change notifications.
 */
const SYNCED_TABLES = [
  'ingredients',
  'recipes',
  'recipe_ingredients',
  'pantry_entries',
  'menu_plans',
  'plan_assignments',
  'free_days',
  'shopping_lists',
  'shopping_list_items',
];

// ─── Context ────────────────────────────────────────────────────────────────

const SyncContext = createContext<SyncContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

/**
 * SyncProvider initializes the SyncManager and makes it available to the
 * entire component tree. It handles:
 *
 * - Creating the OfflineQueue (backed by local SQLite)
 * - Creating the ConflictResolver (last-write-wins strategy)
 * - Initializing the SyncManager with all dependencies
 * - Setting up Supabase Realtime subscriptions
 * - Cleaning up on unmount
 */
export function SyncProvider({ children, db, supabaseClient }: SyncProviderProps) {
  const syncManager = useMemo(() => {
    const offlineQueue = new OfflineQueue(db);
    const conflictResolver = new ConflictResolver();

    return new SyncManager({
      offlineQueue,
      conflictResolver,
      supabaseClient,
      tables: SYNCED_TABLES,
    });
  }, [db, supabaseClient]);

  useEffect(() => {
    // Initialize the offline queue tables
    const offlineQueue = new OfflineQueue(db);
    offlineQueue.initialize().catch(() => {
      // Queue tables may already exist — safe to ignore
    });

    // Set up Supabase Realtime subscriptions for all synced tables
    const unsubscribe = syncManager.subscribe();

    return () => {
      unsubscribe();
      syncManager.destroy();
    };
  }, [syncManager, db]);

  return (
    <SyncContext.Provider value={{ syncManager }}>
      {children}
    </SyncContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook to access the SyncManager instance from any component within SyncProvider.
 * Returns the ISyncManager which can be used to:
 * - Check online/offline status
 * - Check sync status (synced, syncing, offline, error)
 * - Subscribe to status changes
 * - Manually trigger replay
 *
 * @throws Error if used outside of SyncProvider
 */
export function useSync(): ISyncManager {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context.syncManager;
}
