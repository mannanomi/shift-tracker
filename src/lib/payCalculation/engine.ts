import { addDays, startOfDay } from 'date-fns';
import type { Job, PublicHoliday, Shift } from '../../types';
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

function isPublicHoliday(shift: Shift, publicHolidays: PublicHoliday[]): boolean {
  if (shift.isPublicHolidayOverride !== null) return shift.isPublicHolidayOverride;
  return publicHolidays.some((ph) => ph.date === shift.date);
}

function determineDayType(shift: Shift, publicHolidays: PublicHoliday[]): DayType {
  if (isPublicHoliday(shift, publicHolidays)) return 'publicHoliday';
  if (isSunday(shift.date)) return 'sunday';
  if (isSaturday(shift.date)) return 'saturday';
  return 'weekday';
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
  const { start, end } = resolveShiftTimes(shift.date, shift.startTime, shift.endTime);
  const minutes = (end.getTime() - start.getTime()) / 60000 - shift.unpaidBreakMinutes;
  return Math.max(0, minutes / 60);
}

/** An interval of the shift's timeline tagged with which base rate applies. */
interface RawTimeSegment {
  start: Date;
  end: Date;
  rateLabel: RateLabel;
}

/**
 * Splits a shift's [start, end) into segments tagged 'night' or 'morning'. When the job has no
 * nightRateEndsAt, the whole shift is one segment decided by start time alone (legacy
 * behavior). When it does, night rate is a recurring daily window [nightRateStartsAt,
 * nightRateEndsAt) that wraps past midnight — a shift running past the window's end reverts
 * to morningRate for the remainder, even mid-shift.
 */
function computeRawTimeSegments(shift: Shift, job: Job): RawTimeSegment[] {
  const { start, end } = resolveShiftTimes(shift.date, shift.startTime, shift.endTime);

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

  const segments: RawTimeSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const segStart = new Date(points[i]);
    const segEnd = new Date(points[i + 1]);
    const midpoint = new Date((points[i] + points[i + 1]) / 2);
    const isNight = nightIntervals.some((iv) => midpoint >= iv.start && midpoint < iv.end);
    segments.push({ start: segStart, end: segEnd, rateLabel: isNight ? 'night' : 'morning' });
  }

  // Merge adjacent segments that ended up with the same label (e.g. two candidate windows abutting exactly).
  const merged: RawTimeSegment[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.rateLabel === seg.rateLabel && prev.end.getTime() === seg.start.getTime()) {
      prev.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

interface HourSegment {
  rateLabel: RateLabel;
  hours: number;
  /** Loaded $/hr for this segment (casual-loaded, day-multiplied) — before any OT tier multiplier. */
  rate: number;
}

/** Converts raw time segments into hour segments, removing the shift's unpaid break proportionally across them. */
function toHourSegments(rawSegments: RawTimeSegment[], unpaidBreakMinutes: number, rateFor: (label: RateLabel) => number): HourSegment[] {
  const totalRawMinutes = rawSegments.reduce((sum, seg) => sum + (seg.end.getTime() - seg.start.getTime()) / 60000, 0);
  if (totalRawMinutes <= 0) return [];
  return rawSegments.map((seg) => {
    const rawMinutes = (seg.end.getTime() - seg.start.getTime()) / 60000;
    const breakShare = unpaidBreakMinutes * (rawMinutes / totalRawMinutes);
    const netHours = Math.max(0, (rawMinutes - breakShare) / 60);
    return { rateLabel: seg.rateLabel, hours: netHours, rate: rateFor(seg.rateLabel) };
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
      result.push({ tierIndex, rateLabel: seg.rateLabel, hours: seg.hours, multiplier: tier.multiplier, rate, pay: seg.hours * rate });
    }
    remaining = rest;
    consumed = 0;
  }

  return result;
}

function toRegularSegments(segments: HourSegment[]): RegularSegment[] {
  return segments
    .filter((s) => s.hours > 1e-9)
    .map((s) => ({ rateLabel: s.rateLabel, hours: s.hours, rate: s.rate, pay: s.hours * s.rate }));
}

/** Calculates a shift's pay in isolation, using only its own day's overtime threshold. */
export function computeShiftDaily(
  shift: Shift,
  job: Job,
  publicHolidays: PublicHoliday[],
): ShiftDailyBreakdown {
  const dayType = determineDayType(shift, publicHolidays);
  const dayMultiplier = dayMultiplierFor(job, dayType);

  const rateFor = (label: RateLabel): number => {
    const base = label === 'night' ? job.nightRate : job.morningRate;
    return base * (1 + job.casualLoadingPercent / 100) * dayMultiplier;
  };

  const rawSegments = computeRawTimeSegments(shift, job);
  const hourSegments = toHourSegments(rawSegments, shift.unpaidBreakMinutes, rateFor);
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
  const rateLabel: RateLabel = shift.startTime >= job.nightRateStartsAt ? 'night' : 'morning';
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
    dayMultiplier,
    loadedHourlyRate,
    regularHours,
    regularSegments,
    overtimeSegments,
    regularPay,
    overtimePay,
    grossPay: regularPay + overtimePay,
  };
}

