import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { CalendarClock, Play, Square, X } from 'lucide-react';
import type { PublicHoliday, Shift } from '../../types';
import type { ShiftLine } from '../../lib/payCalculation/reports';
import { useActiveJobs, useJobs, useShifts } from '../../hooks/useData';
import { useNow, useShiftTimer } from '../../hooks/useShiftTimer';
import { shiftsRepo } from '../../db/repository';
import { computeWeekPay } from '../../lib/payCalculation/engine';
import { formatDateOnly, resolveShiftTimes } from '../../lib/dateUtils';
import { formatHours } from '../../lib/format';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Money } from '../ui/Money';
import { haptic, toast } from '../ui/Toast';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A planned shift gets a one-tap Start button once it's this close (or already under way). */
const START_WINDOW_MS = 12 * 60 * 60 * 1000;

function shiftTimes(start: Date, end: Date) {
  return { date: formatDateOnly(start), startTime: format(start, 'HH:mm'), endTime: format(end, 'HH:mm') };
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timeLabel(time: string) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

function whenLabel(line: ShiftLine, now: Date) {
  const { start, end } = resolveShiftTimes(line.shift.date, line.shift.startTime, line.shift.endTime);
  if (start <= now && now < end) return `Now · ends ${timeLabel(line.shift.endTime)}`;
  const today = formatDateOnly(now);
  if (line.shift.date === today) return start.getHours() >= 17 ? 'Tonight' : 'Today';
  if (line.shift.date === formatDateOnly(addDays(now, 1))) return 'Tomorrow';
  return start.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
}

/**
 * The next planned shift, with a Start button that runs the shift timer; while the timer runs,
 * the card shows it counting up. Ending a timer started from a planned shift updates that
 * shift's times rather than adding a second one.
 */
export function NextShiftCard({ next, publicHolidays }: { next: ShiftLine | null; publicHolidays: PublicHoliday[] }) {
  const activeJobs = useActiveJobs();
  const allJobs = useJobs();
  const allShifts = useShifts();
  const { timer, start, stop } = useShiftTimer();
  const now = useNow(true, timer ? 1000 : 60_000);
  const [picking, setPicking] = useState(false);
  const [pickedJobId, setPickedJobId] = useState<string | null>(null);

  const job = timer ? allJobs?.find((j) => j.id === timer.jobId) : undefined;
  const startedAt = timer ? new Date(timer.startedAt) : null;
  const elapsed = startedAt ? now.getTime() - startedAt.getTime() : 0;
  // When started from a planned shift, show progress against its planned length.
  const plannedShift = timer?.shiftId ? allShifts?.find((sh) => sh.id === timer.shiftId) : undefined;
  const plannedMs = plannedShift
    ? (() => {
        const { start: ps, end: pe } = resolveShiftTimes(plannedShift.date, plannedShift.startTime, plannedShift.endTime);
        return pe.getTime() - ps.getTime();
      })()
    : 0;
  const plannedPct = plannedMs > 0 ? Math.min(100, (elapsed / plannedMs) * 100) : 0;

  const liveEarnings = useMemo(() => {
    if (!job || !startedAt || elapsed < 60_000) return 0;
    const end = elapsed >= DAY_MS ? new Date(startedAt.getTime() + DAY_MS - 60_000) : now;
    const shift: Shift = {
      id: 'live',
      jobId: job.id,
      ...shiftTimes(startedAt, end),
      unpaidBreakMinutes: 0,
      isPublicHolidayOverride: null,
      notes: '',
    };
    return computeWeekPay([shift], job, publicHolidays).shiftBreakdowns[0]?.finalGrossPay ?? 0;
    // `now` ticks every second while the timer runs; recomputing from it keeps the figure live.
  }, [job, timer?.startedAt, now, publicHolidays]);

  async function endShift() {
    if (!job || !startedAt || !timer) return;
    const end = new Date();
    const ms = end.getTime() - startedAt.getTime();
    if (format(end, 'HH:mm') === format(startedAt, 'HH:mm') || ms >= DAY_MS) {
      toast(ms >= DAY_MS ? 'Timer ran over 24 hours. Add this shift manually.' : 'Shift was under a minute, so it wasn’t saved');
      stop();
      return;
    }
    const planned = timer.shiftId ? allShifts?.find((s) => s.id === timer.shiftId) : undefined;
    if (planned) {
      await shiftsRepo.put({ ...planned, ...shiftTimes(startedAt, end) });
    } else {
      await shiftsRepo.put({
        id: crypto.randomUUID(),
        jobId: job.id,
        ...shiftTimes(startedAt, end),
        unpaidBreakMinutes: 0,
        isPublicHolidayOverride: null,
        notes: '',
      });
    }
    stop();
    haptic();
    toast(planned ? `${job.name} shift updated with actual times` : `${job.name} shift saved`);
  }

  const jobs = activeJobs ?? [];
  const selectedId = pickedJobId ?? next?.job.id ?? jobs[0]?.id ?? null;
  const nextStart = next ? resolveShiftTimes(next.shift.date, next.shift.startTime, next.shift.endTime).start : null;
  const canStartNext = Boolean(next && nextStart && nextStart.getTime() - now.getTime() <= START_WINDOW_MS);

  const header = (
    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
      <CalendarClock className="h-4 w-4" />
      <h2 className="text-sm font-medium">{timer ? 'Shift in progress' : 'Next shift'}</h2>
      {timer && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-label="Running" />}
    </div>
  );

  if (timer && job && startedAt) {
    return (
      <Card>
        {header}
        <div className="mt-2">
          <Badge color={job.color}>{job.name}</Badge>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <p className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatElapsed(elapsed)}</p>
            <p className="text-xl font-bold text-brand-600 dark:text-brand-400">
              <Money amount={liveEarnings} animate />
            </p>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Started {format(startedAt, 'h:mm a')} · earned so far (no break)</p>
          {plannedShift && plannedMs > 0 && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className="relative h-full overflow-hidden rounded-full bg-brand-600 transition-[width] duration-1000 ease-linear dark:bg-brand-400"
                  style={{ width: `${plannedPct}%` }}
                >
                  <span className="animate-shimmer absolute inset-0 bg-[linear-gradient(90deg,transparent_25%,rgba(255,255,255,0.45)_50%,transparent_75%)] bg-size-[200%_100%]" />
                </div>
              </div>
              <p className="mt-1 flex justify-between text-xs tabular-nums text-slate-400 dark:text-slate-500">
                <span>{Math.floor(plannedPct)}% of planned {formatHours(plannedMs / 3_600_000)}</span>
                <span>Planned end {timeLabel(plannedShift.endTime)}</span>
              </p>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button icon={<Square className="h-3.5 w-3.5" />} onClick={endShift}>
              End and save
            </Button>
            <Button
              variant="ghost"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => {
                if (confirm('Discard this running shift?')) stop();
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const picker = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {jobs.map((j) => (
          <button
            key={j.id}
            onClick={() => setPickedJobId(j.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedId === j.id ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
            }`}
            style={selectedId === j.id ? { backgroundColor: j.color } : undefined}
          >
            {j.name}
          </button>
        ))}
      </div>
      <Button
        variant="secondary"
        icon={<Play className="h-3.5 w-3.5" />}
        onClick={() => {
          if (!selectedId) return;
          start(selectedId);
          setPicking(false);
          haptic();
        }}
      >
        Start shift now
      </Button>
    </div>
  );

  return (
    <Card>
      {header}
      {next ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: next.job.color }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-brand-700 dark:text-brand-400">{whenLabel(next, now)}</p>
              <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{next.job.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {timeLabel(next.shift.startTime)} – {timeLabel(next.shift.endTime)} · {formatHours(next.breakdown.workedHours)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                <Money amount={next.breakdown.finalGrossPay} />
              </p>
              {canStartNext && (
                <button
                  onClick={() => {
                    start(next.job.id, next.shift.id);
                    haptic();
                  }}
                  className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  <Play className="h-3 w-3" /> Start
                </button>
              )}
            </div>
          </div>
          {jobs.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-700">
              {picking ? (
                picker
              ) : (
                <button onClick={() => setPicking(true)} className="text-xs font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400">
                  Start a different shift
                </button>
              )}
            </div>
          )}
        </>
      ) : jobs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">Add a job to start tracking shifts.</p>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming shifts planned. Start one now:</p>
          {picker}
        </div>
      )}
    </Card>
  );
}
