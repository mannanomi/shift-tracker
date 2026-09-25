import { db, type OutboxItem, type RecordKind } from '../../db/db';
import { ensureSeeded, setChangeListener } from '../../db/repository';
import { supabase } from './client';

const OWNER_KEY = 'shift-tracker-owner';
const LAST_SYNC_KEY = 'shift-tracker-last-sync';
const cursorKey = (userId: string) => `shift-tracker-cursor-${userId}`;
export const SYNC_EVENT = 'shift-tracker-sync';

const PAGE = 1000;

function tableFor(kind: RecordKind) {
  switch (kind) {
    case 'job':
      return db.jobs;
    case 'shift':
      return db.shifts;
    case 'holiday':
      return db.publicHolidays;
    case 'settings':
      return db.settings;
  }
}

export function getLastSync(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

function markSynced() {
  try {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SYNC_EVENT));
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Sends queued local changes to the cloud. Throws on network/auth errors (items stay queued). */
export async function pushOutbox(): Promise<void> {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  const items = await db.outbox.toArray();
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    const rows = chunk.map((item) => ({
      user_id: userId,
      kind: item.kind,
      id: item.id,
      data: item.op === 'put' ? item.data : {},
      deleted: item.op === 'delete',
    }));
    const { error } = await supabase.from('records').upsert(rows, { onConflict: 'user_id,kind,id' });
    if (error) throw error;
    // Drop only entries that weren't changed again while the request was in flight.
    await db.transaction('rw', db.outbox, async () => {
      for (const item of chunk) {
        const current = await db.outbox.get(item.key);
        if (current && current.ts === item.ts) await db.outbox.delete(item.key);
      }
    });
  }
}

/** Downloads changes made on other devices and applies them locally. */
export async function pullChanges(userId: string): Promise<void> {
  if (!supabase) return;
  let cursor = localStorage.getItem(cursorKey(userId)) ?? '1970-01-01T00:00:00Z';
  let newest = cursor;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('records')
      .select('kind,id,data,deleted,updated_at')
      .gte('updated_at', cursor)
      .order('updated_at')
      .order('kind')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    await db.transaction('rw', db.jobs, db.shifts, db.publicHolidays, db.settings, db.outbox, async () => {
      const pending = new Set((await db.outbox.toArray()).map((o) => o.key));
      for (const row of data) {
        if (pending.has(`${row.kind}:${row.id}`)) continue; // local edit not pushed yet wins
        const table = tableFor(row.kind as RecordKind) as unknown as {
          put: (v: unknown) => Promise<unknown>;
          delete: (id: string) => Promise<void>;
        };
        if (row.deleted) await table.delete(row.id);
        else await table.put(row.data);
      }
    });
    for (const row of data) if (row.updated_at > newest) newest = row.updated_at;
    if (data.length < PAGE) break;
  }
  localStorage.setItem(cursorKey(userId), newest);
}

async function wipeLocal() {
  await db.transaction('rw', db.jobs, db.shifts, db.publicHolidays, db.settings, db.outbox, async () => {
    await Promise.all([
      db.jobs.clear(),
      db.shifts.clear(),
      db.publicHolidays.clear(),
      db.settings.clear(),
      db.outbox.clear(),
    ]);
  });
}

async function cloudCount(kinds: RecordKind[]): Promise<number> {
  const { count, error } = await supabase!
    .from('records')
    .select('id', { count: 'exact', head: true })
    .in('kind', kinds)
    .eq('deleted', false);
  if (error) throw error;
  return count ?? 0;
}

/**
 * First-run for a signed-in user on this device. Local data is only a cache of the account,
 * except data that pre-dates accounts ("legacy"), which gets adopted into the account.
 */
