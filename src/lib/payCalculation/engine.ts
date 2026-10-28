import { addDays, startOfDay } from 'date-fns';
import { entryTypeOf, type Job, type PublicHoliday, type Shift } from '../../types';
import { combineDateAndTimeInAdelaide, formatDateOnly, isSaturday, isSunday, resolveShiftTimes } from '../dateUtils';
import type {
  DayType,
  OvertimeSegment,
  RateLabel,
  RegularSegment,
  ShiftDailyBreakdown,
  ShiftWeeklyBreakdown,
  WeekPayResult,
} from './types';

/** Day type of a calendar date; `override` (a shift's public holiday setting) wins over the list when set. */
function dayTypeForDate(dateStr: string, publicHolidays: PublicHoliday[], override: boolean | null): DayType {
  const holiday = override ?? publicHolidays.some((ph) => ph.date === dateStr);
  if (holiday) return 'publicHoliday';
  if (isSunday(dateStr)) return 'sunday';
  if (isSaturday(dateStr)) return 'saturday';
  return 'weekday';
}

/** The day type of the date a shift starts on (its public holiday override applies to this day only). */
export function determineDayType(shift: Shift, publicHolidays: PublicHoliday[]): DayType {
  return dayTypeForDate(shift.date, publicHolidays, shift.isPublicHolidayOverride);
}

function dayMultiplierFor(job: Job, dayType: DayType): number {
  switch (dayType) {
    case 'publicHoliday':
      return job.publicHolidayMultiplier;
    case 'sunday':
      return job.sundayMultiplier;
    case 'saturday':
      return job.saturdayMultiplier;
    default:
      return 1;
  }
}

export function workedHoursFor(shift: Shift): number {
  if (entryTypeOf(shift) === 'leave') return Math.max(0, shift.hoursWorked ?? 0);
  if (entryTypeOf(shift) === 'allowance') return 0;
  const { start, end } = resolveShiftTimes(shift.date, shift.startTime, shift.endTime);
  const minutes = (end.getTime() - start.getTime()) / 60000 - shift.unpaidBreakMinutes;
  return Math.max(0, minutes / 60);
}

/** An interval of the shift's timeline tagged with which base rate and day type apply. */
interface RawTimeSegment {
  start: Date;
  end: Date;
  rateLabel: RateLabel;
  dayType: DayType;
}

/**
 * Splits a shift's [start, end) into segments tagged 'night' or 'morning'. When the job has no
 * nightRateEndsAt, the whole shift gets one label decided by start time alone (legacy
 * behavior). When it does, night rate is a recurring daily window [nightRateStartsAt,
 * nightRateEndsAt) that wraps past midnight — a shift running past the window's end reverts
 * to morningRate for the remainder, even mid-shift.
 */
function nightWindowSegments(shift: Shift, job: Job, start: Date, end: Date): { start: Date; end: Date; rateLabel: RateLabel }[] {
  if (job.nightRateEndsAt == null) {
    const rateLabel: RateLabel = shift.startTime >= job.nightRateStartsAt ? 'night' : 'morning';
    return [{ start, end, rateLabel }];
  }

  // Candidate night-window instances for every day the shift could touch, one day early to
  // catch a window that started the day before the shift and is still running.
  const nightIntervals: { start: Date; end: Date }[] = [];
  for (let d = addDays(startOfDay(start), -1); d <= startOfDay(end); d = addDays(d, 1)) {
    const dateStr = formatDateOnly(d);
    const windowStart = combineDateAndTimeInAdelaide(dateStr, job.nightRateStartsAt);
    let windowEnd = combineDateAndTimeInAdelaide(dateStr, job.nightRateEndsAt);
    if (windowEnd <= windowStart) windowEnd = addDays(windowEnd, 1);
    nightIntervals.push({ start: windowStart, end: windowEnd });
  }

  const boundaryTimes = new Set<number>([start.getTime(), end.getTime()]);
  for (const iv of nightIntervals) {
    if (iv.start > start && iv.start < end) boundaryTimes.add(iv.start.getTime());
    if (iv.end > start && iv.end < end) boundaryTimes.add(iv.end.getTime());
  }
  const points = [...boundaryTimes].sort((a, b) => a - b);

  const segments: { start: Date; end: Date; rateLabel: RateLabel }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const midpoint = new Date((points[i] + points[i + 1]) / 2);
    const isNight = nightIntervals.some((iv) => midpoint >= iv.start && midpoint < iv.end);
    segments.push({ start: new Date(points[i]), end: new Date(points[i + 1]), rateLabel: isNight ? 'night' : 'morning' });
  }
  return segments;
}

