import { describe, it, expect } from 'vitest';
import { runSync, hashRow, rowKey, mapRemoteRowToLocal, type LocalStore, type RemoteStore, type PushState, type Row } from '../push-sync';
import { MIGRATION_TABLE_ORDER, type MigratableTable } from '../../services/migration.service';

const USER = 'user-1';

function makeLocal(initial: Partial<Record<MigratableTable, Row[]>> = {}) {
  const tables = new Map<MigratableTable, Row[]>(MIGRATION_TABLE_ORDER.map((t) => [t, [...(initial[t] ?? [])]]));
  const state: PushState = {};
  const store: LocalStore = {
    readAll: async (t) => tables.get(t)!.map((r) => ({ ...r })),
    insertFromRemote: async (t, remoteRow) => {
      const { user_id: _u, synced_at: _s, ...row } = remoteRow;
      tables.get(t)!.push(row);
    },
    loadState: async () => JSON.parse(JSON.stringify(state)),
    saveState: async (t, upserts, removals) => {
      const tableState = (state[t] ??= {});
      Object.assign(tableState, upserts);
      removals.forEach((k) => delete tableState[k]);
    },
  };
  return { store, tables, state };
}

function makeRemote(opts: { rejectIds?: string[]; uniqueSlot?: boolean } = {}) {
  const tables = new Map<MigratableTable, Map<string, Row>>(MIGRATION_TABLE_ORDER.map((t) => [t, new Map()]));
  const calls = { upsert: [] as string[], remove: [] as string[] };
  const store: RemoteStore = {
    listKeys: async (t) => [...tables.get(t)!.keys()],
    fetchRows: async (t) => [...tables.get(t)!.values()],
    upsert: async (t, rows) => {
      for (const r of rows) {
        if (opts.rejectIds?.includes(r.id as string)) throw new Error(`rejected ${r.id}`);
      }
      for (const r of rows) {
        if (opts.uniqueSlot && t === 'plan_assignments') {
          const clash = [...tables.get(t)!.values()].find(
            (x) => x.id !== r.id && x.plan_id === r.plan_id && x.day_index === r.day_index && x.slot === r.slot
          );
          if (clash) throw new Error('unique violation plan/day/slot');
        }
        tables.get(t)!.set(rowKey(t, r), r);
        calls.upsert.push(`${t}:${rowKey(t, r)}`);
      }
    },
    remove: async (t, keys) => {
      keys.forEach((k) => tables.get(t)!.delete(k));
      calls.remove.push(...keys.map((k) => `${t}:${k}`));
    },
  };
  return { store, tables, calls };
}

const recipe = (id: string, name = id): Row => ({
  id, name, meal_type: 'comida', prep_time: 'rapido', description: '', servings: 2,
  created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00',
});
const assignment = (id: string, slot = 'comida', day = 0): Row => ({ id, plan_id: 'p1', day_index: day, slot, recipe_id: 'r1' });
const plan = (): Row => ({
  id: 'p1', name: 'Semana', period_days: 7, start_date: '2026-01-01', servings: 2, status: 'draft',
  elaborate_days_config: '[]', day_notes: '{}', meal_notes: '{}',
  created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00',
});

