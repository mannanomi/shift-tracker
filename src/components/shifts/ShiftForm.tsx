import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { Briefcase, Check, Clock, Repeat } from 'lucide-react';
import type { Shift } from '../../types';
import { useActiveJobs, useShifts } from '../../hooks/useData';
import { shiftsRepo } from '../../db/repository';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { EmptyState } from '../ui/EmptyState';
import { formatDateOnly, parseDateOnly } from '../../lib/dateUtils';
import { haptic, toast } from '../ui/Toast';

const MAX_TIME_PRESETS = 4;

function emptyShift(jobId: string, date: string): Shift {
  return {
    id: crypto.randomUUID(),
    jobId,
    date,
    startTime: '09:00',
    endTime: '17:00',
    unpaidBreakMinutes: 0,
    isPublicHolidayOverride: null,
    notes: '',
  };
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, '0')}${period}`;
}

/** Most recently used distinct start/end time pairs for a job, newest first. */
function recentTimePresets(shifts: Shift[], jobId: string): { startTime: string; endTime: string }[] {
  const jobShifts = [...shifts]
    .filter((s) => s.jobId === jobId)
    .sort((a, b) => (b.date === a.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date)));

  const seen = new Set<string>();
  const presets: { startTime: string; endTime: string }[] = [];
  for (const s of jobShifts) {
    const key = `${s.startTime}-${s.endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    presets.push({ startTime: s.startTime, endTime: s.endTime });
    if (presets.length >= MAX_TIME_PRESETS) break;
  }
  return presets;
}

type RepeatMode = 'none' | 'weekly' | 'fortnightly';

