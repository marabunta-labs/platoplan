/**
 * PlatoPlan - useBackgroundSync
 *
 * Keeps the signed-in user's data mirrored in Supabase. Runs a full pass on
 * start and whenever the browser comes back online (pull + push), and a quick
 * push-only pass every few seconds so edits reach the cloud shortly after they
 * are made. Mount it once, only for authenticated (non-guest) users.
 */

import { useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useDatabase } from '../context/DatabaseContext';
import { useAuth } from '../context/AuthContext';
import { runSync, type SyncSummary } from '../sync/push-sync';
import { createSqliteLocalStore, createSupabaseRemoteStore } from '../sync/push-sync-adapters';
import { setEngineState } from '../sync/engine-status';
import { tableInvalidationEmitter } from './tableInvalidationEmitter';

const PUSH_INTERVAL_MS = 10_000;
const PULL_EVERY_N_TICKS = 6;

function describe(summary: SyncSummary): string {
  const first = summary.failed[0];
  return `${summary.failed.length} ${summary.failed.length === 1 ? 'error' : 'errores'}: ${first.table} (${first.phase}) ${first.error}`;
}

export function useBackgroundSync(client: SupabaseClient): void {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    const local = createSqliteLocalStore(db, userId);
    const remote = createSupabaseRemoteStore(client, userId);
    let running = false;
    let stopped = false;
    let tick = 0;

    const run = async (pull: boolean) => {
      if (running || stopped) return;
      running = true;
      setEngineState({ status: 'syncing' });
      try {
        const summary = await runSync(local, remote, userId, { pull });
        summary.pulledTables.forEach((t) => tableInvalidationEmitter.emit(t));
        // "skipped" entries are safety refusals, not failures worth alarming about.
        const real = { ...summary, failed: summary.failed.filter((f) => f.phase !== 'skipped') };
        setEngineState(real.failed.length > 0 ? { status: 'error', message: describe(real) } : { status: 'idle' });
        if (real.failed.length > 0) console.warn('[sync]', real.failed);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn('[sync] failed:', message);
        setEngineState({ status: 'error', message });
      } finally {
        running = false;
      }
    };

    void run(true);
    const timer = setInterval(() => {
      tick += 1;
      void run(tick % PULL_EVERY_N_TICKS === 0);
    }, PUSH_INTERVAL_MS);

    const onOnline = () => void run(true);
    const canListen = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    if (canListen) window.addEventListener('online', onOnline);

    return () => {
      stopped = true;
      clearInterval(timer);
      if (canListen) window.removeEventListener('online', onOnline);
    };
  }, [db, client, userId]);
}