/**
 * Splits a shift into segments that each have one base rate (night/day, see
 * nightWindowSegments) and one day type. With job.splitAtMidnight, hours after midnight take
 * the day type of the date they fall on — a Friday night shift becomes Saturday at 12am, a
 * Sunday night shift goes back to a weekday at 12am — otherwise the whole shift takes its start
 * day's type. Then, for a job with ignoreNightRateOnWeekendsAndHolidays, any part falling on a
 * Saturday, Sunday or public holiday uses the day rate, so only that day's multiplier applies.
 */
function computeRawTimeSegments(shift: Shift, job: Job, publicHolidays: PublicHoliday[]): RawTimeSegment[] {
  const { start, end } = resolveShiftTimes(shift.date, shift.startTime, shift.endTime);
  const startDayType = determineDayType(shift, publicHolidays);
  const splitAtMidnight = job.splitAtMidnight !== false;

  const pieces: RawTimeSegment[] = [];
  for (const seg of nightWindowSegments(shift, job, start, end)) {
    let cursor = seg.start;
    while (cursor < seg.end) {
      const nextMidnight = startOfDay(addDays(cursor, 1));
      const pieceEnd = splitAtMidnight && nextMidnight < seg.end ? nextMidnight : seg.end;
      const dateStr = formatDateOnly(cursor);
      const dayType = !splitAtMidnight || dateStr === shift.date ? startDayType : dayTypeForDate(dateStr, publicHolidays, null);
      const rateLabel = job.ignoreNightRateOnWeekendsAndHolidays && dayType !== 'weekday' ? 'morning' : seg.rateLabel;
      pieces.push({ start: cursor, end: pieceEnd, rateLabel, dayType });
      cursor = pieceEnd;
    }
  }

  // Merge adjacent pieces that ended up with the same rate and day type.
  const merged: RawTimeSegment[] = [];
  for (const piece of pieces) {
    const prev = merged[merged.length - 1];
    if (prev && prev.rateLabel === piece.rateLabel && prev.dayType === piece.dayType && prev.end.getTime() === piece.start.getTime()) {
      prev.end = piece.end;
    } else {
      merged.push({ ...piece });
    }
  }
  return merged;
}

interface HourSegment {
  rateLabel: RateLabel;
  dayType: DayType;
  hours: number;
  /** Loaded $/hr for this segment (casual-loaded, day-multiplied) — before any OT tier multiplier. */
  rate: number;
  /** Paid leave: counts towards a period's ordinary hours but is never turned into overtime. */
  leave?: boolean;
}

/** Converts raw time segments into hour segments, removing the shift's unpaid break proportionally across them. */
function toHourSegments(
  rawSegments: RawTimeSegment[],
  unpaidBreakMinutes: number,
  rateFor: (label: RateLabel, dayType: DayType) => number,
): HourSegment[] {
  const totalRawMinutes = rawSegments.reduce((sum, seg) => sum + (seg.end.getTime() - seg.start.getTime()) / 60000, 0);
  if (totalRawMinutes <= 0) return [];
  return rawSegments.map((seg) => {
    const rawMinutes = (seg.end.getTime() - seg.start.getTime()) / 60000;
    const breakShare = unpaidBreakMinutes * (rawMinutes / totalRawMinutes);
    const netHours = Math.max(0, (rawMinutes - breakShare) / 60);
    return { rateLabel: seg.rateLabel, dayType: seg.dayType, hours: netHours, rate: rateFor(seg.rateLabel, seg.dayType) };
  });
}

/** Removes `hoursToTake` from the end of a chronological segment list, splitting a segment if needed. */
function takeFromEnd(segments: HourSegment[], hoursToTake: number): { remaining: HourSegment[]; taken: HourSegment[] } {
  const remaining: HourSegment[] = [];
  const takenRev: HourSegment[] = [];
  let toTake = hoursToTake;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (toTake <= 1e-9) {
      remaining.unshift(seg);
      continue;
    }
    if (seg.hours <= toTake + 1e-9) {
      takenRev.push(seg);
      toTake -= seg.hours;
    } else {
      remaining.unshift({ ...seg, hours: seg.hours - toTake });
      takenRev.push({ ...seg, hours: toTake });
      toTake = 0;
    }
  }
  return { remaining, taken: takenRev.reverse() };
}

