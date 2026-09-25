import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, Job, PublicHoliday, Shift } from '../types';

export type RecordKind = 'job' | 'shift' | 'holiday' | 'settings';

/** A local change waiting to be pushed to the cloud. */
export interface OutboxItem {
  key: string; // `${kind}:${id}`
  kind: RecordKind;
  id: string;
  op: 'put' | 'delete';
  data: unknown;
  ts: number;
}

class ShiftTrackerDB extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  shifts!: EntityTable<Shift, 'id'>;
  publicHolidays!: EntityTable<PublicHoliday, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  outbox!: EntityTable<OutboxItem, 'key'>;

  constructor() {
    super('shift-tracker');
    this.version(1).stores({
      jobs: 'id, archived, name',
      shifts: 'id, jobId, date, [jobId+date]',
      publicHolidays: 'id, date, state',
      settings: 'id',
    });
    this.version(2).stores({
      outbox: 'key',
    });
  }
}

export const db = new ShiftTrackerDB();
