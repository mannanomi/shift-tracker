import { db } from './db';
import type { AppSettings, Job, PublicHoliday, Shift } from '../types';
import { seedPublicHolidaysSA2026 } from '../seed/publicHolidays';

/**
 * Runs the read-then-write seeding check inside one readwrite transaction so concurrent
 * calls (e.g. React StrictMode double-invoking the mount effect in dev) can't both see
 * "empty" and both insert — IndexedDB serializes readwrite transactions on the same stores.
 */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.publicHolidays, db.settings, async () => {
    const [holidayCount, settings] = await Promise.all([
      db.publicHolidays.count(),
      db.settings.get('settings'),
    ]);

    if (holidayCount === 0) {
      await db.publicHolidays.bulkAdd(
        seedPublicHolidaysSA2026().map((h) => ({ ...h, id: crypto.randomUUID() })),
      );
    }

    if (!settings) {
      const defaultSettings: AppSettings = {
        id: 'settings',
        weekStartDay: 1,
        fortnightAnchorDate: new Date().toISOString().slice(0, 10),
      };
      await db.settings.put(defaultSettings);
    }
  });
}

export const jobsRepo = {
  all: () => db.jobs.toArray(),
  get: (id: string) => db.jobs.get(id),
  put: (job: Job) => db.jobs.put(job),
  remove: (id: string) => db.jobs.delete(id),
};

export const shiftsRepo = {
  all: () => db.shifts.toArray(),
  get: (id: string) => db.shifts.get(id),
  byJob: (jobId: string) => db.shifts.where('jobId').equals(jobId).toArray(),
  inDateRange: (startDate: string, endDate: string) =>
    db.shifts.where('date').between(startDate, endDate, true, true).toArray(),
  put: (shift: Shift) => db.shifts.put(shift),
  remove: (id: string) => db.shifts.delete(id),
};

export const publicHolidaysRepo = {
  all: () => db.publicHolidays.toArray(),
  put: (holiday: PublicHoliday) => db.publicHolidays.put(holiday),
  remove: (id: string) => db.publicHolidays.delete(id),
};

export const settingsRepo = {
  get: () => db.settings.get('settings'),
  put: (settings: AppSettings) => db.settings.put(settings),
};
