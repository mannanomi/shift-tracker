export type DayType = 'publicHoliday' | 'sunday' | 'saturday' | 'weekday';
export type RateLabel = 'morning' | 'night';

/**
 * A slice of regular (non-OT) hours paid at one rate. A shift has more than one when it
 * straddles the night-rate window's start/end, or runs past midnight into a different day type.
 */
export interface RegularSegment {
  rateLabel: RateLabel;
  /** The day these hours fall on (an overnight shift's hours after midnight use the next day). */
  dayType: DayType;
  hours: number;
  /** $/hr for this segment (casual-loaded, day-multiplied — not including any OT multiplier). */
  rate: number;
  pay: number;
  /** Paid leave hours (at the day rate) rather than time worked. */
  leave?: boolean;
}

export interface OvertimeSegment {
  /**
   * 'tier': paid at an overtime tier's multiplier. 'sundayRate': paid at the flat Sunday rate
   * (day rate × Sunday multiplier, no night loading; a public holiday hour keeps its own pay if
   * higher) — `multiplier` is that rate ÷ the hour's ordinary rate. 'dayRate': the day rate × the
   * weekday or weekend overtime multiplier for the day the hour falls on (`dayMultiplier`). No
   * super is paid on any of them.
   */
  basis: 'tier' | 'sundayRate' | 'dayRate';
  /** 'dayRate' only: the weekday/weekend overtime multiplier applied to the day rate. */
  dayMultiplier?: number;
  tierIndex: number;
  /** Which base rate this OT segment's hours fall under — relevant when a night-rate window is configured. */
  rateLabel: RateLabel;
  /** The day these hours fall on. */
  dayType: DayType;
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
  /** The day the shift starts on — see dayTypes / the segments for hours after midnight. */
  dayType: DayType;
  /** Every day type the shift's hours fall on, in order (two when it crosses into a different kind of day). */
  dayTypes: DayType[];
  dayMultiplier: number;
  /** casualLoadedRate * dayMultiplier for the shift's starting rate — see regularSegments when the shift is split. */
  loadedHourlyRate: number;
  regularHours: number;
  /** Regular (non-OT) hours broken down by rate — usually one entry, two when the shift straddles the night-rate window. */
  regularSegments: RegularSegment[];
  overtimeSegments: OvertimeSegment[];
  regularPay: number;
  overtimePay: number;
  /** Allowance entries: the allowance amount (0 for everything else). Earns super. */
  allowancePay: number;
  /** regularPay + overtimePay + allowancePay, before any weekly-OT reconciliation. */
  grossPay: number;
}

/**
 * A shift's pay after period-overtime reconciliation (the job's weekly limit, or a fortnightly
 * limit shared by an employer's jobs). The `weekly*` fields hold that period overtime.
 */
export interface ShiftWeeklyBreakdown extends ShiftDailyBreakdown {
  weeklyOvertimeSegments: OvertimeSegment[];
  weeklyOvertimeHours: number;
  weeklyOvertimePay: number;
  /** regularHours after weekly-OT hours are reclassified out of it. */
  finalRegularHours: number;
  /** regularSegments after weekly-OT hours are peeled off the end (chronologically) of this shift. */
  finalRegularSegments: RegularSegment[];
  finalRegularPay: number;
  /** finalRegularPay + overtimePay (daily) + weeklyOvertimePay + allowancePay. */
  finalGrossPay: number;
  superAmount: number;
}

export interface WeekPayResult {
  shiftBreakdowns: ShiftWeeklyBreakdown[];
  totalGrossPay: number;
  totalSuper: number;
  totalHours: number;
}
