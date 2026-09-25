import { useMemo, useState } from 'react';
import { Banknote, CalendarRange, Clock, Home, Inbox, Plus, Sunrise, Wallet } from 'lucide-react';
import { useJobs, usePublicHolidays, useSettings, useShifts } from '../hooks/useData';
import { buildRangeReport, type ShiftLine } from '../lib/payCalculation/reports';
import {
  endOfFortnightStr,
  endOfWeekStr,
  formatDateOnly,
  resolveShiftTimes,
  startOfFortnightStr,
  startOfWeekStr,
} from '../lib/dateUtils';
import { formatCurrency, formatHours } from '../lib/format';
import { estimateNetForPeriod } from '../lib/tax/auIncomeTax';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ShiftForm } from '../components/shifts/ShiftForm';

export function Dashboard() {
  const jobs = useJobs();
  const shifts = useShifts();
  const publicHolidays = usePublicHolidays();
  const settings = useSettings();
  const [addingShift, setAddingShift] = useState(false);

  const today = formatDateOnly(new Date());

  const weekReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    const start = startOfWeekStr(today, settings.weekStartDay);
    const end = endOfWeekStr(today, settings.weekStartDay);
    return buildRangeReport(start, end, jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, today]);

  const fortnightReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    const start = startOfFortnightStr(today, settings.fortnightAnchorDate);
    const end = endOfFortnightStr(today, settings.fortnightAnchorDate);
    return buildRangeReport(start, end, jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, today]);

  const todayReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    return buildRangeReport(today, today, jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, today]);

  const upcomingShift: ShiftLine | null = useMemo(() => {
    if (!todayReport) return null;
    const now = new Date();
    const notYetFinished = todayReport.shiftLines.filter((line) => {
      const { end } = resolveShiftTimes(line.shift.date, line.shift.startTime, line.shift.endTime);
      return end > now;
    });
    notYetFinished.sort((a, b) => a.shift.startTime.localeCompare(b.shift.startTime));
    return notYetFinished[0] ?? null;
  }, [todayReport]);

  if (!weekReport || !fortnightReport) return null;

  const hasCashJob = (jobs ?? []).some((j) => !j.taxable);

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader
        icon={<Home className="h-5 w-5" />}
        title="Dashboard"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddingShift(true)}>
            Add shift
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <UpcomingShiftCard line={upcomingShift} />
        <WeekTotalCard report={weekReport} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TotalsCard title="This week" report={weekReport} periodsPerYear={52} />
        <TotalsCard title="This fortnight" report={fortnightReport} periodsPerYear={26} />
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        After-tax figures are an estimate (AU resident rates + Medicare levy, annualized from this period's
        earnings) — excludes HECS/HELP, other income, and offsets not covered here.
      </p>

      {hasCashJob && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <CashIncomeCard title="Cash — this week" report={weekReport} />
            <CashIncomeCard title="Cash — this fortnight" report={fortnightReport} />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Cash-in-hand income, kept separate from taxable income and total above — not taxed, not summed in.
          </p>
        </>
      )}

      {addingShift && (
        <Modal title="Add shift" onClose={() => setAddingShift(false)}>
          <ShiftForm onDone={() => setAddingShift(false)} />
        </Modal>
      )}
    </div>
  );
}

function UpcomingShiftCard({ line }: { line: ShiftLine | null }) {
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <Sunrise className="h-4 w-4" />
        <h2 className="text-sm font-medium">Upcoming shift today</h2>
      </div>
      {line ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Badge color={line.job.color}>{line.job.name}</Badge>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {line.shift.startTime}–{line.shift.endTime} · {formatHours(line.breakdown.workedHours)}
            </p>
          </div>
          <p className="shrink-0 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(line.breakdown.finalGrossPay)}
          </p>
        </div>
      ) : (
        <div className="mt-1">
          <EmptyState icon={<Clock className="h-5 w-5" />} title="No upcoming shift today" />
        </div>
      )}
    </Card>
  );
}

function WeekTotalCard({ report }: { report: ReturnType<typeof buildRangeReport> }) {
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <Clock className="h-4 w-4" />
        <h2 className="text-sm font-medium">This week — total</h2>
      </div>
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{formatCurrency(report.totalGrossPay)}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Total income (taxable + cash combined)
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatHours(report.totalHours)} worked this week</p>
    </Card>
  );
}

function TotalsCard({
  title,
  report,
  periodsPerYear,
}: {
  title: string;
  report: ReturnType<typeof buildRangeReport>;
  periodsPerYear: number;
}) {
  const tax = estimateNetForPeriod(report.taxableGrossPay, periodsPerYear);
  const taxableJobs = report.jobSubtotals.filter((j) => j.taxable);
  const taxableHours = taxableJobs.reduce((sum, j) => sum + j.hours, 0);
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <CalendarRange className="h-4 w-4" />
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{formatCurrency(report.taxableGrossPay)}</p>
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Wallet className="h-3 w-3" /> Taxable income
      </p>
      <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">≈ {formatCurrency(tax.periodNetIncome)} after tax</p>
      <p className="text-sm text-slate-400 dark:text-slate-500">{formatHours(taxableHours)} worked{report.totalSuper > 0 && ` · +${formatCurrency(report.totalSuper)} super`}</p>
      <div className="mt-3 space-y-1.5">
        {taxableJobs.map((job) => (
          <div key={job.jobId} className="flex items-center justify-between text-sm">
            <Badge color={job.color}>{job.jobName}</Badge>
            <span className="font-medium text-slate-700 dark:text-slate-300">{formatCurrency(job.grossPay)}</span>
          </div>
        ))}
        {taxableJobs.length === 0 && <EmptyState icon={<Inbox className="h-5 w-5" />} title="No shifts yet" />}
      </div>
    </Card>
  );
}

function CashIncomeCard({ title, report }: { title: string; report: ReturnType<typeof buildRangeReport> }) {
  const cashJobs = report.jobSubtotals.filter((j) => !j.taxable);
  const cashHours = cashJobs.reduce((sum, j) => sum + j.hours, 0);
  return (
    <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-800/50 dark:bg-amber-500/5">
      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
        <Banknote className="h-4 w-4" />
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{formatCurrency(report.nonTaxableGrossPay)}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">Cash-in-hand, untaxed</p>
      <p className="text-sm text-slate-400 dark:text-slate-500">{formatHours(cashHours)} worked</p>
      <div className="mt-3 space-y-1.5">
        {cashJobs.map((job) => (
          <div key={job.jobId} className="flex items-center justify-between text-sm">
            <Badge color={job.color}>{job.jobName}</Badge>
            <span className="font-medium text-slate-700 dark:text-slate-300">{formatCurrency(job.grossPay)}</span>
          </div>
        ))}
        {cashJobs.length === 0 && <EmptyState icon={<Banknote className="h-5 w-5" />} title="No cash shifts yet" />}
      </div>
    </Card>
  );
}