/**
 * Calculates pay for every shift a job worked in one week, reconciling the weekly overtime
 * threshold across shifts in chronological order: once cumulative non-daily-OT hours cross
 * the threshold, the excess is reclassified (starting from the earliest hours past the
 * threshold, i.e. peeled off the end of each shift's own regular segments) into weekly-OT
 * tiers, applied on top of whichever rate those trailing hours actually fall under.
 */
export function computeWeekPay(
  shiftsInWeek: Shift[],
  job: Job,
  publicHolidays: PublicHoliday[],
): WeekPayResult {
  const sorted = [...shiftsInWeek].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );

  const dailyBreakdowns = sorted.map((shift) => computeShiftDaily(shift, job, publicHolidays));

  const weeklyThreshold = job.overtimeThresholdHoursPerWeek;
  let runningRegularHours = 0;
  let weeklyTierHoursConsumed = 0;

  const shiftBreakdowns: ShiftWeeklyBreakdown[] = dailyBreakdowns.map((daily) => {
    let weeklyOvertimeHours = 0;
    let weeklyOvertimeSegments: OvertimeSegment[] = [];
    let finalRegularSegments: RegularSegment[] = daily.regularSegments;

    if (weeklyThreshold != null) {
      const before = runningRegularHours;
      const after = before + daily.regularHours;
      weeklyOvertimeHours = Math.max(0, after - Math.max(before, weeklyThreshold));
      runningRegularHours = after;

      if (weeklyOvertimeHours > 0) {
        const asHourSegments: HourSegment[] = daily.regularSegments.map((s) => ({
          rateLabel: s.rateLabel,
          hours: s.hours,
          rate: s.rate,
        }));
        const { remaining, taken } = takeFromEnd(asHourSegments, weeklyOvertimeHours);
        finalRegularSegments = toRegularSegments(remaining);
        weeklyOvertimeSegments = splitSegmentsIntoTiers(taken, job.overtimeTiers, weeklyTierHoursConsumed);
        weeklyTierHoursConsumed += weeklyOvertimeHours;
      }
    }

    const finalRegularHours = finalRegularSegments.reduce((sum, s) => sum + s.hours, 0);
    const finalRegularPay = finalRegularSegments.reduce((sum, s) => sum + s.pay, 0);
    const weeklyOvertimePay = weeklyOvertimeSegments.reduce((sum, seg) => sum + seg.pay, 0);
    const finalGrossPay = finalRegularPay + daily.overtimePay + weeklyOvertimePay;
    const superAmount = job.includeSuper ? finalGrossPay * (job.superRatePercent / 100) : 0;

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

  return {
    shiftBreakdowns,
    totalGrossPay: shiftBreakdowns.reduce((sum, s) => sum + s.finalGrossPay, 0),
    totalSuper: shiftBreakdowns.reduce((sum, s) => sum + s.superAmount, 0),
    totalHours: shiftBreakdowns.reduce((sum, s) => sum + s.workedHours, 0),
  };
}
