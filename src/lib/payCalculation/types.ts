export type DayType = 'publicHoliday' | 'sunday' | 'saturday' | 'weekday';
export type RateLabel = 'morning' | 'night';

/** A slice of regular (non-OT) hours paid at one rate — a shift only has >1 of these when it straddles the night-rate window's start/end. */
export interface RegularSegment {
  rateLabel: RateLabel;
  hours: number;
  /** $/hr for this segment (casual-loaded, day-multiplied — not including any OT multiplier). */
  rate: number;
  pay: number;
}

export interface OvertimeSegment {
  tierIndex: number;
  /** Which base rate this OT segment's hours fall under — relevant when a night-rate window is configured. */
  rateLabel: RateLabel;
  hours: number;
  multiplier: number;
  /** The hourly rate this segment is paid at (the segment's loaded rate * multiplier). */
  rate: number;
  pay: number;
}

/** A shift's pay, calculated in isolation (no knowledge of other shifts that week). */
export interface ShiftDailyBreakdown {
  shiftId: string;
  workedHours: number;
  /** The rate in effect at the shift's start time — a display fallback; see regularSegments for the full split. */
  rateLabel: RateLabel;
  baseRate: number;
  casualLoadedRate: number;
  dayType: DayType;
  dayMultiplier: number;
  /** casualLoadedRate * dayMultiplier for the shift's starting rate — see regularSegments when the shift is split. */
  loadedHourlyRate: number;
  regularHours: number;
  /** Regular (non-OT) hours broken down by rate — usually one entry, two when the shift straddles the night-rate window. */
  regularSegments: RegularSegment[];
  overtimeSegments: OvertimeSegment[];
  regularPay: number;
  overtimePay: number;
  /** regularPay + overtimePay, before any weekly-OT reconciliation. */
  grossPay: number;
}

/** A shift's pay after weekly-OT reconciliation across all of a job's shifts that week. */
export interface ShiftWeeklyBreakdown extends ShiftDailyBreakdown {
  weeklyOvertimeSegments: OvertimeSegment[];
  weeklyOvertimeHours: number;
  weeklyOvertimePay: number;
  /** regularHours after weekly-OT hours are reclassified out of it. */
  finalRegularHours: number;
  /** regularSegments after weekly-OT hours are peeled off the end (chronologically) of this shift. */
  finalRegularSegments: RegularSegment[];
  finalRegularPay: number;
  /** finalRegularPay + overtimePay (daily) + weeklyOvertimePay. */
  finalGrossPay: number;
  superAmount: number;
}

export interface WeekPayResult {
  shiftBreakdowns: ShiftWeeklyBreakdown[];
  totalGrossPay: number;
  totalSuper: number;
  totalHours: number;
}
