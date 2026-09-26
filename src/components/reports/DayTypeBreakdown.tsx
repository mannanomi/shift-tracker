import { Moon, PieChart } from 'lucide-react';
import type { RangeReport } from '../../lib/payCalculation/reports';
import type { DayType } from '../../lib/payCalculation/types';
import { formatCurrency, formatHours } from '../../lib/format';
import { Card } from '../ui/Card';

const DAY_TYPES: { type: DayType; label: string; color: string }[] = [
  { type: 'weekday', label: 'Weekdays', color: 'bg-brand-500' },
  { type: 'saturday', label: 'Saturdays', color: 'bg-sky-500' },
  { type: 'sunday', label: 'Sundays', color: 'bg-amber-500' },
  { type: 'publicHoliday', label: 'Public holidays', color: 'bg-rose-500' },
];

/** Where the period's money came from: weekday vs weekend vs public holiday, plus night hours. */
export function DayTypeBreakdown({ report }: { report: RangeReport }) {
  const totals = new Map<DayType, { pay: number; hours: number }>();
  let nightHours = 0;
  for (const { breakdown } of report.shiftLines) {
    const t = totals.get(breakdown.dayType) ?? { pay: 0, hours: 0 };
    t.pay += breakdown.finalGrossPay;
    t.hours += breakdown.workedHours;
    totals.set(breakdown.dayType, t);
    for (const seg of [...breakdown.finalRegularSegments, ...breakdown.overtimeSegments, ...breakdown.weeklyOvertimeSegments]) {
      if (seg.rateLabel === 'night') nightHours += seg.hours;
    }
  }
  const totalPay = report.totalGrossPay;

  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        <PieChart className="h-4 w-4" /> Where it came from
      </h2>
      {totalPay === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">No shifts in this period.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
            {DAY_TYPES.map(({ type, color }) => {
              const pay = totals.get(type)?.pay ?? 0;
              return pay > 0 ? <div key={type} className={color} style={{ width: `${(pay / totalPay) * 100}%` }} /> : null;
            })}
          </div>
          <div className="mt-3 space-y-1.5">
            {DAY_TYPES.filter(({ type }) => totals.has(type)).map(({ type, label, color }) => {
              const t = totals.get(type)!;
              return (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                  <span className="text-slate-600 dark:text-slate-300">{label}</span>
                  <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{formatHours(t.hours)}</span>
                  <span className="w-24 text-right font-medium tabular-nums text-slate-800 dark:text-slate-200">{formatCurrency(t.pay)}</span>
                </div>
              );
            })}
          </div>
          {nightHours > 0 && (
            <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <Moon className="h-3.5 w-3.5" /> {formatHours(nightHours)} of {formatHours(report.totalHours)} paid at the night rate
            </p>
          )}
        </>
      )}
    </Card>
  );
}
