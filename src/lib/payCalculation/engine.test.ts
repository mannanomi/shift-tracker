import { describe, expect, it } from 'vitest';
import { createDefaultJob, type PublicHoliday, type Shift } from '../../types';
import { computeShiftDaily, computeWeekPay, workedHoursFor } from './engine';

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: crypto.randomUUID(),
    jobId: 'job-1',
    date: '2026-09-14', // a Monday
    startTime: '09:00',
    endTime: '17:00',
    unpaidBreakMinutes: 0,
    isPublicHolidayOverride: null,
    notes: '',
    ...overrides,
  };
}

describe('workedHoursFor', () => {
  it('subtracts unpaid break from the raw duration', () => {
    const shift = makeShift({ startTime: '09:00', endTime: '17:00', unpaidBreakMinutes: 30 });
    expect(workedHoursFor(shift)).toBeCloseTo(7.5);
  });

  it('treats an end time <= start time as crossing midnight', () => {
    const shift = makeShift({ startTime: '22:00', endTime: '06:00', unpaidBreakMinutes: 0 });
    expect(workedHoursFor(shift)).toBeCloseTo(8);
  });
});

describe('computeShiftDaily', () => {
  it('uses morningRate for shifts starting before nightRateStartsAt', () => {
    const job = createDefaultJob({ morningRate: 25, nightRate: 30, nightRateStartsAt: '14:00' });
    const shift = makeShift({ startTime: '09:00', endTime: '13:00' });
    const result = computeShiftDaily(shift, job, []);
    expect(result.rateLabel).toBe('morning');
    expect(result.baseRate).toBe(25);
  });

  it('uses nightRate for shifts starting at or after nightRateStartsAt', () => {
    const job = createDefaultJob({ morningRate: 25, nightRate: 30, nightRateStartsAt: '14:00' });
    const shift = makeShift({ startTime: '14:00', endTime: '20:00' });
    const result = computeShiftDaily(shift, job, []);
    expect(result.rateLabel).toBe('night');
    expect(result.baseRate).toBe(30);
  });

  it('matches the confirmed worked example: Saturday, casual loading, weekend + OT stacking', () => {
    // 8am-6pm Saturday, 30min break -> 9.5h worked. Morning rate $25, casual loading 25%,
    // Saturday multiplier 1.5x, daily OT threshold 8h, tiers [2h@1.5x, inf@2x].
    const job = createDefaultJob({
      morningRate: 25,
      nightRate: 30,
      nightRateStartsAt: '14:00',
      casualLoadingPercent: 25,
      saturdayMultiplier: 1.5,
      overtimeThresholdHoursPerDay: 8,
      overtimeTiers: [
        { hoursInTier: 2, multiplier: 1.5 },
        { hoursInTier: Infinity, multiplier: 2 },
      ],
    });
    // 2026-09-19 is a Saturday.
    const shift = makeShift({ date: '2026-09-19', startTime: '08:00', endTime: '18:00', unpaidBreakMinutes: 30 });
    const result = computeShiftDaily(shift, job, []);

    expect(result.workedHours).toBeCloseTo(9.5);
    expect(result.casualLoadedRate).toBeCloseTo(31.25);
    expect(result.dayType).toBe('saturday');
    expect(result.loadedHourlyRate).toBeCloseTo(46.875);
    expect(result.regularHours).toBeCloseTo(8);
    expect(result.regularPay).toBeCloseTo(375);
    expect(result.overtimeSegments).toHaveLength(1);
    expect(result.overtimeSegments[0].hours).toBeCloseTo(1.5);
    expect(result.overtimeSegments[0].multiplier).toBe(1.5);
    expect(result.overtimePay).toBeCloseTo(105.46875);
    expect(result.grossPay).toBeCloseTo(480.46875);
  });

  it('applies public holiday multiplier with highest priority, overriding weekend', () => {
    const job = createDefaultJob({ morningRate: 20, sundayMultiplier: 1.75, publicHolidayMultiplier: 2.5 });
    // 2026-09-20 is a Sunday; force it as a public holiday via override.
    const shift = makeShift({ date: '2026-09-20', startTime: '09:00', endTime: '13:00', isPublicHolidayOverride: true });
    const result = computeShiftDaily(shift, job, []);
    expect(result.dayType).toBe('publicHoliday');
    expect(result.dayMultiplier).toBe(2.5);
  });

  it('auto-detects public holidays from the provided list', () => {
    const job = createDefaultJob({ morningRate: 20, publicHolidayMultiplier: 2.5 });
    const holidays: PublicHoliday[] = [{ id: 'ph-1', date: '2026-01-26', name: 'Australia Day', state: 'SA' }];
    const shift = makeShift({ date: '2026-01-26', startTime: '09:00', endTime: '13:00' });
    const result = computeShiftDaily(shift, job, holidays);
    expect(result.dayType).toBe('publicHoliday');
  });

  it('override false forces a date OFF the public holiday list', () => {
    const job = createDefaultJob({ morningRate: 20, publicHolidayMultiplier: 2.5 });
    const holidays: PublicHoliday[] = [{ id: 'ph-1', date: '2026-01-26', name: 'Australia Day', state: 'SA' }];
    const shift = makeShift({ date: '2026-01-26', startTime: '09:00', endTime: '13:00', isPublicHolidayOverride: false });
    const result = computeShiftDaily(shift, job, holidays);
    expect(result.dayType).not.toBe('publicHoliday');
  });

  it('splits overtime across two tiers', () => {
    const job = createDefaultJob({
      morningRate: 20,
      overtimeThresholdHoursPerDay: 8,
      overtimeTiers: [
        { hoursInTier: 2, multiplier: 1.5 },
        { hoursInTier: Infinity, multiplier: 2 },
      ],
    });
    // 12 worked hours: 8 regular, 2 at tier1 (1.5x), 2 at tier2 (2x).
    const shift = makeShift({ startTime: '06:00', endTime: '18:00' });
    const result = computeShiftDaily(shift, job, []);
    expect(result.regularHours).toBeCloseTo(8);
    expect(result.overtimeSegments).toHaveLength(2);
    expect(result.overtimeSegments[0]).toMatchObject({ hours: 2, multiplier: 1.5 });
    expect(result.overtimeSegments[1]).toMatchObject({ hours: 2, multiplier: 2 });
    expect(result.overtimePay).toBeCloseTo(2 * 20 * 1.5 + 2 * 20 * 2);
  });

  it('computes super as an addition on top of gross pay, not a deduction', () => {
    const job = createDefaultJob({ morningRate: 40, includeSuper: true, superRatePercent: 12 });
    const shift = makeShift({ startTime: '09:00', endTime: '13:00' }); // 4h
    const result = computeShiftDaily(shift, job, []);
    expect(result.grossPay).toBeCloseTo(160);
    // super isn't part of ShiftDailyBreakdown (it needs the reconciled weekly gross);
    // computeWeekPay is where it's actually surfaced — checked separately below.
  });
});

