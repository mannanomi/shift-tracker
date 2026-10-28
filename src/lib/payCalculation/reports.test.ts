import { describe, expect, it } from 'vitest';
import { createDefaultJob, type Shift } from '../../types';
import { buildRangeReport } from './reports';

function makeShift(overrides: Partial<Shift>): Shift {
  return {
    id: crypto.randomUUID(),
    jobId: 'job-1',
    date: '2026-09-14',
    startTime: '09:00',
    endTime: '17:00',
    unpaidBreakMinutes: 0,
    isPublicHolidayOverride: null,
    notes: '',
    ...overrides,
  };
}

describe('buildRangeReport', () => {
  it('combines multiple jobs into per-job subtotals and a combined total', () => {
    const jobA = createDefaultJob({ id: 'job-a', name: 'Cafe', morningRate: 25 });
    const jobB = createDefaultJob({ id: 'job-b', name: 'Warehouse', morningRate: 30 });
    const shifts = [
      makeShift({ jobId: 'job-a', date: '2026-09-14', startTime: '09:00', endTime: '13:00' }), // 4h @25 = 100
      makeShift({ jobId: 'job-b', date: '2026-09-15', startTime: '09:00', endTime: '14:00' }), // 5h @30 = 150
    ];
    const report = buildRangeReport('2026-09-14', '2026-09-20', [jobA, jobB], shifts, [], 1);

    expect(report.jobSubtotals).toHaveLength(2);
    const cafe = report.jobSubtotals.find((j) => j.jobId === 'job-a')!;
    const warehouse = report.jobSubtotals.find((j) => j.jobId === 'job-b')!;
    expect(cafe.grossPay).toBeCloseTo(100);
    expect(warehouse.grossPay).toBeCloseTo(150);
    expect(report.totalGrossPay).toBeCloseTo(250);
    expect(report.totalHours).toBeCloseTo(9);
  });

  it('reconciles weekly OT using the full calendar week even when the report range is a fortnight cutting mid-week', () => {
    const job = createDefaultJob({
      id: 'job-a',
      name: 'Cafe',
      morningRate: 20,
      overtimeThresholdHoursPerWeek: 15,
      overtimeTiers: [{ hoursInTier: Infinity, multiplier: 1.5 }],
    });
    // Week of 2026-09-14 (Mon-Sun): 10h Mon, 10h Tue -> 5h of Tue should be weekly OT.
    const shifts = [
      makeShift({ jobId: 'job-a', date: '2026-09-14', startTime: '08:00', endTime: '18:00' }),
      makeShift({ jobId: 'job-a', date: '2026-09-15', startTime: '08:00', endTime: '18:00' }),
    ];
    // Report range starts mid-week (Tuesday only) — the engine must still have looked at
    // Monday's hours to correctly reconcile Tuesday's weekly OT.
    const report = buildRangeReport('2026-09-15', '2026-09-15', [job], shifts, [], 1);
    expect(report.shiftLines).toHaveLength(1);
    expect(report.shiftLines[0].breakdown.weeklyOvertimeHours).toBeCloseTo(5);
  });

  it('splits taxable and non-taxable (cash-in-hand) income into separate totals', () => {
    const taxableJob = createDefaultJob({ id: 'job-a', name: 'Cafe', morningRate: 25, taxable: true });
    const cashJob = createDefaultJob({ id: 'job-b', name: 'Handyman', morningRate: 30, taxable: false });
    const shifts = [
      makeShift({ jobId: 'job-a', date: '2026-09-14', startTime: '09:00', endTime: '13:00' }), // 4h @25 = 100
      makeShift({ jobId: 'job-b', date: '2026-09-15', startTime: '09:00', endTime: '14:00' }), // 5h @30 = 150
    ];
    const report = buildRangeReport('2026-09-14', '2026-09-20', [taxableJob, cashJob], shifts, [], 1);

    expect(report.totalGrossPay).toBeCloseTo(250);
    expect(report.taxableGrossPay).toBeCloseTo(100);
    expect(report.nonTaxableGrossPay).toBeCloseTo(150);
    expect(report.jobSubtotals.find((j) => j.jobId === 'job-a')!.taxable).toBe(true);
    expect(report.jobSubtotals.find((j) => j.jobId === 'job-b')!.taxable).toBe(false);
  });

  it('excludes shifts outside the requested date range', () => {
    const job = createDefaultJob({ id: 'job-a', name: 'Cafe', morningRate: 20 });
    const shifts = [
      makeShift({ jobId: 'job-a', date: '2026-09-01', startTime: '09:00', endTime: '13:00' }),
      makeShift({ jobId: 'job-a', date: '2026-09-14', startTime: '09:00', endTime: '13:00' }),
    ];
    const report = buildRangeReport('2026-09-14', '2026-09-20', [job], shifts, [], 1);
    expect(report.shiftLines).toHaveLength(1);
    expect(report.shiftLines[0].shift.date).toBe('2026-09-14');
  });

  it('counts ABN day entries at the amount entered, kept apart from wages and cash', () => {
    const wages = createDefaultJob({ id: 'job-w', name: 'Care', morningRate: 30 });
    const cash = createDefaultJob({ id: 'job-c', name: 'Cafe', morningRate: 20, taxable: false });
    const uber = createDefaultJob({ id: 'job-u', name: 'Uber Eats', kind: 'abn' });
    const shifts = [
      makeShift({ jobId: 'job-w', date: '2026-09-14', startTime: '09:00', endTime: '13:00' }), // 4h @30 = 120
      makeShift({ jobId: 'job-c', date: '2026-09-15', startTime: '09:00', endTime: '11:00' }), // 2h @20 = 40
      makeShift({ jobId: 'job-u', date: '2026-09-19', startTime: '', endTime: '', earnings: 182.5, hoursWorked: 5 }),
      makeShift({ jobId: 'job-u', date: '2026-09-20', startTime: '', endTime: '', earnings: 95 }), // no hours recorded
    ];
    const report = buildRangeReport('2026-09-14', '2026-09-20', [wages, cash, uber], shifts, [], 1);

    expect(report.taxableGrossPay).toBeCloseTo(120);
    expect(report.nonTaxableGrossPay).toBeCloseTo(40);
    expect(report.abnGrossPay).toBeCloseTo(277.5);
    expect(report.totalGrossPay).toBeCloseTo(437.5);
    expect(report.totalHours).toBeCloseTo(11); // 4 + 2 + 5 (+0 for the entry without hours)
    expect(report.totalSuper).toBe(0);

    const uberSubtotal = report.jobSubtotals.find((j) => j.jobId === 'job-u')!;
    expect(uberSubtotal.category).toBe('abn');
    expect(uberSubtotal.shiftCount).toBe(2);
    const saturday = report.shiftLines.find((l) => l.shift.date === '2026-09-19')!;
    expect(saturday.breakdown.dayType).toBe('saturday');
    expect(saturday.breakdown.loadedHourlyRate).toBeCloseTo(36.5);
  });

});