/** Removes `hoursToTake` from the start of a chronological segment list, splitting a segment if needed. */
function takeFromStart(segments: HourSegment[], hoursToTake: number): { taken: HourSegment[]; remaining: HourSegment[] } {
  const taken: HourSegment[] = [];
  const remaining: HourSegment[] = [];
  let toTake = hoursToTake;
  for (const seg of segments) {
    if (toTake <= 1e-9) {
      remaining.push(seg);
      continue;
    }
    if (seg.hours <= toTake + 1e-9) {
      taken.push(seg);
      toTake -= seg.hours;
    } else {
      taken.push({ ...seg, hours: toTake });
      remaining.push({ ...seg, hours: seg.hours - toTake });
      toTake = 0;
    }
  }
  return { taken, remaining };
}

/**
 * Splits a chronological run of OT-eligible hour segments across `tiers` in order, starting
 * tier consumption from `alreadyConsumedHours` (so weekly-OT can continue where earlier
 * shifts in the week left off). Each segment's own loaded rate is multiplied by the tier's
 * multiplier, so a tier that straddles a night/day boundary correctly produces two priced
 * segments instead of one.
 */
function splitSegmentsIntoTiers(tailSegments: HourSegment[], tiers: Job['overtimeTiers'], alreadyConsumedHours: number): OvertimeSegment[] {
  const result: OvertimeSegment[] = [];
  let remaining = tailSegments;
  let consumed = alreadyConsumedHours;

  for (let tierIndex = 0; tierIndex < tiers.length && remaining.some((s) => s.hours > 1e-9); tierIndex++) {
    const tier = tiers[tierIndex];
    const capacityLeft = Math.max(0, tier.hoursInTier - consumed);
    if (capacityLeft <= 1e-9) {
      consumed -= tier.hoursInTier;
      continue;
    }
    const { taken, remaining: rest } = takeFromStart(remaining, capacityLeft);
    for (const seg of taken) {
      if (seg.hours <= 1e-9) continue;
      const rate = seg.rate * tier.multiplier;
      result.push({
        basis: 'tier',
        tierIndex,
        rateLabel: seg.rateLabel,
        dayType: seg.dayType,
        hours: seg.hours,
        multiplier: tier.multiplier,
        rate,
        pay: seg.hours * rate,
      });
    }
    remaining = rest;
    consumed = 0;
  }

  return result;
}

function toRegularSegments(segments: HourSegment[]): RegularSegment[] {
  return segments
    .filter((s) => s.hours > 1e-9)
    .map((s) => ({
      rateLabel: s.rateLabel,
      dayType: s.dayType,
      hours: s.hours,
      rate: s.rate,
      pay: s.hours * s.rate,
      ...(s.leave ? { leave: true } : {}),
    }));
}

/**
 * A leave or allowance entry: leave is its hours at the day rate (casual-loaded, no day
 * multiplier or night loading); an allowance is a dollar amount with no hours.
 */
function computeEntryDaily(shift: Shift, job: Job, publicHolidays: PublicHoliday[]): ShiftDailyBreakdown {
  const dayType = determineDayType(shift, publicHolidays);
  const casualLoadedRate = job.morningRate * (1 + job.casualLoadingPercent / 100);
  const isLeave = entryTypeOf(shift) === 'leave';
  const hours = isLeave ? Math.max(0, shift.hoursWorked ?? 0) : 0;
  const regularSegments = toRegularSegments(
    isLeave ? [{ rateLabel: 'morning', dayType: 'weekday', hours, rate: casualLoadedRate, leave: true }] : [],
  );
  const regularPay = regularSegments.reduce((sum, seg) => sum + seg.pay, 0);
  const allowancePay = isLeave ? 0 : Math.max(0, shift.earnings ?? 0);
  return {
    shiftId: shift.id,
    workedHours: hours,
    rateLabel: 'morning',
    baseRate: job.morningRate,
    casualLoadedRate,
    dayType,
    dayTypes: [dayType],
    dayMultiplier: 1,
    loadedHourlyRate: casualLoadedRate,
    regularHours: hours,
    regularSegments,
    overtimeSegments: [],
    regularPay,
    overtimePay: 0,
    allowancePay,
    grossPay: regularPay + allowancePay,
  };
}

