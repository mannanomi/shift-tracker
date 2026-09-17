import type { Job, PublicHoliday, Shift } from '../../types';
import { isSaturday, isSunday, resolveShiftTimes } from '../dateUtils';
import type {
  DayType,
  OvertimeSegment,
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

/**
 * Splits `hours` across `tiers` in order, starting `tiers` consumption from `alreadyConsumedHours`
 * (so weekly-OT calculations can continue where earlier shifts in the week left off).
 */
function splitIntoTiers(
  hours: number,
  tiers: Job['overtimeTiers'],
  loadedHourlyRate: number,
  alreadyConsumedHours: number,
): OvertimeSegment[] {
  const segments: OvertimeSegment[] = [];
  let remaining = hours;
  let consumed = alreadyConsumedHours;

  for (let tierIndex = 0; tierIndex < tiers.length && remaining > 1e-9; tierIndex++) {
    const tier = tiers[tierIndex];
    const tierCapacityLeft = Math.max(0, tier.hoursInTier - consumed);
    if (tierCapacityLeft <= 0) {
      consumed -= tier.hoursInTier;
      continue;
    }
    const hoursInThisTier = Math.min(remaining, tierCapacityLeft);
    const rate = loadedHourlyRate * tier.multiplier;
    segments.push({
      tierIndex,
      hours: hoursInThisTier,
      multiplier: tier.multiplier,
      rate,
      pay: hoursInThisTier * rate,
    });
    remaining -= hoursInThisTier;
    consumed = 0;
  }

  return segments;
}

/** Calculates a shift's pay in isolation, using only its own day's overtime threshold. */
export function computeShiftDaily(
  shift: Shift,
  job: Job,
  publicHolidays: PublicHoliday[],
): ShiftDailyBreakdown {
  const workedHours = workedHoursFor(shift);
  const rateLabel = shift.startTime >= job.nightRateStartsAt ? 'night' : 'morning';
  const baseRate = rateLabel === 'night' ? job.nightRate : job.morningRate;
  const casualLoadedRate = baseRate * (1 + job.casualLoadingPercent / 100);
  const dayType = determineDayType(shift, publicHolidays);
  const dayMultiplier = dayMultiplierFor(job, dayType);
  const loadedHourlyRate = casualLoadedRate * dayMultiplier;

  const dailyThreshold = job.overtimeThresholdHoursPerDay;
  const regularHours = dailyThreshold != null ? Math.min(workedHours, dailyThreshold) : workedHours;
  const otHours = dailyThreshold != null ? Math.max(0, workedHours - dailyThreshold) : 0;

  const overtimeSegments = splitIntoTiers(otHours, job.overtimeTiers, loadedHourlyRate, 0);
  const regularPay = regularHours * loadedHourlyRate;
  const overtimePay = overtimeSegments.reduce((sum, seg) => sum + seg.pay, 0);

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
 * threshold) into weekly-OT tiers, applied on top of each affected shift's own loaded rate.
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

    if (weeklyThreshold != null) {
      const before = runningRegularHours;
      const after = before + daily.regularHours;
      weeklyOvertimeHours = Math.max(0, after - Math.max(before, weeklyThreshold));
      runningRegularHours = after;

      if (weeklyOvertimeHours > 0) {
        weeklyOvertimeSegments = splitIntoTiers(
          weeklyOvertimeHours,
          job.overtimeTiers,
          daily.loadedHourlyRate,
          weeklyTierHoursConsumed,
        );
        weeklyTierHoursConsumed += weeklyOvertimeHours;
      }
    }

    const finalRegularHours = daily.regularHours - weeklyOvertimeHours;
    const finalRegularPay = finalRegularHours * daily.loadedHourlyRate;
    const weeklyOvertimePay = weeklyOvertimeSegments.reduce((sum, seg) => sum + seg.pay, 0);
    const finalGrossPay = finalRegularPay + daily.overtimePay + weeklyOvertimePay;
    const superAmount = job.includeSuper ? finalGrossPay * (job.superRatePercent / 100) : 0;

    return {
      ...daily,
      weeklyOvertimeSegments,
      weeklyOvertimeHours,
      weeklyOvertimePay,
      finalRegularHours,
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
