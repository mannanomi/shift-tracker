import type { PublicHoliday } from '../types';

/**
 * Default SA public holidays for 2026, computed from the standard rules (fixed dates,
 * Easter via Computus, "nth Monday of month" holidays). Boxing Day/Proclamation Day falls
 * on a Saturday in 2026 — SA sometimes gazettes a substitute weekday for this, which isn't
 * predictable in advance, so double-check that one (and any other date here) against the
 * official SA government gazette before relying on it. Everything here is editable in-app.
 */
export function seedPublicHolidaysSA2026(): Omit<PublicHoliday, 'id'>[] {
  const holiday = (date: string, name: string): Omit<PublicHoliday, 'id'> => ({
    date,
    name,
    state: 'SA',
  });

  return [
    holiday('2026-01-01', "New Year's Day"),
    holiday('2026-01-26', 'Australia Day'),
    holiday('2026-03-09', 'Adelaide Cup Day'),
    holiday('2026-04-03', 'Good Friday'),
    holiday('2026-04-04', 'Easter Saturday'),
    holiday('2026-04-06', 'Easter Monday'),
    holiday('2026-04-25', 'Anzac Day'),
    holiday('2026-06-08', "King's Birthday"),
    holiday('2026-10-05', 'Labour Day'),
    holiday('2026-12-24', 'Christmas Eve (from 7pm)'),
    holiday('2026-12-25', 'Christmas Day'),
    holiday('2026-12-26', 'Proclamation Day'),
    holiday('2026-12-31', "New Year's Eve (from 7pm)"),
  ];
}