/** Calculates a shift's pay in isolation, using only its own day's overtime threshold. */
export function computeShiftDaily(
  shift: Shift,
  job: Job,
  publicHolidays: PublicHoliday[],
): ShiftDailyBreakdown {
  if (entryTypeOf(shift) !== 'shift') return computeEntryDaily(shift, job, publicHolidays);
  const dayType = determineDayType(shift, publicHolidays);
  const dayMultiplier = dayMultiplierFor(job, dayType);

  const rateFor = (label: RateLabel, segmentDayType: DayType): number => {
    const base = label === 'night' ? job.nightRate : job.morningRate;
    return base * (1 + job.casualLoadingPercent / 100) * dayMultiplierFor(job, segmentDayType);
  };

  const rawSegments = computeRawTimeSegments(shift, job, publicHolidays);
  const hourSegments = toHourSegments(rawSegments, shift.unpaidBreakMinutes, rateFor);
  const dayTypes = [...new Set(hourSegments.filter((s) => s.hours > 1e-9).map((s) => s.dayType))];
  const workedHours = hourSegments.reduce((sum, s) => sum + s.hours, 0);

  const dailyThreshold = job.overtimeThresholdHoursPerDay;
  let regularCandidates = hourSegments;
  let otTail: HourSegment[] = [];
  if (dailyThreshold != null) {
    const otHours = Math.max(0, workedHours - dailyThreshold);
    const split = takeFromEnd(hourSegments, otHours);
    regularCandidates = split.remaining;
    otTail = split.taken;
  }

  const regularSegments = toRegularSegments(regularCandidates);
  const overtimeSegments = splitSegmentsIntoTiers(otTail, job.overtimeTiers, 0);

  const regularHours = regularSegments.reduce((sum, s) => sum + s.hours, 0);
  const regularPay = regularSegments.reduce((sum, s) => sum + s.pay, 0);
  const overtimePay = overtimeSegments.reduce((sum, s) => sum + s.pay, 0);

  // Legacy singular fields describe the rate at the shift's start — a display fallback for
  // when the shift isn't split; see regularSegments/overtimeSegments for the accurate totals.
  const rateLabel: RateLabel =
    job.ignoreNightRateOnWeekendsAndHolidays && dayType !== 'weekday'
      ? 'morning'
      : shift.startTime >= job.nightRateStartsAt
        ? 'night'
        : 'morning';
  const baseRate = rateLabel === 'night' ? job.nightRate : job.morningRate;
  const casualLoadedRate = baseRate * (1 + job.casualLoadingPercent / 100);
  const loadedHourlyRate = casualLoadedRate * dayMultiplier;

  return {
    shiftId: shift.id,
    workedHours,
    rateLabel,
    baseRate,
    casualLoadedRate,
    dayType,
    dayTypes: dayTypes.length > 0 ? dayTypes : [dayType],
    dayMultiplier,
    loadedHourlyRate,
    regularHours,
    regularSegments,
    overtimeSegments,
    regularPay,
    overtimePay,
    allowancePay: 0,
    grossPay: regularPay + overtimePay,
  };
}

/** Orders shifts by date then start time (leave and allowances, which have no time, first on their day). */
export function compareShiftsChronologically(a: Shift, b: Shift): number {
  return a.date === b.date ? (a.startTime ?? '').localeCompare(b.startTime ?? '') : a.date.localeCompare(b.date);
}

/** A weekly or fortnightly limit on ordinary hours, after which hours become overtime. */
export interface PeriodOvertimeRule {
  thresholdHours: number;
  tiers: Job['overtimeTiers'];
  /** Take overtime from Sunday hours first, paid at their normal Sunday rate. */
  sundayFirst: boolean;
  /** Pay all overtime at the Sunday rate instead of the tiers. */
  atSundayRate: boolean;
  /** Pay overtime at the day rate × a weekday or weekend multiplier (takes precedence over atSundayRate and the tiers). */
  byDay: { weekday: number; weekend: number } | null;
}

