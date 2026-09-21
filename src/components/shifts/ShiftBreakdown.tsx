import type { RateLabel, ShiftWeeklyBreakdown } from '../../lib/payCalculation/types';
import { formatCurrency, formatHours } from '../../lib/format';

const DAY_TYPE_LABEL: Record<ShiftWeeklyBreakdown['dayType'], string> = {
  publicHoliday: 'Public holiday',
  sunday: 'Sunday',
  saturday: 'Saturday',
  weekday: 'Weekday',
};

const RATE_LABEL_TEXT: Record<RateLabel, string> = { morning: 'day', night: 'night' };

export function ShiftBreakdown({ breakdown }: { breakdown: ShiftWeeklyBreakdown }) {
  const allRateLabels = new Set([
    ...breakdown.finalRegularSegments.map((s) => s.rateLabel),
    ...breakdown.overtimeSegments.map((s) => s.rateLabel),
    ...breakdown.weeklyOvertimeSegments.map((s) => s.rateLabel),
  ]);
  const isSplitShift = allRateLabels.size > 1;

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-700/40">
      <Row label="Worked hours">{formatHours(breakdown.workedHours)}</Row>
      {isSplitShift ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          This shift crosses the night-rate window, so hours are split below by day/night rate.
        </p>
      ) : (
        <>
          <Row label={`Base rate (${breakdown.rateLabel})`}>{formatCurrency(breakdown.baseRate)}/hr</Row>
          <Row label="After casual loading">{formatCurrency(breakdown.casualLoadedRate)}/hr</Row>
        </>
      )}
      <Row label="Day type × multiplier">
        {DAY_TYPE_LABEL[breakdown.dayType]} × {breakdown.dayMultiplier}
      </Row>
      {!isSplitShift && <Row label="Loaded hourly rate">{formatCurrency(breakdown.loadedHourlyRate)}/hr</Row>}
      <div className="border-t border-slate-200 pt-2 dark:border-slate-600">
        {breakdown.finalRegularSegments.map((seg, i) => (
          <Row
            key={`regular-${i}`}
            label={
              isSplitShift
                ? `Regular hours – ${RATE_LABEL_TEXT[seg.rateLabel]} (${formatHours(seg.hours)} @ ${formatCurrency(seg.rate)}/hr)`
                : `Regular hours (${formatHours(seg.hours)})`
            }
          >
            {formatCurrency(seg.pay)}
          </Row>
        ))}
        {breakdown.overtimeSegments.map((seg, i) => (
          <Row
            key={`daily-${i}`}
            label={`Daily OT tier ${seg.tierIndex + 1}${isSplitShift ? ` – ${RATE_LABEL_TEXT[seg.rateLabel]}` : ''} (${formatHours(seg.hours)} @ ${seg.multiplier}x)`}
          >
            {formatCurrency(seg.pay)}
          </Row>
        ))}
        {breakdown.weeklyOvertimeSegments.map((seg, i) => (
          <Row
            key={`weekly-${i}`}
            label={`Weekly OT tier ${seg.tierIndex + 1}${isSplitShift ? ` – ${RATE_LABEL_TEXT[seg.rateLabel]}` : ''} (${formatHours(seg.hours)} @ ${seg.multiplier}x)`}
          >
            {formatCurrency(seg.pay)}
          </Row>
        ))}
      </div>
      <div className="border-t border-slate-200 pt-2 font-semibold text-slate-900 dark:border-slate-600 dark:text-slate-100">
        <Row label="Gross pay">{formatCurrency(breakdown.finalGrossPay)}</Row>
      </div>
      {breakdown.superAmount > 0 && (
        <Row label="Superannuation (additional, not deducted)">{formatCurrency(breakdown.superAmount)}</Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-800 dark:text-slate-200">{children}</span>
    </div>
  );
}
