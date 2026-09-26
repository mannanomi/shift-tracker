import { useMemo, useState } from 'react';
import { addDays, addWeeks } from 'date-fns';
import { Banknote, BarChart3, ChevronLeft, ChevronRight, Download, FileText, Inbox, Wallet } from 'lucide-react';
import { useJobs, usePublicHolidays, useSettings, useShifts } from '../hooks/useData';
import { buildRangeReport } from '../lib/payCalculation/reports';
import {
  endOfFortnightStr,
  endOfWeekStr,
  formatDateOnly,
  parseDateOnly,
  startOfFortnightStr,
  startOfWeekStr,
} from '../lib/dateUtils';
import { formatCurrency, formatHours } from '../lib/format';
import { Money } from '../components/ui/Money';
import { downloadCsv, shiftsToCsv } from '../lib/csvExport';
import { estimateNetForPeriod } from '../lib/tax/auIncomeTax';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { EarningsChart, type EarningsPoint, type EarningsSeries } from '../components/charts/EarningsChart';
import { EarningsHeatmap } from '../components/reports/EarningsHeatmap';
import { DayTypeBreakdown } from '../components/reports/DayTypeBreakdown';
import { FinancialYearCard, financialYearStart } from '../components/reports/FinancialYearCard';
import { PayslipCheckCard } from '../components/reports/PayslipCheckCard';

type Period = 'weekly' | 'fortnightly';

