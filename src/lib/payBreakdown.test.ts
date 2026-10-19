import { describe, expect, it } from 'vitest';
import { createDefaultJob, type Shift } from '../types';
import { buildRangeReport } from './payCalculation/reports';
import { buildPayBreakdown } from './payBreakdown';

function shift(jobId: string, date: string, startTime: string, endTime: string, extra: Partial<Shift> = {}): Shift {
  return { id: `${jobId}-${date}`, jobId, date, startTime, endTime, unpaidBreakMinutes: 0, isPublicHolidayOverride: null, notes: '', ...extra };
}

const guard = (id: string, name: string) =>
  createDefaultJob({
    id,
    name,
    morningRate: 30,
    nightRate: 36,
    nightRateStartsAt: '18:00',
    nightRateEndsAt: '06:00',
    saturdayMultiplier: 1.5,
    sundayMultiplier: 2,
    includeSuper: true,
    superRatePercent: 12,
    overtimeThresholdHoursPerFortnight: 76,
    overtimeFromSundaysFirst: true,
    overtimeAtSundayRate: true,
  });

// Fortnight Mon 28 Sep – Sun 11 Oct: 60h day + 10h night (weekdays), 6h Saturday, 12h Sunday = 88h.
function fortnight(jobFor: (date: string) => string) {
  return [
    ...['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'].map((d) => shift(jobFor(d), d, '08:00', '18:00')),
    shift(jobFor('2026-09-29'), '2026-09-29', '18:00', '04:00'),
    shift(jobFor('2026-10-03'), '2026-10-03', '08:00', '14:00'),
    shift(jobFor('2026-10-04'), '2026-10-04', '06:00', '18:00'),
  ];
}

describe('buildPayBreakdown', () => {
  it('splits a period into base rate, night loading, Saturday and overtime lines', () => {
    const report = buildRangeReport('2026-09-28', '2026-10-11', [guard('mss', 'MSS - Non Restraint')], fortnight(() => 'mss'), [], 1, '2026-08-31');
    const { sections, shifts } = buildPayBreakdown(report);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('MSS');
    expect(sections[0].rows.map((r) => [r.label, r.hours, r.rate, r.amount])).toEqual([
      ['Base rate', 60, 30, 1800],
      ['Night loading', 10, 36, 360],
      ['Saturday', 6, 45, 270],
      ['Overtime – Sunday rate', 12, 60, 720],
    ]);
    expect(sections[0].totalHours).toBeCloseTo(88);
    expect(sections[0].totalPay).toBeCloseTo(3150);
    expect(sections[0].superAmount).toBeCloseTo(0.12 * 2430);
    expect(shifts).toHaveLength(9);
    expect(shifts.find((s) => s.date === '2026-10-04')).toMatchObject({ overtime: true, amount: 720 });
  });

  it('combines an employer’s jobs in one section, naming each job on its lines', () => {
    const jobs = [guard('mss-r', 'MSS - Restraint'), guard('mss-nr', 'MSS - Non Restraint')];
    const report = buildRangeReport('2026-09-28', '2026-10-11', jobs, fortnight((d) => (d === '2026-10-03' ? 'mss-r' : 'mss-nr')), [], 1, '2026-08-31');
    const [section] = buildPayBreakdown(report).sections;
    expect(section.title).toBe('MSS');
    expect(section.rows.map((r) => r.label)).toContain('Saturday · Restraint');
    expect(section.rows.map((r) => r.label)).toContain('Base rate · Non Restraint');
  });
});