async function prepareUser(userId: string): Promise<void> {
  const owner = localStorage.getItem(OWNER_KEY);
  if (owner === userId) {
    try {
      await pullChanges(userId);
    } catch {
      /* offline: carry on with the local copy */
    }
    return;
  }

  const localJobsShifts = (await db.jobs.count()) + (await db.shifts.count());
  let legacy = owner === null && localJobsShifts > 0;

  if (owner !== null || !legacy) {
    await wipeLocal(); // another account's cache, or nothing but default seed data
  }

  const cloudHasWork = (await cloudCount(['job', 'shift'])) > 0;
  const cloudHasHolidays = (await cloudCount(['holiday'])) > 0;

  if (legacy && cloudHasWork) {
    const merge = window.confirm(
      'This device has jobs/shifts that are not in your account yet, and your account already has data.\n\n' +
        'OK = add this device’s jobs and shifts to your account.\nCancel = discard them and use your account data.',
    );
    if (!merge) {
      await wipeLocal();
      legacy = false;
    }
  }

  const snapshot = legacy
    ? {
        jobs: await db.jobs.toArray(),
        shifts: await db.shifts.toArray(),
        holidays: await db.publicHolidays.toArray(),
        settings: await db.settings.toArray(),
      }
    : null;
  if (snapshot && cloudHasHolidays) await db.publicHolidays.clear();

  localStorage.removeItem(cursorKey(userId));
  await pullChanges(userId);

  if (snapshot) {
    const now = Date.now();
    const items: OutboxItem[] = [
      ...snapshot.jobs.map((r) => ({ kind: 'job' as const, id: r.id, data: r })),
      ...snapshot.shifts.map((r) => ({ kind: 'shift' as const, id: r.id, data: r })),
      ...(cloudHasHolidays ? [] : snapshot.holidays.map((r) => ({ kind: 'holiday' as const, id: r.id, data: r }))),
      ...snapshot.settings.map((r) => ({ kind: 'settings' as const, id: r.id, data: r })),
    ].map((r) => ({ ...r, key: `${r.kind}:${r.id}`, op: 'put' as const, ts: now }));
    await db.transaction('rw', db.jobs, db.shifts, db.publicHolidays, db.settings, db.outbox, async () => {
      // Pull may have replaced settings with the account's copy; this device's data is being adopted.
      if (snapshot.settings.length) await db.settings.bulkPut(snapshot.settings);
      await db.outbox.bulkPut(items);
    });
  }

  localStorage.setItem(OWNER_KEY, userId);
}

let preparing: { userId: string; promise: Promise<void> } | null = null;
let syncing: Promise<void> | null = null;

/** Push then pull, one run at a time. Errors (offline etc.) are swallowed; the next tick retries. */
export function syncNow(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const userId = await currentUserId();
      if (!userId || localStorage.getItem(OWNER_KEY) !== userId) return;
      await pushOutbox();
      await pullChanges(userId);
      markSynced();
    } catch {
      /* retry later */
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/**
 * Prepares local data for this user, then keeps it in sync (on changes, focus, reconnect,
 * and every 30s). Resolves once the local data is ready to show. Returns a stop function.
 */
export async function startSync(userId: string): Promise<() => void> {
  if (!preparing || preparing.userId !== userId) {
    const promise = prepareUser(userId).then(() => ensureSeeded());
    preparing = { userId, promise };
    promise.catch(() => {
      if (preparing?.promise === promise) preparing = null;
    });
  }
  await preparing.promise;

  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  setChangeListener(() => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void syncNow(), 800);
  });
  const tick = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  window.addEventListener('focus', tick);
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(tick, 30_000);
  tick();

  return () => {
    setChangeListener(null);
    clearTimeout(pushTimer);
    clearInterval(interval);
    window.removeEventListener('focus', tick);
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Uploads pending changes, clears this device's copy, and signs out. */
export async function signOutAndClear(): Promise<void> {
  if (!supabase) return;
  try {
    await pushOutbox();
  } catch {
    if (!window.confirm('Some changes could not be uploaded (offline?). Sign out anyway and lose them?')) return;
  }
  await wipeLocal();
  localStorage.removeItem(OWNER_KEY);
  preparing = null;
  await supabase.auth.signOut();
}