describe('fortnightly overtime (e.g. a full-time guard on 76 hours)', () => {
  const ANCHOR = '2026-08-31'; // pay cycles start Mon 31 Aug, 14 Sep, 28 Sep…
  const guardJob = (overrides = {}) =>
    createDefaultJob({
      id: 'mss',
      name: 'MSS - Non Restraint',
      morningRate: 30,
      saturdayMultiplier: 1.5,
      sundayMultiplier: 2,
      includeSuper: true,
      superRatePercent: 12,
      overtimeThresholdHoursPerFortnight: 76,
      overtimeFromSundaysFirst: true,
      ...overrides,
    });
  // Fortnight Mon 28 Sep – Sun 11 Oct: 5 weekdays × 10h, Sat 6h, Sun 12h, Mon+Tue 10h each = 88h.
  const fortnightShifts = (jobFor: (date: string) => string = () => 'mss', lastEnd = '18:00') => [
    ...['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((date) =>
      makeShift({ jobId: jobFor(date), date, startTime: '08:00', endTime: '18:00' }),
    ),
    makeShift({ jobId: jobFor('2026-10-03'), date: '2026-10-03', startTime: '08:00', endTime: '14:00' }), // Saturday 6h
    makeShift({ jobId: jobFor('2026-10-04'), date: '2026-10-04', startTime: '06:00', endTime: '18:00' }), // Sunday 12h
    makeShift({ jobId: jobFor('2026-10-05'), date: '2026-10-05', startTime: '08:00', endTime: '18:00' }),
    makeShift({ jobId: jobFor('2026-10-06'), date: '2026-10-06', startTime: '08:00', endTime: lastEnd }),
  ];

  it('pays the hours over 76 as overtime taken from Sunday, at the normal Sunday rate and without super', () => {
    const report = buildRangeReport('2026-09-28', '2026-10-11', [guardJob()], fortnightShifts(), [], 1, ANCHOR);
    expect(report.totalHours).toBeCloseTo(88);

    const sunday = report.shiftLines.find((l) => l.shift.date === '2026-10-04')!.breakdown;
    expect(sunday.finalRegularHours).toBeCloseTo(0);
    expect(sunday.weeklyOvertimeSegments).toEqual([
      expect.objectContaining({ basis: 'sundayRate', dayType: 'sunday', hours: 12, multiplier: 1, rate: 60 }),
    ]);
    expect(sunday.finalGrossPay).toBeCloseTo(720); // same as an ordinary Sunday: 12h × $60
    expect(sunday.superAmount).toBe(0);

    // Everything else stays ordinary: 70 weekday hours at $30 + 6 Saturday hours at $45.
    const others = report.shiftLines.filter((l) => l.shift.date !== '2026-10-04');
    expect(others.every((l) => l.breakdown.weeklyOvertimeHours === 0)).toBe(true);
    expect(report.totalGrossPay).toBeCloseTo(2100 + 270 + 720);
    expect(report.totalSuper).toBeCloseTo(0.12 * (2100 + 270));
  });

  it('takes overtime beyond the Sunday hours from the last shift, at 1.5× then 2×', () => {
    // Tuesday runs to 8pm, so the fortnight is 90h: 14h over → 12h Sunday + 2h off the end of Tuesday.
    const report = buildRangeReport('2026-09-28', '2026-10-11', [guardJob()], fortnightShifts(undefined, '20:00'), [], 1, ANCHOR);
    const tuesday = report.shiftLines.find((l) => l.shift.date === '2026-10-06')!.breakdown;
    expect(tuesday.finalRegularHours).toBeCloseTo(10);
    expect(tuesday.weeklyOvertimeSegments).toEqual([
      expect.objectContaining({ basis: 'tier', tierIndex: 0, hours: 2, multiplier: 1.5, rate: 45 }),
    ]);
    expect(tuesday.weeklyOvertimePay).toBeCloseTo(90);
    expect(tuesday.superAmount).toBeCloseTo(0.12 * 300); // super on the 10 ordinary hours only
  });

  it('with "pay overtime at the Sunday rate", pays the hours beyond Sunday at the Sunday rate too', () => {
    const job = guardJob({ overtimeAtSundayRate: true });
    const report = buildRangeReport('2026-09-28', '2026-10-11', [job], fortnightShifts(undefined, '20:00'), [], 1, ANCHOR);
    const tuesday = report.shiftLines.find((l) => l.shift.date === '2026-10-06')!.breakdown;
    expect(tuesday.weeklyOvertimeSegments).toEqual([
      expect.objectContaining({ basis: 'sundayRate', dayType: 'weekday', hours: 2, multiplier: 2, rate: 60 }),
    ]);
    expect(tuesday.weeklyOvertimePay).toBeCloseTo(120);
    const sunday = report.shiftLines.find((l) => l.shift.date === '2026-10-04')!.breakdown;
    expect(sunday.weeklyOvertimePay).toBeCloseTo(720); // Sunday hours keep their normal Sunday pay
  });

  it('pays night hours that become overtime at the flat Sunday rate, without night loading', () => {
    const job = guardJob({ overtimeAtSundayRate: true, nightRate: 40, nightRateStartsAt: '18:00', nightRateEndsAt: '06:00' });
    // Tuesday runs 8am–8pm: its last 2 hours (6–8pm) are night hours and the 2 hours over the Sunday OT.
    const report = buildRangeReport('2026-09-28', '2026-10-11', [job], fortnightShifts(undefined, '20:00'), [], 1, ANCHOR);
    const tuesday = report.shiftLines.find((l) => l.shift.date === '2026-10-06')!.breakdown;
    expect(tuesday.weeklyOvertimeSegments).toEqual([expect.objectContaining({ rateLabel: 'night', hours: 2, rate: 60 })]); // not 40 × 2
  });

  it('lifts a Saturday overtime hour to the Sunday rate, but keeps a public holiday hour at its higher rate', () => {
    const job = guardJob({ overtimeAtSundayRate: true, overtimeFromSundaysFirst: false, publicHolidayMultiplier: 2.5 });
    // 76h on weekdays (7 × 10h + 6h), then 4h on Saturday 10 Oct as the last shift of the fortnight.
    const shifts = [
      ...['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'].map((date) =>
        makeShift({ jobId: 'mss', date, startTime: '08:00', endTime: '18:00' }),
      ),
      makeShift({ jobId: 'mss', date: '2026-10-07', startTime: '08:00', endTime: '14:00' }),
      makeShift({ jobId: 'mss', date: '2026-10-10', startTime: '08:00', endTime: '12:00' }), // Saturday, 4h over the limit
    ];
    const saturday = buildRangeReport('2026-09-28', '2026-10-11', [job], shifts, [], 1, ANCHOR)
      .shiftLines.find((l) => l.shift.date === '2026-10-10')!.breakdown;
    expect(saturday.weeklyOvertimeSegments).toEqual([expect.objectContaining({ dayType: 'saturday', hours: 4, rate: 60 })]);

    const holidays = [{ id: 'h', date: '2026-10-10', name: 'Test holiday', state: 'SA' }];
    const holiday = buildRangeReport('2026-09-28', '2026-10-11', [job], shifts, holidays, 1, ANCHOR)
      .shiftLines.find((l) => l.shift.date === '2026-10-10')!.breakdown;
    expect(holiday.weeklyOvertimeSegments).toEqual([expect.objectContaining({ dayType: 'publicHoliday', hours: 4, multiplier: 1, rate: 75 })]);
  });

  it('counts two jobs with the same employer towards one 76-hour limit', () => {
    const restraint = guardJob({ id: 'mss-r', name: 'MSS - Restraint' });
    const nonRestraint = guardJob({ id: 'mss-nr', name: 'MSS - Non Restraint' });
    // Alternate the shifts between the two jobs; Sunday is on Non Restraint.
    const shifts = fortnightShifts((date) => (['2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05'].includes(date) ? 'mss-r' : 'mss-nr'));
    const report = buildRangeReport('2026-09-28', '2026-10-11', [restraint, nonRestraint], shifts, [], 1, ANCHOR);
    const sunday = report.shiftLines.find((l) => l.shift.date === '2026-10-04')!;
    expect(sunday.job.id).toBe('mss-nr');
    expect(sunday.breakdown.weeklyOvertimeHours).toBeCloseTo(12);
    expect(report.shiftLines.filter((l) => l.breakdown.weeklyOvertimeHours > 0)).toHaveLength(1);
  });

  it('keeps a job with a different employer on its own limit', () => {
    const mss = guardJob({ id: 'mss' });
    const other = guardJob({ id: 'other', name: 'Coles - Night fill' });
    const shifts = fortnightShifts((date) => (date >= '2026-10-03' ? 'other' : 'mss'));
    const report = buildRangeReport('2026-09-28', '2026-10-11', [mss, other], shifts, [], 1, ANCHOR);
    // 50h for MSS and 38h for Coles: neither passes 76, so there's no overtime.
    expect(report.shiftLines.every((l) => l.breakdown.weeklyOvertimeHours === 0)).toBe(true);
  });
});