describe('computeShiftDaily — night-rate window (nightRateEndsAt)', () => {
  it('leaves a shift entirely inside the window as a single night segment, even at the exact boundary', () => {
    const job = createDefaultJob({ morningRate: 20, nightRate: 30, nightRateStartsAt: '18:00', nightRateEndsAt: '06:00' });
    // 22:00 -> 06:00 next day: ends exactly when the window closes, so it should NOT split.
    const shift = makeShift({ startTime: '22:00', endTime: '06:00' });
    const result = computeShiftDaily(shift, job, []);
    expect(result.regularSegments).toHaveLength(1);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'night', hours: 8 });
  });

  it('leaves a shift entirely outside the window as a single day segment', () => {
    const job = createDefaultJob({ morningRate: 20, nightRate: 30, nightRateStartsAt: '18:00', nightRateEndsAt: '06:00' });
    const shift = makeShift({ startTime: '09:00', endTime: '17:00' });
    const result = computeShiftDaily(shift, job, []);
    expect(result.regularSegments).toHaveLength(1);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'morning', hours: 8 });
  });

  it('splits a shift that runs past nightRateEndsAt into night + day portions', () => {
    // The exact scenario requested: night rate 6pm-6am, day rate resumes from 6am.
    const job = createDefaultJob({ morningRate: 20, nightRate: 30, nightRateStartsAt: '18:00', nightRateEndsAt: '06:00' });
    const shift = makeShift({ startTime: '22:00', endTime: '08:00' }); // 10h: 8h night + 2h day
    const result = computeShiftDaily(shift, job, []);
    expect(result.workedHours).toBeCloseTo(10);
    expect(result.regularSegments).toHaveLength(2);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'night', hours: 8, rate: 30 });
    expect(result.regularSegments[1].rateLabel).toBe('morning');
    expect(result.regularSegments[1].hours).toBeCloseTo(2);
    expect(result.regularSegments[1].rate).toBeCloseTo(20);
    expect(result.regularPay).toBeCloseTo(8 * 30 + 2 * 20);
    expect(result.grossPay).toBeCloseTo(280);
  });

  it('takes daily OT from the end of the shift, correctly split across the night/day boundary', () => {
    const job = createDefaultJob({
      morningRate: 20,
      nightRate: 30,
      nightRateStartsAt: '18:00',
      nightRateEndsAt: '06:00',
      overtimeThresholdHoursPerDay: 8,
      overtimeTiers: [{ hoursInTier: Infinity, multiplier: 1.5 }],
    });
    // 20:00 -> 08:00 = 12h: raw split is 10h night (20:00-06:00) + 2h day (06:00-08:00).
    // 8h threshold -> 4h OT taken from the end -> last 2h night (04:00-06:00) + 2h day (06:00-08:00).
    const shift = makeShift({ startTime: '20:00', endTime: '08:00' });
    const result = computeShiftDaily(shift, job, []);

    expect(result.regularSegments).toHaveLength(1);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'night', hours: 8 });
    expect(result.regularPay).toBeCloseTo(8 * 30);

    expect(result.overtimeSegments).toHaveLength(2);
    const [otNight, otDay] = result.overtimeSegments;
    expect(otNight).toMatchObject({ rateLabel: 'night', hours: 2, multiplier: 1.5, rate: 45 });
    expect(otDay).toMatchObject({ rateLabel: 'morning', hours: 2, multiplier: 1.5, rate: 30 });
    expect(result.overtimePay).toBeCloseTo(2 * 45 + 2 * 30);
    expect(result.grossPay).toBeCloseTo(240 + 90 + 60);
  });

  it('nightRateEndsAt=null preserves the original whole-shift behavior (no split)', () => {
    const job = createDefaultJob({ morningRate: 20, nightRate: 30, nightRateStartsAt: '18:00', nightRateEndsAt: null });
    const shift = makeShift({ startTime: '22:00', endTime: '08:00' }); // would split if a window were configured
    const result = computeShiftDaily(shift, job, []);
    expect(result.regularSegments).toHaveLength(1);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'night', hours: 10 });
  });
});

