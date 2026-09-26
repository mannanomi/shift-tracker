import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { Banknote, CalendarRange, Clock, Home, Inbox, PiggyBank, Plus, Sunrise, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { Goal } from '../types';
import { useJobs, usePublicHolidays, useSettings, useShifts } from '../hooks/useData';
import { buildRangeReport, type ShiftLine } from '../lib/payCalculation/reports';
import {
  endOfFortnightStr,
  dateRangeStrs,
  endOfWeekStr,
  formatDateOnly,
  parseDateOnly,
  resolveShiftTimes,
  startOfFortnightStr,
  startOfWeekStr,
} from '../lib/dateUtils';
import { formatCurrency, formatHours } from '../lib/format';
import { estimateNetForPeriod } from '../lib/tax/auIncomeTax';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Money } from '../components/ui/Money';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ShiftForm } from '../components/shifts/ShiftForm';
import { ShiftTimerCard } from '../components/dashboard/ShiftTimerCard';

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

  const prevWeekReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    const d = formatDateOnly(addDays(parseDateOnly(today), -7));
    return buildRangeReport(startOfWeekStr(d, settings.weekStartDay), endOfWeekStr(d, settings.weekStartDay), jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, today]);

  const prevFortnightReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    const d = formatDateOnly(addDays(parseDateOnly(today), -14));
    return buildRangeReport(
      startOfFortnightStr(d, settings.fortnightAnchorDate),
      endOfFortnightStr(d, settings.fortnightAnchorDate),
      jobs,
      shifts,
      publicHolidays,
      settings.weekStartDay,
    );
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

  if (!weekReport || !fortnightReport || !prevWeekReport || !prevFortnightReport || !settings) return null;

  const hasCashJob = (jobs ?? []).some((j) => !j.taxable);
  const helpDebt = Boolean(settings.hasHelpDebt);

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

      <PayCycleCard report={fortnightReport} today={today} />

      <div className="grid gap-4 lg:grid-cols-3">
        <UpcomingShiftCard line={upcomingShift} />
        <WeekTotalCard report={weekReport} />
        <ShiftTimerCard publicHolidays={publicHolidays ?? []} />
      </div>

      {settings.goals && settings.goals.length > 0 && (
        <GoalsCard goals={settings.goals} report={fortnightReport} helpDebt={helpDebt} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TotalsCard title="This week" report={weekReport} previous={prevWeekReport} periodLabel="week" periodsPerYear={52} helpDebt={helpDebt} />
        <TotalsCard
          title="This fortnight"
          report={fortnightReport}
          previous={prevFortnightReport}
          periodLabel="fortnight"
          periodsPerYear={26}
          helpDebt={helpDebt}
        />
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        After-tax figures are an estimate (AU resident rates + Medicare levy
        {helpDebt ? ' + HECS/HELP repayment' : ''}, annualized from this period's earnings) — excludes other income
        {helpDebt ? '' : ', HECS/HELP'} and offsets not covered here.
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

/** Where you are in the current fortnight: days elapsed, earned so far, and what's still scheduled. */
function PayCycleCard({ report, today }: { report: ReturnType<typeof buildRangeReport>; today: string }) {
  const days = dateRangeStrs(report.startDate, report.endDate);
  const dayNumber = days.indexOf(today) + 1;
  const now = new Date();
  let earned = 0;
  let scheduled = 0;
  for (const line of report.shiftLines) {
    const { end } = resolveShiftTimes(line.shift.date, line.shift.startTime, line.shift.endTime);
    if (end <= now) earned += line.breakdown.finalGrossPay;
    else scheduled += line.breakdown.finalGrossPay;
  }
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-brand-600 to-brand-700 text-white dark:from-brand-600/90 dark:to-brand-800/90 dark:border-brand-700/50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-brand-100">
          <Target className="h-4 w-4" />
          <h2 className="text-sm font-medium">Pay cycle</h2>
        </div>
        <p className="text-xs font-medium text-brand-100">
          {fmt(report.startDate)} – {fmt(report.endDate)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <p className="text-3xl font-bold tracking-tight">
            <Money amount={earned} animate />
          </p>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-100">Earned so far (taxable + cash)</p>
        </div>
        {scheduled > 0 && (
          <p className="text-sm text-brand-50">
            + <Money amount={scheduled} className="font-semibold" /> scheduled
          </p>
        )}
      </div>
      <div className="mt-4">
        <div className="flex gap-1" aria-hidden>
          {days.map((d, i) => (
            <span
              key={d}
              className={`h-1.5 flex-1 rounded-full ${i < dayNumber ? 'bg-white' : 'bg-white/25'} ${
                d === today ? 'ring-2 ring-white/40' : ''
              }`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-brand-100">
          Day {dayNumber} of {days.length} ·{' '}
          {days.length === dayNumber
            ? 'last day of this cycle'
            : `${days.length - dayNumber} day${days.length - dayNumber === 1 ? '' : 's'} left`}
        </p>
      </div>
    </Card>
  );
}

/** Take-home pay this fortnight (after-tax taxable + cash) filling each goal in order. */
function GoalsCard({ goals, report, helpDebt }: { goals: Goal[]; report: ReturnType<typeof buildRangeReport>; helpDebt: boolean }) {
  const takeHome = estimateNetForPeriod(report.taxableGrossPay, 26, { helpDebt }).periodNetIncome + report.nonTaxableGrossPay;
  const needed = goals.reduce((sum, g) => sum + g.amount, 0);
  let remaining = takeHome;

  return (
    <Card>
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <PiggyBank className="h-4 w-4" />
        <h2 className="text-sm font-medium">Fortnight goals</h2>
        <span className="ml-auto text-xs">
          ≈ <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(takeHome)}</span> take-home of{' '}
          {formatCurrency(needed)}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => {
          const covered = Math.max(0, Math.min(goal.amount, remaining));
          remaining -= covered;
          const pct = goal.amount > 0 ? (covered / goal.amount) * 100 : 100;
          return (
            <div key={goal.id}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{goal.name}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                  {formatCurrency(covered)} / {formatCurrency(goal.amount)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
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
            <Money amount={line.breakdown.finalGrossPay} />
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
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100"><Money amount={report.totalGrossPay} animate /></p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Total income (taxable + cash combined)
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatHours(report.totalHours)} worked this week</p>
    </Card>
  );
}

function TrendPill({ current, previous, periodLabel }: { current: number; previous: number; periodLabel: string }) {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) {
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">New this {periodLabel}</span>;
  }
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        up
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
      }`}
      title={`Last ${periodLabel}: ${formatCurrency(previous)}`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(0)}% vs last {periodLabel}
    </span>
  );
}

function TotalsCard({
  title,
  report,
  previous,
  periodLabel,
  periodsPerYear,
  helpDebt,
}: {
  title: string;
  report: ReturnType<typeof buildRangeReport>;
  previous: ReturnType<typeof buildRangeReport>;
  periodLabel: string;
  periodsPerYear: number;
  helpDebt: boolean;
}) {
  const tax = estimateNetForPeriod(report.taxableGrossPay, periodsPerYear, { helpDebt });
  const taxableJobs = report.jobSubtotals.filter((j) => j.taxable);
  const taxableHours = taxableJobs.reduce((sum, j) => sum + j.hours, 0);
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <CalendarRange className="h-4 w-4" />
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="ml-auto">
          <TrendPill current={report.taxableGrossPay} previous={previous.taxableGrossPay} periodLabel={periodLabel} />
        </span>
      </div>
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100"><Money amount={report.taxableGrossPay} animate /></p>
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Wallet className="h-3 w-3" /> Taxable income
      </p>
      <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">≈ {formatCurrency(tax.periodNetIncome)} after tax</p>
      <p className="text-sm text-slate-400 dark:text-slate-500">{formatHours(taxableHours)} worked{report.totalSuper > 0 && ` · +${formatCurrency(report.totalSuper)} super`}</p>
      <div className="mt-3 space-y-1.5">
        {taxableJobs.map((job) => (
          <div key={job.jobId} className="flex items-center justify-between text-sm">
            <Badge color={job.color}>{job.jobName}</Badge>
            <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(job.grossPay)}</span>
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
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100"><Money amount={report.nonTaxableGrossPay} animate /></p>
      <p className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">Cash-in-hand, untaxed</p>
      <p className="text-sm text-slate-400 dark:text-slate-500">{formatHours(cashHours)} worked</p>
      <div className="mt-3 space-y-1.5">
        {cashJobs.map((job) => (
          <div key={job.jobId} className="flex items-center justify-between text-sm">
            <Badge color={job.color}>{job.jobName}</Badge>
            <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(job.grossPay)}</span>
          </div>
        ))}
        {cashJobs.length === 0 && <EmptyState icon={<Banknote className="h-5 w-5" />} title="No cash shifts yet" />}
      </div>
    </Card>
  );
}
