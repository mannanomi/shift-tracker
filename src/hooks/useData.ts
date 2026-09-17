import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { normalizeJob, type AppSettings } from '../types';

export function useJobs() {
  return useLiveQuery(() => db.jobs.toArray().then((jobs) => jobs.map(normalizeJob)), [], []);
}

export function useActiveJobs() {
  return useLiveQuery(
    () =>
      db.jobs
        .filter((j) => !j.archived)
        .toArray()
        .then((jobs) => jobs.map(normalizeJob)),
    [],
    [],
  );
}

export function useJob(id: string | undefined) {
  return useLiveQuery(
    () => (id ? db.jobs.get(id).then((job) => (job ? normalizeJob(job) : undefined)) : undefined),
    [id],
  );
}

export function useShifts() {
  return useLiveQuery(() => db.shifts.toArray(), [], []);
}

export function useShiftsInRange(startDate: string, endDate: string) {
  return useLiveQuery(
    () => db.shifts.where('date').between(startDate, endDate, true, true).toArray(),
    [startDate, endDate],
    [],
  );
}

export function usePublicHolidays() {
  return useLiveQuery(() => db.publicHolidays.toArray(), [], []);
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => db.settings.get('settings'), [], undefined);
}
