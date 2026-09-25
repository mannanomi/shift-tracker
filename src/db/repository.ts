import type { EntityTable } from 'dexie';
import { db, type RecordKind } from './db';
import { cloudEnabled } from '../lib/supabase/client';
import type { AppSettings, Job, PublicHoliday, Shift } from '../types';
import { seedPublicHolidaysSA2026 } from '../seed/publicHolidays';

let changeListener: (() => void) | null = null;
/** The sync layer registers here to be told when a local change is queued. */
export function setChangeListener(fn: (() => void) | null) {
  changeListener = fn;
}

async function queue(kind: RecordKind, id: string, op: 'put' | 'delete', data: unknown) {
  if (!cloudEnabled) return;
  await db.outbox.put({ key: `${kind}:${id}`, kind, id, op, data, ts: Date.now() });
}

async function putTracked<T extends { id: string }>(kind: RecordKind, table: EntityTable<T, 'id'>, record: T) {
  await db.transaction('rw', table, db.outbox, async () => {
    await table.put(record);
    await queue(kind, record.id, 'put', record);
  });
  changeListener?.();
}

async function removeTracked<T extends { id: string }>(kind: RecordKind, table: EntityTable<T, 'id'>, id: string) {
  await db.transaction('rw', table, db.outbox, async () => {
    await table.delete(id as never);
    await queue(kind, id, 'delete', null);
  });
  changeListener?.();
}

/**
 * Runs the read-then-write seeding check inside one readwrite transaction so concurrent
 * calls (e.g. React StrictMode double-invoking the mount effect in dev) can't both see
 * "empty" and both insert — IndexedDB serializes readwrite transactions on the same stores.
 */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.publicHolidays, db.settings, db.outbox, async () => {
    const [holidayCount, settings] = await Promise.all([
      db.publicHolidays.count(),
      db.settings.get('settings'),
    ]);

    if (holidayCount === 0) {
      const holidays = seedPublicHolidaysSA2026().map((h) => ({ ...h, id: crypto.randomUUID() }));
      await db.publicHolidays.bulkAdd(holidays);
      for (const h of holidays) await queue('holiday', h.id, 'put', h);
    }

    if (!settings) {
      const defaultSettings: AppSettings = {
        id: 'settings',
        weekStartDay: 1,
        fortnightAnchorDate: new Date().toISOString().slice(0, 10),
      };
      await db.settings.put(defaultSettings);
      await queue('settings', defaultSettings.id, 'put', defaultSettings);
    }
  });
  changeListener?.();
}

export const jobsRepo = {
  all: () => db.jobs.toArray(),
  get: (id: string) => db.jobs.get(id),
  put: (job: Job) => putTracked('job', db.jobs, job),
  remove: (id: string) => removeTracked('job', db.jobs, id),
};

export const shiftsRepo = {
  all: () => db.shifts.toArray(),
  get: (id: string) => db.shifts.get(id),
  byJob: (jobId: string) => db.shifts.where('jobId').equals(jobId).toArray(),
  inDateRange: (startDate: string, endDate: string) =>
    db.shifts.where('date').between(startDate, endDate, true, true).toArray(),
  put: (shift: Shift) => putTracked('shift', db.shifts, shift),
  remove: (id: string) => removeTracked('shift', db.shifts, id),
};

export const publicHolidaysRepo = {
  all: () => db.publicHolidays.toArray(),
  put: (holiday: PublicHoliday) => putTracked('holiday', db.publicHolidays, holiday),
  remove: (id: string) => removeTracked('holiday', db.publicHolidays, id),
};

export const settingsRepo = {
  get: () => db.settings.get('settings'),
  put: (settings: AppSettings) => putTracked('settings', db.settings, settings),
};

export interface BackupFile {
  app: 'shift-tracker';
  version: 1;
  exportedAt: string;
  jobs: Job[];
  shifts: Shift[];
  publicHolidays: PublicHoliday[];
  settings: AppSettings[];
}

export async function exportBackup(): Promise<BackupFile> {
  const [jobs, shifts, publicHolidays, settings] = await Promise.all([
    db.jobs.toArray(),
    db.shifts.toArray(),
    db.publicHolidays.toArray(),
    db.settings.toArray(),
  ]);
  return { app: 'shift-tracker', version: 1, exportedAt: new Date().toISOString(), jobs, shifts, publicHolidays, settings };
}

/** Replaces ALL local data with the backup's contents. */
export async function importBackup(data: unknown): Promise<void> {
  const b = data as Partial<BackupFile>;
  if (
    !b ||
    b.app !== 'shift-tracker' ||
    !Array.isArray(b.jobs) ||
    !Array.isArray(b.shifts) ||
    !Array.isArray(b.publicHolidays) ||
    !Array.isArray(b.settings)
  ) {
    throw new Error('This file is not a Shift Tracker backup.');
  }
  const incoming: [RecordKind, { id: string }[]][] = [
    ['job', b.jobs],
    ['shift', b.shifts],
    ['holiday', b.publicHolidays],
    ['settings', b.settings],
  ];
  await db.transaction('rw', db.jobs, db.shifts, db.publicHolidays, db.settings, db.outbox, async () => {
    const existing: [RecordKind, { id: string }[]][] = [
      ['job', await db.jobs.toArray()],
      ['shift', await db.shifts.toArray()],
      ['holiday', await db.publicHolidays.toArray()],
      ['settings', await db.settings.toArray()],
    ];
    await Promise.all([db.jobs.clear(), db.shifts.clear(), db.publicHolidays.clear(), db.settings.clear()]);
    await db.jobs.bulkAdd(b.jobs!);
    await db.shifts.bulkAdd(b.shifts!);
    await db.publicHolidays.bulkAdd(b.publicHolidays!);
    await db.settings.bulkAdd(b.settings!);
    // Queue removals of anything the backup doesn't contain, then every restored record.
    for (const [kind, rows] of existing) {
      const keep = new Set(incoming.find(([k]) => k === kind)![1].map((r) => r.id));
      for (const r of rows) if (!keep.has(r.id)) await queue(kind, r.id, 'delete', null);
    }
    for (const [kind, rows] of incoming) for (const r of rows) await queue(kind, r.id, 'put', r);
  });
  changeListener?.();
}

/** Shifts that repeat another shift's job, date and times. Keeps one (preferring one with notes). */
export async function findDuplicateShiftIds(): Promise<string[]> {
  const shifts = await db.shifts.toArray();
  shifts.sort((a, b) => Number(Boolean(b.notes)) - Number(Boolean(a.notes)) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const s of shifts) {
    const key = `${s.jobId}|${s.date}|${s.startTime}|${s.endTime}`;
    if (seen.has(key)) duplicates.push(s.id);
    else seen.add(key);
  }
  return duplicates;
}

export async function removeShifts(ids: string[]): Promise<void> {
  for (const id of ids) await shiftsRepo.remove(id);
}

export async function countShiftsForJob(jobId: string): Promise<number> {
  return db.shifts.where('jobId').equals(jobId).count();
}

/** Deletes a job and every shift logged under it. */
export async function deleteJobWithShifts(jobId: string): Promise<void> {
  const shifts = await db.shifts.where('jobId').equals(jobId).toArray();
  await removeShifts(shifts.map((s) => s.id));
  await jobsRepo.remove(jobId);
}
