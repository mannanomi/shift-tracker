import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { Banknote, PiggyBank, Plus, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { Goal } from '../types';
import { useJobs, usePublicHolidays, useSettings, useShifts } from '../hooks/useData';
import { buildRangeReport, type RangeReport, type ShiftLine } from '../lib/payCalculation/reports';
import {
  dateRangeStrs,
  endOfFortnightStr,
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
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Money } from '../components/ui/Money';
import { LogoMark } from '../components/ui/Logo';
import { SyncChip } from '../components/ui/SyncChip';
import { ShiftForm } from '../components/shifts/ShiftForm';
import { NextShiftCard } from '../components/dashboard/NextShiftCard';

/** How far ahead to look for the next planned shift. */
const NEXT_SHIFT_LOOKAHEAD_DAYS = 30;

export function Dashboard() {
  const jobs = useJobs();
  const shifts = useShifts();
  const publicHolidays = usePublicHolidays();
  const settings = useSettings();
  const [addingShift, setAddingShift] = useState(false);

  const today = formatDateOnly(new Date());

  const reports = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    const build = (start: string, end: string) => buildRangeReport(start, end, jobs, shifts, publicHolidays, settings.weekStartDay);
    const lastWeek = formatDateOnly(addDays(parseDateOnly(today), -7));
    return {
      week: build(startOfWeekStr(today, settings.weekStartDay), endOfWeekStr(today, settings.weekStartDay)),
      prevWeek: build(startOfWeekStr(lastWeek, settings.weekStartDay), endOfWeekStr(lastWeek, settings.weekStartDay)),
      fortnight: build(startOfFortnightStr(today, settings.fortnightAnchorDate), endOfFortnightStr(today, settings.fortnightAnchorDate)),
      // From yesterday, so an overnight shift that started yesterday and is still running counts.
      upcoming: build(
        formatDateOnly(addDays(parseDateOnly(today), -1)),
        formatDateOnly(addDays(parseDateOnly(today), NEXT_SHIFT_LOOKAHEAD_DAYS)),
      ),
    };
  }, [jobs, shifts, publicHolidays, settings, today]);

  const nextShift: ShiftLine | null = useMemo(() => {
    if (!reports) return null;
    const now = new Date();
    const pending = reports.upcoming.shiftLines
      .map((line) => ({ line, ...resolveShiftTimes(line.shift.date, line.shift.startTime, line.shift.endTime) }))
      .filter(({ end }) => end > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return pending[0]?.line ?? null;
  }, [reports]);

  if (!reports || !settings) return null;

  const hasCashJob = (jobs ?? []).some((j) => !j.taxable);
  const helpDebt = Boolean(settings.hasHelpDebt);
  const goals = settings.goals ?? [];

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-center gap-3">
        <LogoMark className="h-10 w-10 lg:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl dark:text-slate-100">
            <span className="lg:hidden">Shiftly</span>
            <span className="hidden lg:inline">{greeting()}</span>
          </h1>
          <p className="text-xs text-slate-500 lg:text-sm dark:text-slate-400">
            {parseDateOnly(today).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <SyncChip />
        <div className="hidden lg:block">
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddingShift(true)}>
            Add shift
          </Button>
        </div>
      </div>

      <div className="grid grid-flow-row-dense gap-4 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2">
          <PayCycleHero report={reports.fortnight} today={today} helpDebt={helpDebt} />
        </div>
        <div className="lg:col-span-2">
          <KpiStrip week={reports.week} prevWeek={reports.prevWeek} />
        </div>
        <NextShiftCard next={nextShift} publicHolidays={publicHolidays ?? []} />
        {goals.length > 0 && <GoalsCard goals={goals} report={reports.fortnight} helpDebt={helpDebt} />}
        {hasCashJob && (
          <div className="lg:col-start-3">
            <CashStrip week={reports.week} fortnight={reports.fortnight} />
          </div>
        )}
        <div className="lg:col-span-2">
          <TaxableSummary week={reports.week} fortnight={reports.fortnight} helpDebt={helpDebt} />
        </div>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        After-tax figures are an estimate (AU resident rates + Medicare levy{helpDebt ? ' + HECS/HELP' : ''}, annualized from
        each period's taxable earnings). Cash income is kept separate and not taxed or added to taxable totals.
      </p>

      {addingShift && (
        <Modal title="Add shift" onClose={() => setAddingShift(false)}>
          <ShiftForm onDone={() => setAddingShift(false)} />
        </Modal>
      )}
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtShort(date: string) {
  return parseDateOnly(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** The current fortnight: earned so far, what's scheduled, and where you are in the cycle. */
function PayCycleHero({ report, today, helpDebt }: { report: RangeReport; today: string; helpDebt: boolean }) {
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
  const afterTax = estimateNetForPeriod(report.taxableGrossPay, 26, { helpDebt }).periodNetIncome;
  const daysLeft = days.length - dayNumber;

  return (
    <div className="animate-fade-up rounded-3xl bg-brand-600 p-5 text-white lg:p-6">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-brand-100">
        <span>
          Pay cycle · {fmtShort(report.startDate)} – {fmtShort(report.endDate)}
        </span>
        <span>
          Day {dayNumber} of {days.length}
        </span>
      </div>
      <p className="mt-2 text-4xl font-bold tracking-tight lg:text-5xl">
        <Money amount={earned} animate />
      </p>
      <p className="text-sm text-brand-100">
        earned so far
        {scheduled > 0 && (
          <>
            {' · '}
            <span className="font-semibold text-white">
              +<Money amount={scheduled} /> scheduled
            </span>
          </>
        )}
      </p>

      <div className="mt-4 flex gap-1" aria-hidden>
        {days.map((d, i) => (
          <span key={d} className={`h-1.5 flex-1 rounded-full ${i < dayNumber ? 'bg-white' : 'bg-white/25'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-brand-100">{daysLeft === 0 ? 'Last day of this cycle' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</p>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-3">
        <HeroStat label="After tax ≈" value={formatCurrency(afterTax)} />
        <HeroStat label="Cash" value={formatCurrency(report.nonTaxableGrossPay)} />
        <HeroStat label="Hours" value={formatHours(report.totalHours)} />
      </div>
      <p className="mt-1.5 text-[11px] text-brand-100/80">Whole fortnight, including scheduled shifts</p>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-brand-100">{label}</p>
      <p className="truncate font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function trend(current: number, previous: number) {
  if (previous === 0) return current > 0 ? { text: 'New', up: true } : null;
  const pct = ((current - previous) / previous) * 100;
  return { text: `${Math.abs(pct).toFixed(0)}%`, up: pct >= 0 };
}

/** This week at a glance: total earned (with trend), hours, average hourly rate. */
function KpiStrip({ week, prevWeek }: { week: RangeReport; prevWeek: RangeReport }) {
  const t = trend(week.totalGrossPay, prevWeek.totalGrossPay);
  const shiftCount = week.shiftLines.length;
  return (
    <div className="grid grid-cols-3 gap-3">
      <Kpi
        label="This week"
        value={<Money amount={week.totalGrossPay} animate />}
        hint={
          t ? (
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${t.up ? 'text-brand-600 dark:text-brand-400' : 'text-rose-600 dark:text-rose-400'}`}
              title={`Last week: ${formatCurrency(prevWeek.totalGrossPay)}`}
            >
              {t.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {t.text}
            </span>
          ) : (
            'taxable + cash'
          )
        }
      />
      <Kpi label="Hours" value={formatHours(week.totalHours)} hint={`${shiftCount} shift${shiftCount === 1 ? '' : 's'}`} />
      <Kpi
        label="Avg rate"
        value={week.totalHours > 0 ? `${formatCurrency(week.totalGrossPay / week.totalHours).replace(/\.\d+$/, '')}/h` : '—'}
        hint="all jobs"
      />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint: React.ReactNode }) {
  return (
    <Card className="p-3! lg:p-4!">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular-nums tracking-tight text-slate-900 lg:text-2xl dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>
    </Card>
  );
}

/** Take-home pay this fortnight (after-tax taxable + cash) filling each goal in order. */
function GoalsCard({ goals, report, helpDebt }: { goals: Goal[]; report: RangeReport; helpDebt: boolean }) {
  const takeHome = estimateNetForPeriod(report.taxableGrossPay, 26, { helpDebt }).periodNetIncome + report.nonTaxableGrossPay;
  const needed = goals.reduce((sum, g) => sum + g.amount, 0);
  let remaining = takeHome;

  return (
    <Card>
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <PiggyBank className="h-4 w-4" />
        <h2 className="text-sm font-medium">Fortnight goals</h2>
        <span className="ml-auto text-xs tabular-nums">
          {formatCurrency(Math.min(takeHome, needed))} of {formatCurrency(needed)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 text-sm">
        {goals.map((goal) => {
          const covered = Math.max(0, Math.min(goal.amount, remaining));
          remaining -= covered;
          const pct = goal.amount > 0 ? (covered / goal.amount) * 100 : 100;
          return (
            <div key={goal.id} className="contents" title={`${formatCurrency(covered)} of ${formatCurrency(goal.amount)}`}>
              <span className="font-medium text-slate-700 dark:text-slate-200">{goal.name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-brand-50 dark:bg-slate-700">
                <span
                  className={`block h-full rounded-full transition-[width] duration-700 ${pct >= 100 ? 'bg-brand-600 dark:bg-brand-400' : 'bg-brand-400 dark:bg-brand-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-10 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{Math.round(pct)}%</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Cash-in-hand income, kept visually apart from taxable income. */
function CashStrip({ week, fortnight }: { week: RangeReport; fortnight: RangeReport }) {
  return (
    <div className="animate-fade-up flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <Banknote className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Cash income</p>
        <p className="text-xs text-amber-700/80 dark:text-amber-400/80">Untaxed, not in taxable totals</p>
      </div>
      <div className="text-right text-xs">
        <p>
          Week <span className="text-sm font-semibold tabular-nums">{formatCurrency(week.nonTaxableGrossPay)}</span>
        </p>
        <p>
          Fortnight <span className="text-sm font-semibold tabular-nums">{formatCurrency(fortnight.nonTaxableGrossPay)}</span>
        </p>
      </div>
    </div>
  );
}

/** Taxable income for the week and fortnight, with the after-tax estimate and per-job split. */
function TaxableSummary({ week, fortnight, helpDebt }: { week: RangeReport; fortnight: RangeReport; helpDebt: boolean }) {
  const jobs = fortnight.jobSubtotals.filter((j) => j.taxable);
  const weekByJob = new Map(week.jobSubtotals.map((j) => [j.jobId, j.grossPay]));
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <Wallet className="h-4 w-4" />
        <h2 className="text-sm font-medium">Taxable income</h2>
      </div>
      <div className="mt-3 grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-700">
        <TaxableColumn title="This week" report={week} periodsPerYear={52} helpDebt={helpDebt} />
        <div className="pl-4">
          <TaxableColumn title="This fortnight" report={fortnight} periodsPerYear={26} helpDebt={helpDebt} />
        </div>
      </div>
      {jobs.length > 0 && (
        <table className="mt-3 w-full border-t border-slate-100 text-xs dark:border-slate-700">
          <thead>
            <tr className="text-slate-400 dark:text-slate-500">
              <th className="pb-1 pt-2 text-left font-medium">By job</th>
              <th className="pb-1 pt-2 text-right font-medium">Week</th>
              <th className="pb-1 pt-2 text-right font-medium">Fortnight</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.jobId}>
                <td className="py-1">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: j.color }} />
                    <span className="truncate">{j.jobName}</span>
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatCurrency(weekByJob.get(j.jobId) ?? 0)}</td>
                <td className="py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatCurrency(j.grossPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function TaxableColumn({ title, report, periodsPerYear, helpDebt }: { title: string; report: RangeReport; periodsPerYear: number; helpDebt: boolean }) {
  const net = estimateNetForPeriod(report.taxableGrossPay, periodsPerYear, { helpDebt }).periodNetIncome;
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-400 dark:text-slate-500">{title}</p>
      <p className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl dark:text-slate-100">
        <Money amount={report.taxableGrossPay} />
      </p>
      <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">After tax ≈</p>
      <p className="text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400">{formatCurrency(net)}</p>
      {report.totalSuper > 0 && <p className="text-xs text-slate-400 dark:text-slate-500">+{formatCurrency(report.totalSuper)} super</p>}
    </div>
  );
}