function formatRange(start: string, end: string): string {
  const s = parseDateOnly(start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const e = parseDateOnly(end).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${s} – ${e}`;
}

/** Prints the page in light mode (the browser's print dialog offers "Save as PDF"). */
function printAsPdf() {
  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  if (wasDark) root.classList.remove('dark');
  const restore = () => {
    if (wasDark) root.classList.add('dark');
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}

export function ReportsPage() {
  const jobs = useJobs();
  const shifts = useShifts();
  const publicHolidays = usePublicHolidays();
  const settings = useSettings();
  const [period, setPeriod] = useState<Period>('weekly');
  const [anchorDate, setAnchorDate] = useState(() => formatDateOnly(new Date()));
  const today = formatDateOnly(new Date());

  const range = useMemo(() => {
    if (!settings) return null;
    return period === 'weekly'
      ? { start: startOfWeekStr(anchorDate, settings.weekStartDay), end: endOfWeekStr(anchorDate, settings.weekStartDay) }
      : {
          start: startOfFortnightStr(anchorDate, settings.fortnightAnchorDate),
          end: endOfFortnightStr(anchorDate, settings.fortnightAnchorDate),
        };
  }, [period, anchorDate, settings]);

  const report = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings || !range) return null;
    return buildRangeReport(range.start, range.end, jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, range]);

  const yearReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    return buildRangeReport(formatDateOnly(addDays(parseDateOnly(today), -380)), today, jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, today]);

  const fyReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    return buildRangeReport(financialYearStart(today), today, jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, today]);

  const chart = useMemo((): { data: EarningsPoint[]; series: EarningsSeries[] } => {
    if (!jobs || !shifts || !publicHolidays || !settings) return { data: [], series: [] };
    const data: EarningsPoint[] = [];
    const usedJobs = new Set<string>();
    const periods = 8;
    for (let i = periods - 1; i >= 0; i--) {
      let start: string, end: string;
      if (period === 'weekly') {
        const d = formatDateOnly(addWeeks(parseDateOnly(anchorDate), -i));
        start = startOfWeekStr(d, settings.weekStartDay);
        end = endOfWeekStr(d, settings.weekStartDay);
      } else {
        const d = formatDateOnly(addDays(parseDateOnly(anchorDate), -i * 14));
        start = startOfFortnightStr(d, settings.fortnightAnchorDate);
        end = endOfFortnightStr(d, settings.fortnightAnchorDate);
      }
      const r = buildRangeReport(start, end, jobs, shifts, publicHolidays, settings.weekStartDay);
      const point: EarningsPoint = { label: parseDateOnly(start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) };
      for (const j of r.jobSubtotals) {
        point[j.jobId] = Math.round(j.grossPay * 100) / 100;
        usedJobs.add(j.jobId);
      }
      data.push(point);
    }
    const series = jobs.filter((j) => usedJobs.has(j.id)).map((j) => ({ key: j.id, name: j.name, color: j.color }));
    return { data, series };
  }, [jobs, shifts, publicHolidays, settings, period, anchorDate]);

  if (!report || !range || !settings || !yearReport || !fyReport) return null;

  const helpDebt = Boolean(settings.hasHelpDebt);
  const hasCashJob = (jobs ?? []).some((j) => !j.taxable);
  const taxableJobs = report.jobSubtotals.filter((j) => j.taxable);
  const cashJobs = report.jobSubtotals.filter((j) => !j.taxable);
  const taxableHours = taxableJobs.reduce((sum, j) => sum + j.hours, 0);
  const cashHours = cashJobs.reduce((sum, j) => sum + j.hours, 0);
  const shiftCount = report.shiftLines.length;

  const stats = [
    { label: 'Total earned', value: formatCurrency(report.totalGrossPay), hint: 'Taxable + cash' },
    { label: 'Hours', value: formatHours(report.totalHours), hint: `${shiftCount} shift${shiftCount === 1 ? '' : 's'}` },
    {
      label: 'Average rate',
      value: report.totalHours > 0 ? `${formatCurrency(report.totalGrossPay / report.totalHours)}/h` : '—',
      hint: 'Across all loadings',
    },
    {
      label: 'Per shift',
      value: shiftCount > 0 ? formatCurrency(report.totalGrossPay / shiftCount) : '—',
      hint: 'Average',
    },
  ];

  function shiftPeriod(direction: -1 | 1) {
    setAnchorDate((prev) =>
      formatDateOnly(period === 'weekly' ? addWeeks(parseDateOnly(prev), direction) : addDays(parseDateOnly(prev), direction * 14)),
    );
  }

  function handleExport() {
    const csv = shiftsToCsv(report!);
    downloadCsv(`shifts_${range!.start}_to_${range!.end}.csv`, csv);
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Reports"
        action={
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleExport} disabled={shiftCount === 0}>
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={printAsPdf}>
              PDF
            </Button>
          </div>
        }
      />
      <div className="flex gap-2 print:hidden">
        <Button variant={period === 'weekly' ? 'primary' : 'secondary'} onClick={() => setPeriod('weekly')}>
          Weekly
        </Button>
        <Button variant={period === 'fortnightly' ? 'primary' : 'secondary'} onClick={() => setPeriod('fortnightly')}>
          Fortnightly
        </Button>
      </div>

      <div className={`grid gap-4 ${hasCashJob ? 'lg:grid-cols-[2fr_1fr]' : ''}`}>
        <Card>
          <div className="flex items-start justify-between gap-2">
            <Button variant="ghost" className="mt-1 shrink-0 print:invisible" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => shiftPeriod(-1)}>
              Prev
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{formatRange(range.start, range.end)}</p>
              <p className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl dark:text-slate-100">
                <Money amount={report.taxableGrossPay} animate />
              </p>
              <p className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <Wallet className="h-3 w-3" /> Taxable income
              </p>
              <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                ≈ {formatCurrency(estimateNetForPeriod(report.taxableGrossPay, period === 'weekly' ? 52 : 26, { helpDebt }).periodNetIncome)}{' '}
                after tax
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {formatHours(taxableHours)}
                {report.totalSuper > 0 && ` · +${formatCurrency(report.totalSuper)} super`}
              </p>
            </div>
            <Button
              variant="ghost"
              className="mt-1 shrink-0 flex-row-reverse print:invisible"
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => shiftPeriod(1)}
            >
              Next
            </Button>
          </div>
        </Card>

        {hasCashJob && (
          <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-800/50 dark:bg-amber-500/5">
            <div className="text-center">
              <p className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <Banknote className="h-3 w-3" /> Cash income, untaxed
              </p>
              <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                <Money amount={report.nonTaxableGrossPay} animate />
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{formatHours(cashHours)}</p>
            </div>
            <div className="mt-3 space-y-1.5">
              {cashJobs.map((job) => (
                <div key={job.jobId} className="flex items-center justify-between text-sm">
                  <Badge color={job.color}>{job.jobName}</Badge>
                  <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{formatCurrency(job.grossPay)}</span>
                </div>
              ))}
              {cashJobs.length === 0 && <p className="text-center text-sm text-slate-400 dark:text-slate-500">No cash shifts in this period.</p>}
            </div>
          </Card>
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        After-tax figures are an estimate (AU resident rates + Medicare levy{helpDebt ? ' + HECS/HELP' : ''}, annualized from
        this period's earnings). Cash income is kept separate and not taxed here.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3.5!">
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">{s.label}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">{s.value}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">{s.hint}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
          <BarChart3 className="h-4 w-4" /> Earnings by job, recent {period === 'weekly' ? 'weeks' : 'fortnights'}
        </h2>
        <EarningsChart data={chart.data} series={chart.series} />
        {chart.series.length > 1 && (
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {chart.series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} /> {s.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <DayTypeBreakdown report={report} />
        <PayslipCheckCard report={report} settings={settings} />
      </div>

      <EarningsHeatmap lines={yearReport.shiftLines} today={today} weekStartDay={settings.weekStartDay} />

      <FinancialYearCard report={fyReport} today={today} helpDebt={helpDebt} />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">By job (taxable)</h2>
          <div className="space-y-2">
            {taxableJobs.map((job) => (
              <div key={job.jobId} className="flex items-center justify-between gap-2 text-sm">
                <Badge color={job.color}>{job.jobName}</Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatHours(job.hours)} · {job.shiftCount} shifts
                </span>
                <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{formatCurrency(job.grossPay)}</span>
              </div>
            ))}
            {taxableJobs.length === 0 && <EmptyState icon={<Inbox className="h-5 w-5" />} title="No shifts in this period" />}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">Shift breakdown</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {report.shiftLines.map(({ shift, job, breakdown }) => (
              <div key={shift.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge color={job.color}>
                    {job.name}
                    {!job.taxable && ' (cash)'}
                  </Badge>
                  <span className="text-slate-600 dark:text-slate-300">
                    {parseDateOnly(shift.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {shift.startTime}–{shift.endTime}
                  </span>
                </div>
                <span className="shrink-0 font-medium tabular-nums text-slate-800 dark:text-slate-200">{formatCurrency(breakdown.finalGrossPay)}</span>
              </div>
            ))}
            {report.shiftLines.length === 0 && <EmptyState icon={<Inbox className="h-5 w-5" />} title="No shifts in this period" />}
          </div>
        </Card>
      </div>
    </div>
  );
}