describe('MSS payslip rules: 75-hour fortnight, overtime by day, leave and allowances', () => {
  const ANCHOR = '2026-09-14';
  const restraint = () =>
    createDefaultJob({
      id: 'restraint',
      name: 'Restraint',
      employer: 'MSS',
      morningRate: 34.0761,
      nightRate: 41.4706,
      nightRateStartsAt: '18:00',
      nightRateEndsAt: '06:00',
      ignoreNightRateOnWeekendsAndHolidays: true,
      includeSuper: true,
      superRatePercent: 12,
      overtimeThresholdHoursPerFortnight: 75,
      overtimeByDay: true,
      overtimeWeekdayMultiplier: 1.5,
      overtimeWeekendMultiplier: 2,
    });
  const night = (date: string) => makeShift({ jobId: 'restraint', date, startTime: '18:00', endTime: '06:00' });
  const day = (date: string) => makeShift({ jobId: 'restraint', date, startTime: '06:00', endTime: '18:00' });

  it('matches the 12–25 Oct 2026 payslip except the 3 Thursday-night hours MSS paid at 2.0×', () => {
    const shifts = [
      night('2026-10-12'), night('2026-10-13'), night('2026-10-14'), night('2026-10-15'),
      day('2026-10-20'), day('2026-10-21'), night('2026-10-22'), night('2026-10-23'),
      makeShift({ jobId: 'restraint', date: '2026-10-25', entryType: 'allowance', startTime: '', endTime: '', earnings: 108.26 }),
    ];
    const report = buildRangeReport('2026-10-12', '2026-10-25', [restraint()], shifts, [], 1, ANCHOR);
    const ot = report.shiftLines.flatMap((l) => l.breakdown.weeklyOvertimeSegments);
    const otHoursAt = (m: number) => ot.filter((s) => s.dayMultiplier === m).reduce((sum, s) => sum + s.hours, 0);
    expect(otHoursAt(1.5)).toBeCloseTo(15); // Thu 9pm – Sat 12am
    expect(otHoursAt(2)).toBeCloseTo(6); // Sat 12am – 6am
    // Payslip: ordinary 2555.71 + night loading 377.12 + allowance 108.26 + OT 15 × 51.1142 + 6 × 68.1522.
    expect(report.totalGrossPay).toBeCloseTo(2555.71 + 377.12 + 108.26 + 15 * 51.1142 + 6 * 68.1522, 0);
    // Super on ordinary + night loading + allowance (payslip: 364.93).
    expect(report.totalSuper).toBeCloseTo(364.93, 0);
  });

  it('counts paid leave towards the 75 hours, never as overtime, and pays super on it', () => {
    const shifts = [
      makeShift({ jobId: 'restraint', date: '2026-10-12', entryType: 'leave', startTime: '', endTime: '', hoursWorked: 12 }),
      ...['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20'].map(day), // 72h worked
    ];
    const report = buildRangeReport('2026-10-12', '2026-10-25', [restraint()], shifts, [], 1, ANCHOR);
    const leave = report.shiftLines.find((l) => l.shift.entryType === 'leave')!;
    expect(leave.breakdown.finalGrossPay).toBeCloseTo(12 * 34.0761);
    expect(leave.breakdown.weeklyOvertimeHours).toBe(0);
    expect(leave.breakdown.superAmount).toBeCloseTo(12 * 34.0761 * 0.12);
    // 12 + 72 = 84h → 9h overtime off the end of Tuesday 20 Oct, at 1.5×.
    const last = report.shiftLines.find((l) => l.shift.date === '2026-10-20')!;
    expect(last.breakdown.weeklyOvertimeHours).toBeCloseTo(9);
    expect(last.breakdown.weeklyOvertimePay).toBeCloseTo(9 * 34.0761 * 1.5);
  });
});
