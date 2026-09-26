import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { Plus, SlidersHorizontal, Zap } from 'lucide-react';
import type { Job, Shift } from '../../types';
import { useActiveJobs, useShifts } from '../../hooks/useData';
import { shiftsRepo } from '../../db/repository';
import { formatDateOnly } from '../../lib/dateUtils';
import { Sheet } from '../ui/Sheet';
import { EmptyState } from '../ui/EmptyState';
import { haptic, toast } from '../ui/Toast';

const MAX_TEMPLATES = 6;

interface Template {
  job: Job;
  startTime: string;
  endTime: string;
  unpaidBreakMinutes: number;
}

function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Most recent distinct job + time combinations, newest first. */
function recentTemplates(shifts: Shift[], jobs: Job[]): Template[] {
  const jobsById = new Map(jobs.map((j) => [j.id, j]));
  const sorted = [...shifts].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  const seen = new Set<string>();
  const out: Template[] = [];
  for (const s of sorted) {
    const job = jobsById.get(s.jobId);
    if (!job) continue;
    const key = `${s.jobId}|${s.startTime}|${s.endTime}|${s.unpaidBreakMinutes}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ job, startTime: s.startTime, endTime: s.endTime, unpaidBreakMinutes: s.unpaidBreakMinutes });
    if (out.length >= MAX_TEMPLATES) break;
  }
  return out;
}

/** One-tap logging of a shift you've worked before. */
export function QuickAddSheet({ onClose, onMoreOptions }: { onClose: () => void; onMoreOptions: (date: string) => void }) {
  const jobs = useActiveJobs();
  const shifts = useShifts();
  const today = new Date();
  const dayOptions = [
    { label: 'Yesterday', date: formatDateOnly(addDays(today, -1)) },
    { label: 'Today', date: formatDateOnly(today) },
    { label: 'Tomorrow', date: formatDateOnly(addDays(today, 1)) },
  ];
  const [date, setDate] = useState(dayOptions[1].date);
  const templates = useMemo(() => (jobs && shifts ? recentTemplates(shifts, jobs) : []), [jobs, shifts]);

  async function add(t: Template) {
    const shift: Shift = {
      id: crypto.randomUUID(),
      jobId: t.job.id,
      date,
      startTime: t.startTime,
      endTime: t.endTime,
      unpaidBreakMinutes: t.unpaidBreakMinutes,
      isPublicHolidayOverride: null,
      notes: '',
    };
    await shiftsRepo.put(shift);
    haptic();
    toast(`${t.job.name} shift added`, { label: 'Undo', onClick: () => void shiftsRepo.remove(shift.id) });
    onClose();
  }

  return (
    <Sheet title="Quick add" onClose={onClose}>
      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-900/60">
        {dayOptions.map((opt) => (
          <button
            key={opt.date}
            onClick={() => setDate(opt.date)}
            className={`rounded-lg py-1.5 text-sm font-medium transition-colors ${
              date === opt.date
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-5 w-5" />}
          title="No recent shifts yet"
          subtitle="Once you've logged a shift, it shows up here for one-tap adding"
        />
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <button
              key={`${t.job.id}|${t.startTime}|${t.endTime}|${t.unpaidBreakMinutes}`}
              onClick={() => add(t)}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-700/40"
            >
              <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.job.color }} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-900 dark:text-slate-100">{t.job.name}</span>
                <span className="block text-sm text-slate-500 dark:text-slate-400">
                  {timeLabel(t.startTime)} – {timeLabel(t.endTime)}
                  {t.unpaidBreakMinutes > 0 && ` · ${t.unpaidBreakMinutes}m break`}
                </span>
              </span>
              <Plus className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => onMoreOptions(date)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
      >
        <SlidersHorizontal className="h-4 w-4" /> Custom shift…
      </button>
    </Sheet>
  );
}
