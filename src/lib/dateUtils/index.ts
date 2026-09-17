import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export const ADELAIDE_TZ = 'Australia/Adelaide';

/** Parses a "yyyy-MM-dd" date string as a calendar date, ignoring time/zone entirely. */
export function parseDateOnly(dateStr: string): Date {
  return startOfDay(parseISO(dateStr));
}

export function formatDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Day of week for a "yyyy-MM-dd" string: 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(dateStr: string): number {
  return parseDateOnly(dateStr).getDay();
}

export function isSaturday(dateStr: string): boolean {
  return dayOfWeek(dateStr) === 6;
}

export function isSunday(dateStr: string): boolean {
  return dayOfWeek(dateStr) === 0;
}

/** Combines a "yyyy-MM-dd" date and "HH:mm" time into a Date, interpreted in Adelaide local time. */
export function combineDateAndTimeInAdelaide(dateStr: string, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const local = new Date(`${dateStr}T00:00:00`);
  local.setHours(hours, minutes, 0, 0);
  return local;
}

/**
 * Returns the shift's start and end Date objects, treating endTime <= startTime as
 * crossing midnight into the next day.
 */
export function resolveShiftTimes(
  dateStr: string,
  startTime: string,
  endTime: string,
): { start: Date; end: Date } {
  const start = combineDateAndTimeInAdelaide(dateStr, startTime);
  let end = combineDateAndTimeInAdelaide(dateStr, endTime);
  if (end.getTime() <= start.getTime()) {
    end = addDays(end, 1);
  }
  return { start, end };
}

export function nowInAdelaide(): Date {
  return toZonedTime(new Date(), ADELAIDE_TZ);
}

/** Start of the week (as a "yyyy-MM-dd" string) containing dateStr, per weekStartDay (0=Sun, 1=Mon). */
export function startOfWeekStr(dateStr: string, weekStartDay: 0 | 1): string {
  const date = parseDateOnly(dateStr);
  const currentDay = date.getDay();
  const diff = (currentDay - weekStartDay + 7) % 7;
  return formatDateOnly(addDays(date, -diff));
}

export function endOfWeekStr(dateStr: string, weekStartDay: 0 | 1): string {
  return formatDateOnly(addDays(parseDateOnly(startOfWeekStr(dateStr, weekStartDay)), 6));
}

/**
 * Start of the fortnight (as a "yyyy-MM-dd" string) containing dateStr, aligned to
 * fortnightAnchorDate — any date the pay cycle is known to start on.
 */
export function startOfFortnightStr(dateStr: string, fortnightAnchorDate: string): string {
  const anchor = parseDateOnly(fortnightAnchorDate);
  const target = parseDateOnly(dateStr);
  const daysSinceAnchor = differenceInCalendarDays(target, anchor);
  const daysIntoCycle = ((daysSinceAnchor % 14) + 14) % 14;
  return formatDateOnly(addDays(target, -daysIntoCycle));
}

export function endOfFortnightStr(dateStr: string, fortnightAnchorDate: string): string {
  return formatDateOnly(addDays(parseDateOnly(startOfFortnightStr(dateStr, fortnightAnchorDate)), 13));
}

/** All "yyyy-MM-dd" dates from start to end (inclusive). */
export function dateRangeStrs(startStr: string, endStr: string): string[] {
  const start = parseDateOnly(startStr);
  const end = parseDateOnly(endStr);
  const days = differenceInCalendarDays(end, start);
  return Array.from({ length: days + 1 }, (_, i) => formatDateOnly(addDays(start, i)));
}
