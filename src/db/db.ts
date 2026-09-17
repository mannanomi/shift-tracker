import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, Job, PublicHoliday, Shift } from '../types';

class ShiftTrackerDB extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  shifts!: EntityTable<Shift, 'id'>;
  publicHolidays!: EntityTable<PublicHoliday, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor() {
    super('shift-tracker');
    this.version(1).stores({
      jobs: 'id, archived, name',
      shifts: 'id, jobId, date, [jobId+date]',
      publicHolidays: 'id, date, state',
      settings: 'id',
    });
  }
}

export const db = new ShiftTrackerDB();