describe('computeShiftDaily — ignoreNightRateOnWeekendsAndHolidays', () => {
  it('by default (flag off), night rate and weekend multiplier stack on a Saturday night shift', () => {
    const job = createDefaultJob({ morningRate: 20, nightRate: 30, nightRateStartsAt: '18:00', nightRateEndsAt: '06:00', saturdayMultiplier: 1.5 });
    const shift = makeShift({ date: '2026-09-19', startTime: '22:00', endTime: '06:00' }); // Saturday, 8h
    const result = computeShiftDaily(shift, job, []);
    expect(result.regularSegments).toHaveLength(1);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'night', hours: 8, rate: 45 }); // 30 * 1.5
    expect(result.regularPay).toBeCloseTo(360);
  });

  it('with the flag on, a Saturday night shift uses the day rate instead, only the weekend multiplier applies', () => {
    const job = createDefaultJob({
      morningRate: 20,
      nightRate: 30,
      nightRateStartsAt: '18:00',
      nightRateEndsAt: '06:00',
      saturdayMultiplier: 1.5,
      ignoreNightRateOnWeekendsAndHolidays: true,
    });
    const shift = makeShift({ date: '2026-09-19', startTime: '22:00', endTime: '06:00' }); // Saturday, 8h
    const result = computeShiftDaily(shift, job, []);
    expect(result.regularSegments).toHaveLength(1);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'morning', hours: 8, rate: 30 }); // 20 * 1.5
    expect(result.regularPay).toBeCloseTo(240);
    expect(result.rateLabel).toBe('morning');
    expect(result.baseRate).toBe(20);
  });

  it('with the flag on, a weekday night shift is unaffected — still uses the night rate', () => {
    const job = createDefaultJob({
      morningRate: 20,
      nightRate: 30,
      nightRateStartsAt: '18:00',
      nightRateEndsAt: '06:00',
      ignoreNightRateOnWeekendsAndHolidays: true,
    });
    const shift = makeShift({ date: '2026-09-14', startTime: '22:00', endTime: '06:00' }); // Monday, 8h
    const result = computeShiftDaily(shift, job, []);
    expect(result.regularSegments).toHaveLength(1);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'night', hours: 8, rate: 30 });
  });

  it('with the flag on, a public holiday night shift also uses the day rate', () => {
    const job = createDefaultJob({
      morningRate: 20,
      nightRate: 30,
      nightRateStartsAt: '18:00',
      nightRateEndsAt: '06:00',
      publicHolidayMultiplier: 2.5,
      ignoreNightRateOnWeekendsAndHolidays: true,
    });
    const shift = makeShift({ date: '2026-09-14', startTime: '22:00', endTime: '06:00', isPublicHolidayOverride: true });
    const result = computeShiftDaily(shift, job, []);
    expect(result.regularSegments).toHaveLength(1);
    expect(result.regularSegments[0]).toMatchObject({ rateLabel: 'morning', hours: 8, rate: 50 }); // 20 * 2.5
  });
});

