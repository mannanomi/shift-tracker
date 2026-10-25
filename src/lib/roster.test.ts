import { describe, expect, it } from 'vitest';
import type { Roster, Shift } from '../types';
import { buildRosterShifts, rosterKindOn } from './roster';

const roster: Roster = {
  id: 'r1',
  jobId: 'mss-r',
  days: 2,
  nights: 2,
  off: 4,
  dayStart: '06:00',
  dayEnd: '18:00',
  nightStart: '18:00',
  nightEnd: '06:00',
  unpaidBreakMinutes: 0,
  startDate: '2026-10-27',
  generatedUntil: '2026-10-27',
};

describe('roster', () => {
  it('repeats 2 days, 2 nights, 4 off', () => {
    const kinds = ['27', '28', '29', '30', '31'].map((d) => rosterKindOn(roster, `2026-10-${d}`));
    expect(kinds).toEqual(['day', 'day', 'night', 'night', 'off']);
    expect(rosterKindOn(roster, '2026-11-03')).toBe('off');
    expect(rosterKindOn(roster, '2026-11-04')).toBe('day'); // 8 days after the start
    expect(rosterKindOn(roster, '2026-11-06')).toBe('night');
    expect(rosterKindOn(roster, '2026-10-26')).toBe('off'); // before the start
  });

  it('builds day and night shifts, skipping dates that already have a shift for the job', () => {
    const existing: Shift[] = [
      { id: 'x', jobId: 'mss-r', date: '2026-10-28', startTime: '07:00', endTime: '15:00', unpaidBreakMinutes: 0, isPublicHolidayOverride: null, notes: '' },
    ];
    const shifts = buildRosterShifts(roster, existing, '2026-10-27', '2026-11-05');
    expect(shifts.map((s) => [s.date, s.startTime, s.endTime])).toEqual([
      ['2026-10-27', '06:00', '18:00'],
      ['2026-10-29', '18:00', '06:00'],
      ['2026-10-30', '18:00', '06:00'],
      ['2026-11-04', '06:00', '18:00'],
      ['2026-11-05', '06:00', '18:00'],
    ]);
    expect(shifts.every((s) => s.rosterId === 'r1' && s.jobId === 'mss-r')).toBe(true);
  });
});
