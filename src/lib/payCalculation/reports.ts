import type { Job, PublicHoliday, Shift } from '../../types';
import { startOfWeekStr } from '../dateUtils';
import { computeWeekPay } from './engine';
import type { ShiftWeeklyBreakdown } from './types';

export interface ShiftLine {
  shift: Shift;
  job: Job;
  breakdown: ShiftWeeklyBreakdown;
}

export interface JobSubtotal {
  jobId: string;
  jobName: string;
  color: string;
  grossPay: number;
  superAmount: number;
  hours: number;
  shiftCount: number;
  /** false for cash-in-hand jobs excluded from the tax estimate. */
  taxable: boolean;
}

export interface RangeReport {
  startDate: string;
  endDate: string;
  shiftLines: ShiftLine[];
  jobSubtotals: JobSubtotal[];
  /** Every job combined, taxable or not — the real total money earned this period. */
  totalGrossPay: number;
  /** Only jobs marked taxable — this is what the tax estimate should be based on. */
  taxableGrossPay: number;
  /** Only jobs marked non-taxable (cash-in-hand) — earned but not fed into the tax estimate. */
  nonTaxableGrossPay: number;
  totalSuper: number;
  totalHours: number;
}

/**
 * Computes every shift's reconciled pay breakdown, grouping shifts into full calendar weeks
 * (per weekStartDay) per job before running weekly-OT reconciliation — so a report range that
 * doesn't align to week boundaries (e.g. most fortnights) still reconciles OT correctly.
 */
function computeAllShiftLines(
  jobs: Job[],
  shifts: Shift[],
  publicHolidays: PublicHoliday[],
  weekStartDay: 0 | 1,
): ShiftLine[] {
  const jobsById = new Map(jobs.map((j) => [j.id, j]));
  const lines: ShiftLine[] = [];

  for (const job of jobs) {
    const jobShifts = shifts.filter((s) => s.jobId === job.id);
    const byWeek = new Map<string, Shift[]>();
    for (const shift of jobShifts) {
      const weekKey = startOfWeekStr(shift.date, weekStartDay);
      const group = byWeek.get(weekKey) ?? [];
      group.push(shift);
      byWeek.set(weekKey, group);
    }

    for (const weekShifts of byWeek.values()) {
      const { shiftBreakdowns } = computeWeekPay(weekShifts, job, publicHolidays);
      for (const breakdown of shiftBreakdowns) {
        const shift = weekShifts.find((s) => s.id === breakdown.shiftId)!;
        const owningJob = jobsById.get(shift.jobId)!;
        lines.push({ shift, job: owningJob, breakdown });
      }
    }
  }

  return lines;
}

export function buildRangeReport(
  startDate: string,
  endDate: string,
  jobs: Job[],
  shifts: Shift[],
  publicHolidays: PublicHoliday[],
  weekStartDay: 0 | 1,
): RangeReport {
  const allLines = computeAllShiftLines(jobs, shifts, publicHolidays, weekStartDay);
  const shiftLines = allLines.filter((line) => line.shift.date >= startDate && line.shift.date <= endDate);

  const subtotalsByJob = new Map<string, JobSubtotal>();
  for (const line of shiftLines) {
    const existing = subtotalsByJob.get(line.job.id) ?? {
      jobId: line.job.id,
      jobName: line.job.name,
      color: line.job.color,
      grossPay: 0,
      superAmount: 0,
      hours: 0,
      shiftCount: 0,
      taxable: line.job.taxable,
    };
    existing.grossPay += line.breakdown.finalGrossPay;
    existing.superAmount += line.breakdown.superAmount;
    existing.hours += line.breakdown.workedHours;
    existing.shiftCount += 1;
    subtotalsByJob.set(line.job.id, existing);
  }

  const jobSubtotals = [...subtotalsByJob.values()].sort((a, b) => a.jobName.localeCompare(b.jobName));

  return {
    startDate,
    endDate,
    shiftLines: shiftLines.sort((a, b) => a.shift.date.localeCompare(b.shift.date)),
    jobSubtotals,
    totalGrossPay: jobSubtotals.reduce((sum, j) => sum + j.grossPay, 0),
    taxableGrossPay: jobSubtotals.filter((j) => j.taxable).reduce((sum, j) => sum + j.grossPay, 0),
    nonTaxableGrossPay: jobSubtotals.filter((j) => !j.taxable).reduce((sum, j) => sum + j.grossPay, 0),
    totalSuper: jobSubtotals.reduce((sum, j) => sum + j.superAmount, 0),
    totalHours: jobSubtotals.reduce((sum, j) => sum + j.hours, 0),
  };
}