/** The period overtime rule set on a job for the given limit. */
export function periodOvertimeRule(job: Job, thresholdHours: number): PeriodOvertimeRule {
  return {
    thresholdHours,
    tiers: job.overtimeTiers,
    sundayFirst: job.overtimeFromSundaysFirst,
    atSundayRate: job.overtimeAtSundayRate,
    byDay: job.overtimeByDay ? { weekday: job.overtimeWeekdayMultiplier, weekend: job.overtimeWeekendMultiplier } : null,
  };
}

/**
 * One overtime slice at the Sunday rate: the job's day rate (with casual loading) × its Sunday
 * multiplier — a flat rate, so night hours don't carry night loading into overtime. A public
 * holiday hour keeps its own pay if that is higher.
 */
function sundayRateOvertime(seg: HourSegment, job: Job, hours: number): OvertimeSegment {
  const sundayRate = job.morningRate * (1 + job.casualLoadingPercent / 100) * job.sundayMultiplier;
  const rate = seg.dayType === 'publicHoliday' ? Math.max(sundayRate, seg.rate) : sundayRate;
  const multiplier = seg.rate > 0 ? rate / seg.rate : 1;
  return { basis: 'sundayRate', tierIndex: 0, rateLabel: seg.rateLabel, dayType: seg.dayType, hours, multiplier, rate, pay: hours * rate };
}

/**
 * One overtime slice priced by the day it falls on: the day rate (with casual loading, no night
 * loading) × the weekday multiplier Monday–Friday or the weekend multiplier on Saturday/Sunday. A
 * public holiday hour keeps its own pay if that is higher.
 */
function dayRateOvertime(seg: HourSegment, job: Job, hours: number, byDay: { weekday: number; weekend: number }): OvertimeSegment {
  const dayMultiplier = seg.dayType === 'saturday' || seg.dayType === 'sunday' || seg.dayType === 'publicHoliday' ? byDay.weekend : byDay.weekday;
  const dayRate = job.morningRate * (1 + job.casualLoadingPercent / 100) * dayMultiplier;
  const rate = seg.dayType === 'publicHoliday' ? Math.max(dayRate, seg.rate) : dayRate;
  const multiplier = seg.rate > 0 ? rate / seg.rate : 1;
  return { basis: 'dayRate', dayMultiplier, tierIndex: 0, rateLabel: seg.rateLabel, dayType: seg.dayType, hours, multiplier, rate, pay: hours * rate };
}

/** One shift in an overtime period, with its own job and its already-calculated daily pay. */
export interface PeriodShift {
  job: Job;
  daily: ShiftDailyBreakdown;
}

/**
 * Applies a period's overtime limit across its shifts (given in chronological order; they may
 * belong to several jobs paid by the same employer). Once total ordinary hours (excluding daily
 * OT) pass the limit, the excess becomes overtime: with sundayFirst, Sunday hours go first
 * (latest Sunday first) at the flat Sunday rate; anything beyond that comes off the end of the
 * period and is paid at the flat Sunday rate (atSundayRate) or through the overtime tiers in
 * chronological order, on top of the rate those hours actually fall under. Super is paid on
 * ordinary pay only, never overtime.
 */
