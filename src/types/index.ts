/** One tier of overtime pay, consumed in array order after the OT threshold is reached. */
export interface OvertimeTier {
  /** How many OT hours this tier covers before the next tier takes over. Use Infinity for the last tier. */
  hoursInTier: number;
  /** Multiplier applied to the shift's loaded hourly rate for hours in this tier. */
  multiplier: number;
}

export interface Job {
  id: string;
  name: string;
  /** Hex color used for badges/calendar chips. */
  color: string;
  archived: boolean;

  morningRate: number;
  /**
   * The night hourly rate actually used by pay calculations. When nightRateMode is 'auto'
   * this is kept in sync with morningRate * (1 + nightLoadingPercent / 100) by the job form;
   * when 'custom' it's a flat rate the user typed in directly.
   */
  nightRate: number;
  /** 'auto' derives nightRate from morningRate + nightLoadingPercent; 'custom' is a flat $/hr. */
  nightRateMode: 'auto' | 'custom';
  /** % on top of morningRate used to derive nightRate when nightRateMode is 'auto'. */
  nightLoadingPercent: number;
  /** "HH:mm" — a shift starting at or after this time uses nightRate, otherwise morningRate. */
  nightRateStartsAt: string;
  /**
   * "HH:mm", or null. When set, defines a night-rate *window* [nightRateStartsAt,
   * nightRateEndsAt) that wraps past midnight (e.g. 18:00 to 06:00) — a single shift that
   * runs past nightRateEndsAt is split, with hours after that point paid at morningRate
   * instead. When null (the default), night rate is decided once from the shift's start
   * time and applies to the whole shift, as before.
   */
  nightRateEndsAt: string | null;
  /**
   * When true, Saturday/Sunday/public holiday shifts always use morningRate as their base —
   * the night-rate window is ignored entirely on those days, so only the weekend/PH
   * multiplier applies, never a separate night dollar amount. Weekday shifts are unaffected.
   */
  ignoreNightRateOnWeekendsAndHolidays: boolean;

  saturdayMultiplier: number;
  sundayMultiplier: number;
  publicHolidayMultiplier: number;

  overtimeThresholdHoursPerDay: number | null;
  overtimeThresholdHoursPerWeek: number | null;
  overtimeTiers: OvertimeTier[];

  casualLoadingPercent: number;

  includeSuper: boolean;
  superRatePercent: number;

  /** false for cash-in-hand jobs: still counted in total income, but excluded from the tax estimate. */
  taxable: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface PublicHoliday {
  id: string;
  /** ISO date, "yyyy-MM-dd". */
  date: string;
  name: string;
  state: string;
}

export interface Shift {
  id: string;
  jobId: string;
  /** ISO date, "yyyy-MM-dd" — the calendar date the shift starts on. */
  date: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" — if <= startTime, the shift is treated as crossing midnight into the next day. */
  endTime: string;
  unpaidBreakMinutes: number;
  /** null = auto-detect from the PublicHoliday list; true/false forces the flag. */
  isPublicHolidayOverride: boolean | null;
  notes: string;
}

export interface AppSettings {
  id: 'settings';
  /** 0 = Sunday, 1 = Monday. */
  weekStartDay: 0 | 1;
  /** Any ISO date that falls on the first day of a fortnight, used to align the fortnight cycle. */
  fortnightAnchorDate: string;
  /** Include HECS/HELP compulsory repayments in after-tax estimates. */
  hasHelpDebt?: boolean;
  /** Spending/savings targets that each fortnight's take-home pay is measured against. */
  goals?: Goal[];
  /** What employers actually paid, for comparing against calculated pay. */
  payslips?: Payslip[];
}

export interface Goal {
  id: string;
  name: string;
  /** Amount needed per fortnight. */
  amount: number;
}

export interface Payslip {
  id: string;
  jobId: string;
  periodStart: string;
  periodEnd: string;
  /** Gross amount the employer paid for this job over the period. */
  amountPaid: number;
}

/**
 * Backfills defaults for fields added after a job was first saved (nightRateMode,
 * nightLoadingPercent, taxable, …) so older records read correctly without a DB migration.
 * `taxable` defaults to true — only a job explicitly saved with the cash-in-hand checkbox
 * ticked should ever be excluded from the tax estimate.
 */
export function normalizeJob(job: Job): Job {
  return {
    ...job,
    nightRateMode: job.nightRateMode ?? 'custom',
    nightLoadingPercent: job.nightLoadingPercent ?? 21,
    taxable: job.taxable ?? true,
    nightRateEndsAt: job.nightRateEndsAt ?? null,
    ignoreNightRateOnWeekendsAndHolidays: job.ignoreNightRateOnWeekendsAndHolidays ?? false,
  };
}

export function createDefaultJob(overrides: Partial<Job> = {}): Job {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: '',
    color: '#3b82f6',
    archived: false,
    morningRate: 0,
    nightRate: 0,
    nightRateMode: 'auto',
    nightLoadingPercent: 21,
    nightRateStartsAt: '14:00',
    nightRateEndsAt: null,
    ignoreNightRateOnWeekendsAndHolidays: false,
    saturdayMultiplier: 1.5,
    sundayMultiplier: 2,
    publicHolidayMultiplier: 1,
    overtimeThresholdHoursPerDay: null,
    overtimeThresholdHoursPerWeek: null,
    overtimeTiers: [{ hoursInTier: 2, multiplier: 1.5 }, { hoursInTier: Infinity, multiplier: 2 }],
    casualLoadingPercent: 0,
    includeSuper: false,
    superRatePercent: 12,
    taxable: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
