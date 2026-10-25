import { addDays, differenceInCalendarDays } from 'date-fns';
import type { Roster, Shift } from '../types';
import { formatDateOnly, parseDateOnly } from './dateUtils';

export type RosterDayKind = 'day' | 'night' | 'off';

/** What the roster has on a date: day shift, night shift, or a day off. Dates before the start are off. */
export function rosterKindOn(roster: Pick<Roster, 'days' | 'nights' | 'off' | 'startDate'>, date: string): RosterDayKind {
  const cycle = roster.days + roster.nights + roster.off;
  const offset = differenceInCalendarDays(parseDateOnly(date), parseDateOnly(roster.startDate));
  if (cycle <= 0 || offset < 0) return 'off';
  const pos = offset % cycle;
  if (pos < roster.days) return 'day';
  if (pos < roster.days + roster.nights) return 'night';
  return 'off';
}

/**
 * The shifts a roster adds between `from` and `until` (inclusive). Dates that already have a
 * shift for the roster's job are skipped, so regenerating or extending never doubles up.
 */
export function buildRosterShifts(roster: Roster, existing: Shift[], from: string, until: string): Shift[] {
  const taken = new Set(existing.filter((s) => s.jobId === roster.jobId).map((s) => s.date));
  const out: Shift[] = [];
  const start = parseDateOnly(from > roster.startDate ? from : roster.startDate);
  for (let d = start; formatDateOnly(d) <= until; d = addDays(d, 1)) {
    const date = formatDateOnly(d);
    const kind = rosterKindOn(roster, date);
    if (kind === 'off' || taken.has(date)) continue;
    out.push({
      id: crypto.randomUUID(),
      jobId: roster.jobId,
      date,
      startTime: kind === 'day' ? roster.dayStart : roster.nightStart,
      endTime: kind === 'day' ? roster.dayEnd : roster.nightEnd,
      unpaidBreakMinutes: roster.unpaidBreakMinutes,
      isPublicHolidayOverride: null,
      notes: '',
      rosterId: roster.id,
    });
  }
  return out;
}