export function reconcilePeriodOvertime(items: PeriodShift[], rule: PeriodOvertimeRule | null): ShiftWeeklyBreakdown[] {
  const regular: HourSegment[][] = items.map(({ daily }) =>
    daily.regularSegments.map((s) => ({ rateLabel: s.rateLabel, dayType: s.dayType, hours: s.hours, rate: s.rate, leave: s.leave })),
  );
  const periodOvertime: OvertimeSegment[][] = items.map(() => []);
  const totalRegularHours = items.reduce((sum, { daily }) => sum + daily.regularHours, 0);
  let remaining = rule ? Math.max(0, totalRegularHours - rule.thresholdHours) : 0;

  if (rule?.sundayFirst) {
    for (let i = items.length - 1; i >= 0 && remaining > 1e-9; i--) {
      for (let j = regular[i].length - 1; j >= 0 && remaining > 1e-9; j--) {
        const seg = regular[i][j];
        if (seg.dayType !== 'sunday' || seg.leave || seg.hours <= 1e-9) continue;
        const take = Math.min(seg.hours, remaining);
        regular[i][j] = { ...seg, hours: seg.hours - take };
        remaining -= take;
        periodOvertime[i].unshift(sundayRateOvertime(seg, items[i].job, take));
      }
    }
  }

  if (rule && remaining > 1e-9) {
    const taken: HourSegment[][] = items.map(() => []);
    for (let i = items.length - 1; i >= 0 && remaining > 1e-9; i--) {
      // Paid leave counts towards the limit but is never itself overtime.
      const worked = regular[i].filter((seg) => seg.hours > 1e-9 && !seg.leave);
      const available = worked.reduce((sum, seg) => sum + seg.hours, 0);
      const takeHere = Math.min(available, remaining);
      if (takeHere <= 1e-9) continue;
      const split = takeFromEnd(worked, takeHere);
      regular[i] = [...regular[i].filter((seg) => seg.leave), ...split.remaining];
      taken[i] = split.taken;
      remaining -= takeHere;
    }
    let tierHoursConsumed = 0;
    for (let i = 0; i < items.length; i++) {
      if (taken[i].length === 0) continue;
      const { byDay } = rule;
      if (byDay) {
        periodOvertime[i].push(...taken[i].filter((seg) => seg.hours > 1e-9).map((seg) => dayRateOvertime(seg, items[i].job, seg.hours, byDay)));
        continue;
      }
      if (rule.atSundayRate) {
        periodOvertime[i].push(...taken[i].filter((seg) => seg.hours > 1e-9).map((seg) => sundayRateOvertime(seg, items[i].job, seg.hours)));
        continue;
      }
      periodOvertime[i].push(...splitSegmentsIntoTiers(taken[i], rule.tiers, tierHoursConsumed));
      tierHoursConsumed += taken[i].reduce((sum, seg) => sum + seg.hours, 0);
    }
  }

  return items.map(({ job, daily }, i) => {
    const finalRegularSegments = toRegularSegments(regular[i]);
    const weeklyOvertimeSegments = periodOvertime[i];
    const finalRegularHours = finalRegularSegments.reduce((sum, s) => sum + s.hours, 0);
    const finalRegularPay = finalRegularSegments.reduce((sum, s) => sum + s.pay, 0);
    const weeklyOvertimeHours = weeklyOvertimeSegments.reduce((sum, seg) => sum + seg.hours, 0);
    const weeklyOvertimePay = weeklyOvertimeSegments.reduce((sum, seg) => sum + seg.pay, 0);
    const finalGrossPay = finalRegularPay + daily.overtimePay + weeklyOvertimePay + daily.allowancePay;
    // Super is on ordinary time earnings (including leave and allowances) — overtime isn't, so it's left out.
    const superAmount = job.includeSuper ? (finalRegularPay + daily.allowancePay) * (job.superRatePercent / 100) : 0;

    return {
      ...daily,
      weeklyOvertimeSegments,
      weeklyOvertimeHours,
      weeklyOvertimePay,
      finalRegularHours,
      finalRegularSegments,
      finalRegularPay,
      finalGrossPay,
      superAmount,
    };
  });
}

/**
 * Calculates pay for every shift a job worked in one week, applying the job's weekly overtime
 * limit (see reconcilePeriodOvertime). Jobs on a fortnightly limit are reconciled per
 * fortnight by the report builder instead.
 */
export function computeWeekPay(
  shiftsInWeek: Shift[],
  job: Job,
  publicHolidays: PublicHoliday[],
): WeekPayResult {
  const sorted = [...shiftsInWeek].sort(compareShiftsChronologically);
  const items = sorted.map((shift) => ({ job, daily: computeShiftDaily(shift, job, publicHolidays) }));
  const rule = job.overtimeThresholdHoursPerWeek != null ? periodOvertimeRule(job, job.overtimeThresholdHoursPerWeek) : null;
  const shiftBreakdowns = reconcilePeriodOvertime(items, rule);

  return {
    shiftBreakdowns,
    totalGrossPay: shiftBreakdowns.reduce((sum, s) => sum + s.finalGrossPay, 0),
    totalSuper: shiftBreakdowns.reduce((sum, s) => sum + s.superAmount, 0),
    totalHours: shiftBreakdowns.reduce((sum, s) => sum + s.workedHours, 0),
  };
}