describe('runSync', () => {
  it('uploads local rows once and then has nothing left to push', async () => {
    const local = makeLocal({ recipes: [recipe('r1'), recipe('r2')] });
    const remote = makeRemote();

    const first = await runSync(local.store, remote.store, USER, { pull: true });
    expect(first.pushed).toBe(2);
    expect(first.failed).toEqual([]);
    expect([...remote.tables.get('recipes')!.keys()].sort()).toEqual(['r1', 'r2']);
    expect(remote.tables.get('recipes')!.get('r1')!.user_id).toBe(USER);

    const second = await runSync(local.store, remote.store, USER, { pull: true });
    expect(second.pushed).toBe(0);
    expect(second.deleted).toBe(0);
  });

  it('pushes only the rows that changed', async () => {
    const local = makeLocal({ recipes: [recipe('r1'), recipe('r2')] });
    const remote = makeRemote();
    await runSync(local.store, remote.store, USER, { pull: false });
    remote.calls.upsert.length = 0;

    local.tables.get('recipes')![0] = { ...recipe('r1'), name: 'Renombrada' };
    const result = await runSync(local.store, remote.store, USER, { pull: false });

    expect(result.pushed).toBe(1);
    expect(remote.calls.upsert).toEqual(['recipes:r1']);
    expect(remote.tables.get('recipes')!.get('r1')!.name).toBe('Renombrada');
  });

  it('deletes remotely what was deleted locally, but leaves rows from other devices alone', async () => {
    const local = makeLocal({ recipes: [recipe('r1'), recipe('r2')] });
    const remote = makeRemote();
    await runSync(local.store, remote.store, USER, { pull: false });
    // A row created elsewhere (never pushed or seen by this device).
    remote.tables.get('recipes')!.set('other', { ...recipe('other'), user_id: USER });

    local.tables.set('recipes', [recipe('r1')]); // user deleted r2 here
    const result = await runSync(local.store, remote.store, USER, { pull: false });

    expect(result.deleted).toBe(1);
    expect([...remote.tables.get('recipes')!.keys()].sort()).toEqual(['other', 'r1']);
    expect(local.state.recipes).not.toHaveProperty('r2');
  });

  it('restores an empty device from the cloud without pushing it back or deleting anything', async () => {
    const remote = makeRemote();
    remote.tables.get('recipes')!.set('r1', { ...recipe('r1'), user_id: USER, synced_at: 'x' });
    remote.tables.get('recipes')!.set('r2', { ...recipe('r2'), user_id: USER, synced_at: 'x' });
    const local = makeLocal();

    const result = await runSync(local.store, remote.store, USER, { pull: true });

    expect(result.pulled).toBe(2);
    expect(result.pulledTables).toEqual(['recipes']);
    expect(result.pushed).toBe(0);
    expect(result.deleted).toBe(0);
    expect(local.tables.get('recipes')!.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(remote.tables.get('recipes')!.size).toBe(2);
  });

  it('never wipes the cloud when a root table is suddenly empty locally', async () => {
    const local = makeLocal({ recipes: [recipe('r1'), recipe('r2')] });
    const remote = makeRemote();
    await runSync(local.store, remote.store, USER, { pull: false });

    local.tables.set('recipes', []); // e.g. local data was corrupted/cleared but state survived
    const result = await runSync(local.store, remote.store, USER, { pull: false });

    expect(result.deleted).toBe(0);
    expect(remote.tables.get('recipes')!.size).toBe(2);
    expect(result.failed.some((f) => f.phase === 'skipped' && f.table === 'recipes')).toBe(true);
  });

  it('does not pull back a row this device already deleted (remote delete pending)', async () => {
    const local = makeLocal({ recipes: [recipe('r1')] });
    const remote = makeRemote();
    await runSync(local.store, remote.store, USER, { pull: false });

    local.tables.set('recipes', [recipe('keep')]);
    // The remote delete is rejected this time.
    const failingRemote: RemoteStore = { ...remote.store, remove: async () => { throw new Error('offline'); } };
    const result = await runSync(local.store, failingRemote, USER, { pull: true });

    expect(result.pulled).toBe(0);
    expect(local.tables.get('recipes')!.map((r) => r.id)).toEqual(['keep']);
    expect(result.failed.some((f) => f.phase === 'delete')).toBe(true);
  });

  it('isolates a rejected row and still pushes the others, retrying the bad one next time', async () => {
    const local = makeLocal({ recipes: [recipe('ok1'), recipe('bad'), recipe('ok2')] });
    const remote = makeRemote({ rejectIds: ['bad'] });

    const result = await runSync(local.store, remote.store, USER, { pull: false });

    expect(result.pushed).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ table: 'recipes', key: 'bad', phase: 'upsert' });
    expect(local.state.recipes).not.toHaveProperty('bad');

    const retry = await runSync(local.store, remote.store, USER, { pull: false });
    expect(retry.failed).toHaveLength(1); // still rejected, and retried
    expect(retry.pushed).toBe(0);
  });

  it('removes stale assignments before inserting new ones so the unique slot never clashes', async () => {
    const local = makeLocal({ recipes: [recipe('r1')], menu_plans: [plan()], plan_assignments: [assignment('old-a')] });
    const remote = makeRemote({ uniqueSlot: true });
    await runSync(local.store, remote.store, USER, { pull: false });

    // The app re-creates assignments with new ids for the same slot.
    local.tables.set('plan_assignments', [assignment('new-a')]);
    const result = await runSync(local.store, remote.store, USER, { pull: false });

    expect(result.failed).toEqual([]);
    expect([...remote.tables.get('plan_assignments')!.keys()]).toEqual(['new-a']);
  });

  it('uploads parents before children and deletes children before parents', async () => {
    const local = makeLocal({ recipes: [recipe('r1')], menu_plans: [plan()], plan_assignments: [assignment('a1')] });
    const remote = makeRemote();
    await runSync(local.store, remote.store, USER, { pull: false });
    const order = remote.calls.upsert.map((c) => c.split(':')[0]);
    expect(order.indexOf('recipes')).toBeLessThan(order.indexOf('plan_assignments'));
    expect(order.indexOf('menu_plans')).toBeLessThan(order.indexOf('plan_assignments'));

    local.tables.set('plan_assignments', []);
    local.tables.set('menu_plans', [plan()]);
    local.tables.set('recipes', [recipe('r2')]); // r1 deleted, its assignment too
    await runSync(local.store, remote.store, USER, { pull: false });
    const removed = remote.calls.remove.map((c) => c.split(':')[0]);
    expect(removed.indexOf('plan_assignments')).toBeLessThan(removed.indexOf('recipes'));
  });

  it('reports a fetch failure as a pull failure without aborting the push', async () => {
    const local = makeLocal({ recipes: [recipe('r1')] });
    const remote = makeRemote();
    const flaky: RemoteStore = { ...remote.store, listKeys: async () => { throw new Error('network down'); } };

    const result = await runSync(local.store, flaky, USER, { pull: true });

    expect(result.failed.some((f) => f.phase === 'pull')).toBe(true);
    expect(result.pushed).toBe(1);
  });
});

describe('helpers', () => {
  it('hashRow ignores key order and detects changes', () => {
    expect(hashRow({ a: 1, b: 2 })).toBe(hashRow({ b: 2, a: 1 }));
    expect(hashRow({ a: 1 })).not.toBe(hashRow({ a: 2 }));
  });

  it('rowKey joins composite keys', () => {
    expect(rowKey('recipe_ingredients', { recipe_id: 'r', ingredient_id: 'i' })).toBe('r:i');
    expect(rowKey('recipes', { id: 'x' })).toBe('x');
  });

  it('mapRemoteRowToLocal keeps only local columns and converts types', () => {
    const local = new Set(['id', 'name', 'is_stale', 'day_notes']);
    expect(
      mapRemoteRowToLocal(
        { id: '1', name: 'x', user_id: 'u', synced_at: 't', is_stale: true, day_notes: { 0: 'hi' }, extra: 'drop', nothing: null },
        local
      )
    ).toEqual({ id: '1', name: 'x', is_stale: 1, day_notes: '{"0":"hi"}' });
  });
});