describe('computeWeekPay — weekly overtime reconciliation', () => {
  it('leaves shifts alone when weekly threshold is not configured', () => {
    const job = createDefaultJob({ morningRate: 20 });
    const shifts = [
      makeShift({ date: '2026-09-14', startTime: '09:00', endTime: '17:00' }), // Mon, 8h
      makeShift({ date: '2026-09-15', startTime: '09:00', endTime: '17:00' }), // Tue, 8h
    ];
    const result = computeWeekPay(shifts, job, []);
    expect(result.shiftBreakdowns.every((s) => s.weeklyOvertimeHours === 0)).toBe(true);
    expect(result.totalHours).toBeCloseTo(16);
  });

  it('escalates hours beyond the weekly threshold on the later shift, in chronological order', () => {
    const job = createDefaultJob({
      morningRate: 20,
      overtimeThresholdHoursPerWeek: 30,
      overtimeTiers: [{ hoursInTier: Infinity, multiplier: 1.5 }],
    });
    // Three 10h shifts (30h total) then a 4th 10h shift entered out of order in the array
    // to confirm sorting-by-date drives the reconciliation, not array order.
    const shifts = [
      makeShift({ id: 's4', date: '2026-09-17', startTime: '08:00', endTime: '18:00' }), // Thu
      makeShift({ id: 's1', date: '2026-09-14', startTime: '08:00', endTime: '18:00' }), // Mon
      makeShift({ id: 's2', date: '2026-09-15', startTime: '08:00', endTime: '18:00' }), // Tue
      makeShift({ id: 's3', date: '2026-09-16', startTime: '08:00', endTime: '18:00' }), // Wed
    ];
    const result = computeWeekPay(shifts, job, []);
    const byId = Object.fromEntries(result.shiftBreakdowns.map((s) => [s.shiftId, s]));

    // First three shifts (Mon-Wed) total exactly 30h -> no weekly OT yet.
    expect(byId.s1.weeklyOvertimeHours).toBe(0);
    expect(byId.s2.weeklyOvertimeHours).toBe(0);
    expect(byId.s3.weeklyOvertimeHours).toBe(0);
    // Thursday's entire 10h is beyond the 30h threshold -> all weekly OT at 1.5x.
    expect(byId.s4.weeklyOvertimeHours).toBeCloseTo(10);
    expect(byId.s4.finalRegularHours).toBeCloseTo(0);
    expect(byId.s4.weeklyOvertimePay).toBeCloseTo(10 * 20 * 1.5);
    expect(byId.s4.finalGrossPay).toBeCloseTo(10 * 20 * 1.5);
  });

  it('splits a single shift that straddles the weekly threshold', () => {
    const job = createDefaultJob({
      morningRate: 20,
      overtimeThresholdHoursPerWeek: 20,
      overtimeTiers: [{ hoursInTier: Infinity, multiplier: 2 }],
    });
    const shifts = [
      makeShift({ id: 's1', date: '2026-09-14', startTime: '08:00', endTime: '18:00' }), // Mon, 10h
      makeShift({ id: 's2', date: '2026-09-15', startTime: '08:00', endTime: '18:00' }), // Tue, 10h -> crosses 20h threshold at hour 20
      makeShift({ id: 's3', date: '2026-09-16', startTime: '08:00', endTime: '13:00' }), // Wed, 5h -> entirely beyond threshold
    ];
    const result = computeWeekPay(shifts, job, []);
    const byId = Object.fromEntries(result.shiftBreakdowns.map((s) => [s.shiftId, s]));

    expect(byId.s1.weeklyOvertimeHours).toBe(0);
    expect(byId.s2.weeklyOvertimeHours).toBe(0); // running total hits exactly 20, not beyond
    expect(byId.s3.weeklyOvertimeHours).toBeCloseTo(5);
    expect(byId.s3.finalGrossPay).toBeCloseTo(5 * 20 * 2);
  });

  it('does not double-count hours already escalated by the daily threshold', () => {
    const job = createDefaultJob({
      morningRate: 20,
      overtimeThresholdHoursPerDay: 8,
      overtimeThresholdHoursPerWeek: 16,
      overtimeTiers: [{ hoursInTier: Infinity, multiplier: 1.5 }],
    });
    // Two 10h shifts: each has 2h daily-OT, so only 8+8=16 "regular" hours count toward
    // the weekly threshold across the week -> weekly threshold of 16 is exactly met, no
    // further escalation.
    const shifts = [
      makeShift({ id: 's1', date: '2026-09-14', startTime: '08:00', endTime: '18:00' }),
      makeShift({ id: 's2', date: '2026-09-15', startTime: '08:00', endTime: '18:00' }),
    ];
    const result = computeWeekPay(shifts, job, []);
    const byId = Object.fromEntries(result.shiftBreakdowns.map((s) => [s.shiftId, s]));
    expect(byId.s1.weeklyOvertimeHours).toBe(0);
    expect(byId.s2.weeklyOvertimeHours).toBe(0);
    expect(byId.s1.overtimePay).toBeCloseTo(2 * 20 * 1.5); // daily OT still applies
    expect(byId.s2.overtimePay).toBeCloseTo(2 * 20 * 1.5);
  });

  it('calculates super as an addition on the final reconciled gross pay', () => {
    const job = createDefaultJob({ morningRate: 40, includeSuper: true, superRatePercent: 12 });
    const shifts = [makeShift({ date: '2026-09-14', startTime: '09:00', endTime: '13:00' })]; // 4h -> $160
    const result = computeWeekPay(shifts, job, []);
    expect(result.shiftBreakdowns[0].finalGrossPay).toBeCloseTo(160);
    expect(result.shiftBreakdowns[0].superAmount).toBeCloseTo(19.2);
    expect(result.totalGrossPay).toBeCloseTo(160);
    expect(result.totalSuper).toBeCloseTo(19.2);
  });

  it('escalates weekly OT from the end of a mixed night/day shift, tagging it with the correct rate', () => {
    const job = createDefaultJob({
      morningRate: 20,
      nightRate: 30,
      nightRateStartsAt: '18:00',
      nightRateEndsAt: '06:00',
      overtimeThresholdHoursPerWeek: 8,
      overtimeTiers: [{ hoursInTier: Infinity, multiplier: 1.5 }],
    });
    // Single 10h shift: 8h night (22:00-06:00) + 2h day (06:00-08:00). Weekly threshold of 8h
    // means the trailing 2h (the day portion) becomes weekly OT, not the night portion.
    const shifts = [makeShift({ startTime: '22:00', endTime: '08:00' })];
    const result = computeWeekPay(shifts, job, []);
    const breakdown = result.shiftBreakdowns[0];

    expect(breakdown.finalRegularSegments).toHaveLength(1);
    expect(breakdown.finalRegularSegments[0]).toMatchObject({ rateLabel: 'night', hours: 8 });
    expect(breakdown.finalRegularPay).toBeCloseTo(8 * 30);

    expect(breakdown.weeklyOvertimeSegments).toHaveLength(1);
    expect(breakdown.weeklyOvertimeSegments[0]).toMatchObject({ rateLabel: 'morning', hours: 2, multiplier: 1.5, rate: 30 });
    expect(breakdown.weeklyOvertimePay).toBeCloseTo(2 * 20 * 1.5);
    expect(breakdown.finalGrossPay).toBeCloseTo(240 + 60);
  });
});
