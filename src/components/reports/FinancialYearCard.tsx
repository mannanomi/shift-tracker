import { differenceInCalendarDays } from 'date-fns';
import { Landmark } from 'lucide-react';
import type { RangeReport } from '../../lib/payCalculation/reports';
import { parseDateOnly } from '../../lib/dateUtils';
import { formatCurrency, formatHours } from '../../lib/format';
import { estimateAnnualTax } from '../../lib/tax/auIncomeTax';
import { Card } from '../ui/Card';

/** 1 July on or before `today` — the start of the Australian financial year. */
export function financialYearStart(today: string): string {
  const [y, m] = today.split('-').map(Number);
  return `${m >= 7 ? y : y - 1}-07-01`;
}

/** Year-to-date totals and where the year is heading at the current pace. */
export function FinancialYearCard({ report, today, helpDebt }: { report: RangeReport; today: string; helpDebt: boolean }) {
  const fyStart = report.startDate;
  const [startYear] = fyStart.split('-').map(Number);
  const daysElapsed = differenceInCalendarDays(parseDateOnly(today), parseDateOnly(fyStart)) + 1;
  const hasAbn = report.abnGrossPay > 0;
  // ABN income is taxable too, so the yearly estimate covers wages + ABN together.
  const projectedTaxable = ((report.taxableGrossPay + report.abnGrossPay) / daysElapsed) * 365;
  const projectedTax = estimateAnnualTax(projectedTaxable, { helpDebt });
  const projectedWagesOnlyTax = estimateAnnualTax((report.taxableGrossPay / daysElapsed) * 365, { helpDebt });
  const projectedAbnTax = Math.max(0, projectedTax.totalTax - projectedWagesOnlyTax.totalTax);

  const stats = [
    { label: hasAbn ? 'Wages so far' : 'Taxable so far', value: formatCurrency(report.taxableGrossPay) },
    ...(hasAbn ? [{ label: 'ABN so far', value: formatCurrency(report.abnGrossPay) }] : []),
    { label: 'Cash so far', value: formatCurrency(report.nonTaxableGrossPay) },
    { label: 'Hours', value: formatHours(report.totalHours) },
    { label: 'Super', value: formatCurrency(report.totalSuper) },
  ];

  return (
    <Card>
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        <Landmark className="h-4 w-4" /> Financial year {startYear}–{String(startYear + 1).slice(2)}
        <span className="ml-auto text-xs font-normal text-slate-400 dark:text-slate-500">Day {daysElapsed} of 365</span>
      </h2>
      <div className={`mt-3 grid grid-cols-2 gap-3 ${hasAbn ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        {stats.map((s, i) => (
          <div key={s.label} className={stats.length % 2 === 1 && i === stats.length - 1 ? 'col-span-2 sm:col-span-1' : ''}>
            <p className="text-xs text-slate-400 dark:text-slate-500">{s.label}</p>
            <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{s.value}</p>
          </div>
        ))}
      </div>
      {projectedTaxable > 0 && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
          At this pace: <span className="font-semibold">{formatCurrency(projectedTaxable)}</span> taxable this year
          {hasAbn && ' (wages + ABN)'}, est. tax <span className="font-semibold">{formatCurrency(projectedTax.totalTax)}</span>
          {helpDebt && projectedTax.helpRepayment > 0 && ` (incl. ${formatCurrency(projectedTax.helpRepayment)} HELP)`}.
          {hasAbn && projectedAbnTax >= 1 && (
            <>
              {' '}About <span className="font-semibold">{formatCurrency(projectedAbnTax)}</span> of that is on ABN income and isn’t
              withheld, so set it aside.
            </>
          )}
          {daysElapsed < 30 && <span className="text-slate-400 dark:text-slate-500"> Early in the year, so this will move a lot.</span>}
        </p>
      )}
    </Card>
  );
}