export function ShiftForm({
  shift,
  initialDate,
  template,
  onDone,
}: {
  shift?: Shift;
  /** Pre-fills the date field for a new shift (ignored when editing an existing one). */
  initialDate?: string;
  /** Pre-fills a new shift from another one (job, times, break, notes) — used by "Copy". */
  template?: Partial<Omit<Shift, 'id'>>;
  onDone: () => void;
}) {
  const jobs = useActiveJobs();
  const allShifts = useShifts();
  const [form, setForm] = useState<Shift>(
    () => shift ?? { ...emptyShift('', initialDate ?? formatDateOnly(new Date())), ...template },
  );
  const [repeat, setRepeat] = useState<RepeatMode>('none');
  const [repeatCount, setRepeatCount] = useState(4);

  if (form.jobId === '' && jobs && jobs.length > 0 && !shift) {
    setForm((prev) => ({ ...prev, jobId: jobs[0].id }));
  }

  function update<K extends keyof Shift>(key: K, value: Shift[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyTimePreset(startTime: string, endTime: string) {
    setForm((prev) => ({ ...prev, startTime, endTime }));
  }

  const timePresets = useMemo(
    () => (allShifts ? recentTimePresets(allShifts, form.jobId) : []),
    [allShifts, form.jobId],
  );

  const selectedJob = jobs?.find((j) => j.id === form.jobId);
  const isAbn = selectedJob?.kind === 'abn';

  /** Switching jobs keeps what's entered; an ABN entry has no times, so give an hourly job defaults. */
  function selectJob(jobId: string) {
    setForm((prev) => ({ ...prev, jobId, ...(prev.startTime === '' ? { startTime: '09:00', endTime: '17:00' } : {}) }));
  }

  /** ABN entries keep only the amount (and optional hours); hourly shifts drop those fields. */
  function toRecord(): Shift {
    if (isAbn) {
      return {
        ...form,
        startTime: '',
        endTime: '',
        unpaidBreakMinutes: 0,
        isPublicHolidayOverride: null,
        earnings: Math.round((form.earnings ?? 0) * 100) / 100,
        hoursWorked: form.hoursWorked && form.hoursWorked > 0 ? form.hoursWorked : undefined,
      };
    }
    const { earnings: _earnings, hoursWorked: _hours, ...hourly } = form;
    return hourly;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const record = toRecord();
    await shiftsRepo.put(record);
    let extra = 0;
    if (!shift && !isAbn && repeat !== 'none') {
      const step = repeat === 'weekly' ? 7 : 14;
      for (let i = 1; i <= repeatCount; i++) {
        await shiftsRepo.put({
          ...record,
          id: crypto.randomUUID(),
          date: formatDateOnly(addDays(parseDateOnly(record.date), step * i)),
        });
        extra++;
      }
    }
    haptic();
    if (isAbn) toast(shift ? 'Earnings updated' : `${selectedJob?.name ?? 'ABN'} earnings added`);
    else toast(extra > 0 ? `Saved ${extra + 1} shifts` : shift ? 'Shift updated' : 'Shift added');
    onDone();
  }

  if (!jobs) return null;
  if (jobs.length === 0) {
    return <EmptyState icon={<Briefcase className="h-5 w-5" />} title="No jobs yet" subtitle="Add a job first before logging shifts" />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Job">
        <div className="flex flex-wrap gap-2">
          {jobs.map((job) => {
            const selected = form.jobId === job.id;
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => selectJob(job.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-transparent text-white'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500'
                }`}
                style={selected ? { backgroundColor: job.color } : undefined}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: selected ? 'rgba(255,255,255,0.8)' : job.color }}
                />
                {job.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Date">
        <Input type="date" required value={form.date} onChange={(e) => update('date', e.target.value)} />
      </Field>

      {isAbn ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount earned ($)">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                autoFocus={!shift}
                value={form.earnings ?? ''}
                onChange={(e) => update('earnings', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="0.00"
              />
            </Field>
            <Field label="Hours worked (optional)">
              <Input
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                value={form.hoursWorked ?? ''}
                onChange={(e) => update('hoursWorked', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="e.g. 4.5"
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-slate-400 dark:text-slate-500">
            Your total for the day, including tips, as shown in your {selectedJob?.name ?? 'app'} earnings. Hours let Shiftly
            work out your $/hr.
          </p>
        </>
      ) : (
        <>
          {timePresets.length > 0 && (
            <div>
              <span className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> Recent times
              </span>
              <div className="flex flex-wrap gap-2">
                {timePresets.map((preset) => {
                  const selected = form.startTime === preset.startTime && form.endTime === preset.endTime;
                  return (
                    <button
                      key={`${preset.startTime}-${preset.endTime}`}
                      type="button"
                      onClick={() => applyTimePreset(preset.startTime, preset.endTime)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      {formatTimeLabel(preset.startTime)}–{formatTimeLabel(preset.endTime)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start time">
              <Input type="time" required value={form.startTime} onChange={(e) => update('startTime', e.target.value)} />
            </Field>
            <Field label="End time">
              <Input type="time" required value={form.endTime} onChange={(e) => update('endTime', e.target.value)} />
            </Field>
          </div>

          <Field label="Unpaid break (minutes)">
            <Input
              type="number"
              min="0"
              step="5"
              value={form.unpaidBreakMinutes}
              onChange={(e) => update('unpaidBreakMinutes', Number(e.target.value))}
            />
          </Field>

          <Field label="Public holiday">
            <Select
              value={form.isPublicHolidayOverride === null ? 'auto' : form.isPublicHolidayOverride ? 'yes' : 'no'}
              onChange={(e) =>
                update('isPublicHolidayOverride', e.target.value === 'auto' ? null : e.target.value === 'yes')
              }
            >
              <option value="auto">Auto-detect from holiday list</option>
              <option value="yes">Force: is a public holiday</option>
              <option value="no">Force: is NOT a public holiday</option>
            </Select>
          </Field>
        </>
      )}

      {!shift && !isAbn && (
        <div>
          <span className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Repeat className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> Repeat
          </span>
          <div className={`grid gap-2 ${repeat !== 'none' ? 'grid-cols-[minmax(0,1fr)_auto]' : ''}`}>
            <Select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatMode)}>
              <option value="none">Don't repeat</option>
              <option value="weekly">Every week</option>
              <option value="fortnightly">Every fortnight</option>
            </Select>
            {repeat !== 'none' && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Input
                  type="number"
                  min="1"
                  max="26"
                  className="w-20"
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
                  aria-label="Number of repeats"
                />
                more
              </div>
            )}
          </div>
        </div>
      )}

      <Field label="Notes (optional)">
        <Input value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Optional notes" />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" icon={<Check className="h-4 w-4" />}>
          {isAbn ? 'Save earnings' : 'Save shift'}
        </Button>
      </div>
    </form>
  );
}
