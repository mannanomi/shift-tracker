import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Play, Square, Timer, X } from 'lucide-react';
import type { PublicHoliday, Shift } from '../../types';
import { useActiveJobs, useJobs } from '../../hooks/useData';
import { useNow, useShiftTimer } from '../../hooks/useShiftTimer';
import { shiftsRepo } from '../../db/repository';
import { computeWeekPay } from '../../lib/payCalculation/engine';
import { formatDateOnly } from '../../lib/dateUtils';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Money } from '../ui/Money';
import { haptic, toast } from '../ui/Toast';

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftBetween(jobId: string, start: Date, end: Date): Shift {
  return {
    id: crypto.randomUUID(),
    jobId,
    date: formatDateOnly(start),
    startTime: format(start, 'HH:mm'),
    endTime: format(end, 'HH:mm'),
    unpaidBreakMinutes: 0,
    isPublicHolidayOverride: null,
    notes: '',
  };
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Start a shift now and watch earnings build up; ending it logs the shift. */
export function ShiftTimerCard({ publicHolidays }: { publicHolidays: PublicHoliday[] }) {
  const activeJobs = useActiveJobs();
  const allJobs = useJobs();
  const { timer, start, stop } = useShiftTimer();
  const now = useNow(Boolean(timer));
  const [pickedJobId, setPickedJobId] = useState<string | null>(null);

  const job = timer ? allJobs?.find((j) => j.id === timer.jobId) : undefined;
  const startedAt = timer ? new Date(timer.startedAt) : null;
  const elapsed = startedAt ? now.getTime() - startedAt.getTime() : 0;

  const liveEarnings = useMemo(() => {
    if (!job || !startedAt || elapsed < 60_000) return 0;
    const end = elapsed >= DAY_MS ? new Date(startedAt.getTime() + DAY_MS - 60_000) : now;
    const shift = shiftBetween(job.id, startedAt, end);
    return computeWeekPay([shift], job, publicHolidays).shiftBreakdowns[0]?.finalGrossPay ?? 0;
    // `now` ticks every second; recomputing from it keeps the figure live.
  }, [job, timer?.startedAt, now, publicHolidays]);

  async function endShift() {
    if (!job || !startedAt) return;
    const end = new Date();
    if (format(end, 'HH:mm') === format(startedAt, 'HH:mm') || end.getTime() - startedAt.getTime() >= DAY_MS) {
      toast(end.getTime() - startedAt.getTime() >= DAY_MS ? 'Timer ran over 24 hours — add this shift manually' : 'Shift was under a minute — not saved');
      stop();
      return;
    }
    await shiftsRepo.put(shiftBetween(job.id, startedAt, end));
    stop();
    haptic();
    toast(`${job.name} shift saved`);
  }

  const jobs = activeJobs ?? [];
  const selectedId = pickedJobId ?? jobs[0]?.id ?? null;

  return (
    <Card>
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <Timer className="h-4 w-4" />
        <h2 className="text-sm font-medium">Shift timer</h2>
        {timer && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-label="Running" />}
      </div>

      {timer && job ? (
        <div className="mt-2">
          <Badge color={job.color}>{job.name}</Badge>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <p className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatElapsed(elapsed)}</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              <Money amount={liveEarnings} />
            </p>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Started {format(startedAt!, 'h:mm a')} · earnings so far (no break)</p>
          <div className="mt-3 flex gap-2">
            <Button icon={<Square className="h-3.5 w-3.5" />} onClick={endShift}>
              End &amp; save
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
      ) : jobs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">Add a job to use the timer.</p>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => setPickedJobId(j.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedId === j.id
                    ? 'border-transparent text-white'
                    : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
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
              haptic();
            }}
          >
            Start shift now
          </Button>
        </div>
      )}
    </Card>
  );
}
