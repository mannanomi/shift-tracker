import type { Job } from '../types';
import type { RangeReport, ShiftLine } from './payCalculation/reports';
import type { DayType, OvertimeSegment, RateLabel } from './payCalculation/types';
import { employerOf, roleName } from './employer';

/** One payslip-style line: a kind of hours, at one rate. */
export interface BreakdownRow {
  label: string;
  hours: number;
  rate: number;
  amount: number;
  overtime: boolean;
}

/** One employer's pay for the period (an employer's jobs are combined, like on its payslip). */
export interface BreakdownSection {
  title: string;
  /** "Cash income", "ABN income", or the jobs combined in this section. */
  subtitle: string | null;
  kind: 'hourly' | 'abn';
  /** Hourly jobs: hours by type and rate. */
  rows: BreakdownRow[];
  /** ABN jobs: each day's entry. */
  entries: { date: string; hours: number; amount: number }[];
  totalHours: number;
  totalPay: number;
  superAmount: number;
  superRatePercent: number | null;
}

export interface PayBreakdown {
  sections: BreakdownSection[];
  /** Every shift in the period, oldest first. */
  shifts: { date: string; job: string; time: string; hours: number; amount: number; overtime: boolean }[];
}

const DAY_LABEL: Record<DayType, string> = {
  weekday: 'Weekday',
  saturday: 'Saturday',
  sunday: 'Sunday',
  publicHoliday: 'Public holiday',
};
const DAY_ORDER: DayType[] = ['weekday', 'saturday', 'sunday', 'publicHoliday'];

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '');
}

function ordinaryLabel(dayType: DayType, rateLabel: RateLabel): string {
  if (dayType === 'weekday') return rateLabel === 'night' ? 'Night loading' : 'Base rate';
  return rateLabel === 'night' ? `${DAY_LABEL[dayType]} – night` : DAY_LABEL[dayType];
}

function overtimeLabel(seg: OvertimeSegment, daily: boolean): string {
  if (seg.basis === 'sundayRate') return 'Overtime – Sunday rate';
  return `${daily ? 'Daily overtime' : 'Overtime'} ×${trimNumber(seg.multiplier)}`;
}

/** Sort ordinary rows weekday → public holiday, day before night, then overtime. */
function sortKey(row: { overtime: boolean; dayType: DayType; rateLabel: RateLabel; label: string }): string {
  return `${row.overtime ? 1 : 0}${DAY_ORDER.indexOf(row.dayType)}${row.rateLabel === 'night' ? 1 : 0}${row.label}`;
}

/**
 * Turns a period's shifts into payslip-style sections: per employer, hours grouped by kind
 * (base rate, night loading, Saturday, Sunday, public holiday, overtime) and rate.
 */
export function buildPayBreakdown(report: RangeReport): PayBreakdown {
  const groups = new Map<string, ShiftLine[]>();
  for (const line of report.shiftLines) {
    const employer = employerOf(line.job);
    const key = `${line.job.kind}|${employer ? `e:${employer.toLowerCase()}` : `j:${line.job.id}`}|${line.job.taxable}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  const sections: BreakdownSection[] = [];
  for (const lines of groups.values()) {
    const jobs = [...new Map(lines.map((l) => [l.job.id, l.job])).values()];
    const first: Job = jobs[0];
    const employer = employerOf(first);
    const title = employer ?? first.name;
    const totalHours = lines.reduce((sum, l) => sum + l.breakdown.workedHours, 0);
    const totalPay = lines.reduce((sum, l) => sum + l.breakdown.finalGrossPay, 0);
    const superAmount = lines.reduce((sum, l) => sum + l.breakdown.superAmount, 0);
    const superJob = jobs.find((j) => j.includeSuper);

    if (first.kind === 'abn') {
      sections.push({
        title,
        subtitle: 'ABN income',
        kind: 'abn',
        rows: [],
        entries: lines.map((l) => ({ date: l.shift.date, hours: l.breakdown.workedHours, amount: l.breakdown.finalGrossPay })),
        totalHours,
        totalPay,
        superAmount: 0,
        superRatePercent: null,
      });
      continue;
    }

    const rows = new Map<string, BreakdownRow & { dayType: DayType; rateLabel: RateLabel }>();
    const add = (job: Job, label: string, dayType: DayType, rateLabel: RateLabel, hours: number, rate: number, amount: number, overtime: boolean) => {
      if (hours <= 1e-9) return;
      const fullLabel = jobs.length > 1 ? `${label} · ${roleName(job.name, employer)}` : label;
      const key = `${fullLabel}|${rate.toFixed(4)}`;
      const row = rows.get(key) ?? { label: fullLabel, hours: 0, rate, amount: 0, overtime, dayType, rateLabel };
      row.hours += hours;
      row.amount += amount;
      rows.set(key, row);
    };
    for (const { job, breakdown } of lines) {
      for (const seg of breakdown.finalRegularSegments) {
        add(job, ordinaryLabel(seg.dayType, seg.rateLabel), seg.dayType, seg.rateLabel, seg.hours, seg.rate, seg.pay, false);
      }
      for (const seg of breakdown.overtimeSegments) {
        add(job, overtimeLabel(seg, true), seg.dayType, seg.rateLabel, seg.hours, seg.rate, seg.pay, true);
      }
      for (const seg of breakdown.weeklyOvertimeSegments) {
        add(job, overtimeLabel(seg, false), seg.dayType, seg.rateLabel, seg.hours, seg.rate, seg.pay, true);
      }
    }

    sections.push({
      title,
      subtitle: first.taxable ? (jobs.length > 1 ? jobs.map((j) => roleName(j.name, employer)).join(' + ') : null) : 'Cash income',
      kind: 'hourly',
      rows: [...rows.values()]
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
        .map(({ label, hours, rate, amount, overtime }) => ({ label, hours, rate, amount, overtime })),
      entries: [],
      totalHours,
      totalPay,
      superAmount,
      superRatePercent: superJob ? superJob.superRatePercent : null,
    });
  }
  // Wages first, then cash, then ABN — like reading your payslips before your other income.
  const order = (s: BreakdownSection) => (s.kind === 'abn' ? 2 : s.subtitle === 'Cash income' ? 1 : 0);
  sections.sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));

  const shifts = [...report.shiftLines]
    .sort((a, b) => a.shift.date.localeCompare(b.shift.date) || a.shift.startTime.localeCompare(b.shift.startTime))
    .map(({ shift, job, breakdown }) => ({
      date: shift.date,
      job: job.name,
      time: job.kind === 'abn' ? 'Daily earnings' : `${shift.startTime}–${shift.endTime}`,
      hours: breakdown.workedHours,
      amount: breakdown.finalGrossPay,
      overtime: breakdown.weeklyOvertimeHours > 0 || breakdown.overtimeSegments.length > 0,
    }));

  return { sections, shifts };
}
