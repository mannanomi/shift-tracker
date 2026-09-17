export type DayType = 'publicHoliday' | 'sunday' | 'saturday' | 'weekday';
export type RateLabel = 'morning' | 'night';

export interface OvertimeSegment {
  tierIndex: number;
  hours: number;
  multiplier: number;
  /** The hourly rate this segment is paid at (loadedHourlyRate * multiplier). */
  rate: number;
  pay: number;
}

/** A shift's pay, calculated in isolation (no knowledge of other shifts that week). */
export interface ShiftDailyBreakdown {
  shiftId: string;
  workedHours: number;
  rateLabel: RateLabel;
  baseRate: number;
  casualLoadedRate: number;
  dayType: DayType;
  dayMultiplier: number;
  /** casualLoadedRate * dayMultiplier — the rate regular and OT hours are both based on. */
  loadedHourlyRate: number;
  regularHours: number;
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
