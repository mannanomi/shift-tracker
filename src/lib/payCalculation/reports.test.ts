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
