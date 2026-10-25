import { useMemo, useState } from 'react';
import { addDays, addMonths } from 'date-fns';
import { CalendarPlus, Repeat, Trash2 } from 'lucide-react';
import type { Roster } from '../../types';
import { useActiveJobs, useJobs, useSettings, useShifts } from '../../hooks/useData';
import { settingsRepo, shiftsRepo } from '../../db/repository';
import { formatDateOnly, parseDateOnly } from '../../lib/dateUtils';
import { buildRosterShifts, rosterKindOn } from '../../lib/roster';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { haptic, toast } from '../ui/Toast';

const KIND_CHIP = {
  day: { label: 'D', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300', title: 'Day shift' },
  night: { label: 'N', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300', title: 'Night shift' },
  off: { label: '–', className: 'bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-500', title: 'Day off' },
} as const;

function niceDate(date: string) {
  return parseDateOnly(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Set up a repeating roster (e.g. 2 days, 2 nights, 4 off) that fills the calendar with shifts. */
export function RosterManager({ onDone }: { onDone: () => void }) {
  const settings = useSettings();
  const allJobs = useJobs();
  const activeJobs = useActiveJobs();
  const shifts = useShifts();
  const today = formatDateOnly(new Date());
  const hourlyJobs = (activeJobs ?? []).filter((j) => j.kind !== 'abn');

  const [draft, setDraft] = useState(() => ({
    jobId: '',
    days: 2,
    nights: 2,
    off: 4,
    dayStart: '06:00',
    dayEnd: '18:00',
    nightStart: '18:00',
    nightEnd: '06:00',
    unpaidBreakMinutes: 0,
    startDate: today,
    months: 3,
  }));
  const jobId = draft.jobId || hourlyJobs[0]?.id || '';
  // Which action is running ('create' or a roster id), so its button can show progress.
  const [busy, setBusy] = useState<string | null>(null);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const until = formatDateOnly(addMonths(parseDateOnly(today), draft.months));
  const from = draft.startDate > today ? draft.startDate : today;
  const preview = useMemo(() => {
    const roster: Roster = { ...draft, id: 'preview', jobId, generatedUntil: until };
    const next = Array.from({ length: 8 }, (_, i) => {
      const date = formatDateOnly(addDays(parseDateOnly(from), i));
      return { date, kind: rosterKindOn(roster, date) };
    });
    return { next, count: shifts ? buildRosterShifts(roster, shifts, from, until).length : 0 };
  }, [draft, jobId, from, until, shifts]);

  if (!settings) return null;
  const rosters = settings.rosters ?? [];
  const jobName = (id: string) => allJobs?.find((j) => j.id === id)?.name ?? 'Deleted job';

  async function addShifts(roster: Roster, fromDate: string, untilDate: string) {
    const created = buildRosterShifts(roster, shifts ?? [], fromDate, untilDate);
    for (const shift of created) await shiftsRepo.put(shift);
    return created.length;
  }

  async function create() {
    if (!jobId || busy) return;
    setBusy('create');
    const roster: Roster = {
      id: crypto.randomUUID(),
      jobId,
      days: draft.days,
      nights: draft.nights,
      off: draft.off,
      dayStart: draft.dayStart,
      dayEnd: draft.dayEnd,
      nightStart: draft.nightStart,
      nightEnd: draft.nightEnd,
      unpaidBreakMinutes: draft.unpaidBreakMinutes,
      startDate: draft.startDate,
      generatedUntil: until,
    };
    const count = await addShifts(roster, from, until);
    await settingsRepo.put({ ...settings!, rosters: [...rosters, roster] });
    haptic();
    setBusy(null);
    toast(`Roster added: ${count} shifts until ${niceDate(until)}`);
    onDone();
  }

  async function extend(roster: Roster) {
    if (busy) return;
    setBusy(`extend:${roster.id}`);
    const fromDate = formatDateOnly(addDays(parseDateOnly(roster.generatedUntil > today ? roster.generatedUntil : today), 1));
    const untilDate = formatDateOnly(addMonths(parseDateOnly(fromDate), 3));
    const count = await addShifts(roster, fromDate, untilDate);
    await settingsRepo.put({ ...settings!, rosters: rosters.map((r) => (r.id === roster.id ? { ...r, generatedUntil: untilDate } : r)) });
    setBusy(null);
    toast(`Added ${count} shifts until ${niceDate(untilDate)}`);
  }

  async function remove(roster: Roster) {
    const upcoming = (shifts ?? []).filter((s) => s.rosterId === roster.id && s.date >= today);
    if (busy || !confirm(`Remove this roster and its ${upcoming.length} upcoming shifts? Past shifts stay.`)) return;
    setBusy(`remove:${roster.id}`);
    for (const s of upcoming) await shiftsRepo.remove(s.id);
    await settingsRepo.put({ ...settings!, rosters: rosters.filter((r) => r.id !== roster.id) });
    setBusy(null);
    toast('Roster removed');
  }

  return (
    <div className="space-y-5">
      {rosters.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Your rosters</p>
          {rosters.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{jobName(r.jobId)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {r.days} days {r.dayStart}–{r.dayEnd} · {r.nights} nights {r.nightStart}–{r.nightEnd} · {r.off} off
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Shifts added until {niceDate(r.generatedUntil)}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button variant="secondary" className="w-full" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => extend(r)} disabled={busy !== null}>
                  {busy === `extend:${r.id}` ? 'Adding…' : 'Extend 3 months'}
                </Button>
                <Button variant="danger" className="w-full" icon={<Trash2 className="h-4 w-4" />} onClick={() => remove(r)} disabled={busy !== null}>
                  {busy === `remove:${r.id}` ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Repeat className="h-4 w-4" /> New roster
        </p>
        {hourlyJobs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Add an hourly job first.</p>
        ) : (
          <>
            <Field label="Job">
              <Select value={jobId} onChange={(e) => set('jobId', e.target.value)}>
                {hourlyJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Day shifts">
                <Input type="number" min="0" max="14" value={draft.days} onChange={(e) => set('days', Math.max(0, Number(e.target.value) || 0))} />
              </Field>
              <Field label="Night shifts">
                <Input type="number" min="0" max="14" value={draft.nights} onChange={(e) => set('nights', Math.max(0, Number(e.target.value) || 0))} />
              </Field>
              <Field label="Days off">
                <Input type="number" min="0" max="14" value={draft.off} onChange={(e) => set('off', Math.max(0, Number(e.target.value) || 0))} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Day shift starts">
                <Input type="time" value={draft.dayStart} onChange={(e) => set('dayStart', e.target.value)} />
              </Field>
              <Field label="Day shift ends">
                <Input type="time" value={draft.dayEnd} onChange={(e) => set('dayEnd', e.target.value)} />
              </Field>
              <Field label="Night shift starts">
                <Input type="time" value={draft.nightStart} onChange={(e) => set('nightStart', e.target.value)} />
              </Field>
              <Field label="Night shift ends">
                <Input type="time" value={draft.nightEnd} onChange={(e) => set('nightEnd', e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="First day shift">
                <Input type="date" value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} />
              </Field>
              <Field label="Fill ahead">
                <Select value={draft.months} onChange={(e) => set('months', Number(e.target.value))}>
                  <option value={1}>1 month</option>
                  <option value={3}>3 months</option>
                  <option value={6}>6 months</option>
                  <option value={12}>12 months</option>
                </Select>
              </Field>
            </div>

            <Field label="Unpaid break per shift (minutes)">
              <Input type="number" min="0" step="5" value={draft.unpaidBreakMinutes} onChange={(e) => set('unpaidBreakMinutes', Math.max(0, Number(e.target.value) || 0))} />
            </Field>

            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Next 8 days from {niceDate(from)}</p>
              <div className="mt-2 grid grid-cols-8 gap-1">
                {preview.next.map(({ date, kind }) => (
                  <div key={date} className="text-center" title={KIND_CHIP[kind].title}>
                    <div className={`rounded-lg py-1.5 text-sm font-bold ${KIND_CHIP[kind].className}`}>{KIND_CHIP[kind].label}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{parseDateOnly(date).getDate()}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                Adds <span className="font-semibold">{preview.count} shifts</span> until {niceDate(until)}. Days that already have a{' '}
                {jobName(jobId)} shift are skipped.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onDone}>
                Cancel
              </Button>
              <Button type="button" icon={<Repeat className="h-4 w-4" />} onClick={create} disabled={preview.count === 0 || busy !== null}>
                {busy === 'create' ? 'Adding shifts…' : 'Create roster'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
