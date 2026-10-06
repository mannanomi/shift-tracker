import { useMemo, useState } from 'react';
import { addDays, addMonths } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Inbox, List, Plus } from 'lucide-react';
import { formatHours } from '../lib/format';
import { Money } from '../components/ui/Money';
import type { Shift } from '../types';
import { useJobs, usePublicHolidays, useSettings, useShifts } from '../hooks/useData';
import { shiftsRepo } from '../db/repository';
import { buildRangeReport, type ShiftLine } from '../lib/payCalculation/reports';
import { formatDateOnly, parseDateOnly } from '../lib/dateUtils';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ShiftForm } from '../components/shifts/ShiftForm';
import { toast } from '../components/ui/Toast';
import { ShiftLineCard } from '../components/shifts/ShiftLineCard';
import { ShiftCalendar, getCalendarGridRange } from '../components/shifts/ShiftCalendar';

type FormTarget = { mode: 'new'; date?: string; template?: Partial<Shift> } | { mode: 'edit'; shift: Shift };
type ViewMode = 'calendar' | 'list';

export function ShiftsPage() {
  const jobs = useJobs();
  const shifts = useShifts();
  const publicHolidays = usePublicHolidays();
  const settings = useSettings();
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const todayStr = useMemo(() => formatDateOnly(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [monthDirection, setMonthDirection] = useState<1 | -1 | 0>(0);

  const listRangeStart = useMemo(() => formatDateOnly(addDays(new Date(), -90)), []);
  const listRangeEnd = useMemo(() => formatDateOnly(addDays(new Date(), 60)), []);

  const listReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings) return null;
    return buildRangeReport(listRangeStart, listRangeEnd, jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, listRangeStart, listRangeEnd]);

  const calendarRange = useMemo(
    () => (settings ? getCalendarGridRange(calendarMonth, settings.weekStartDay) : null),
    [calendarMonth, settings],
  );

  const calendarReport = useMemo(() => {
    if (!jobs || !shifts || !publicHolidays || !settings || !calendarRange) return null;
    return buildRangeReport(calendarRange.start, calendarRange.end, jobs, shifts, publicHolidays, settings.weekStartDay);
  }, [jobs, shifts, publicHolidays, settings, calendarRange]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftLine[]>();
    if (!calendarReport) return map;
    for (const line of calendarReport.shiftLines) {
      const arr = map.get(line.shift.date) ?? [];
      arr.push(line);
      map.set(line.shift.date, arr);
    }
    return map;
  }, [calendarReport]);

  async function handleDelete(shift: Shift) {
    await shiftsRepo.remove(shift.id);
    toast('Shift deleted', { label: 'Undo', onClick: () => void shiftsRepo.put(shift) });
  }

  function handleCopy(shift: Shift) {
    const { id: _id, ...rest } = shift;
    setFormTarget({ mode: 'new', template: { ...rest, date: formatDateOnly(addDays(parseDateOnly(shift.date), 7)) } });
  }

  /** Moves the calendar a month, selecting today (this month) or the month's first day with shifts. */
  function changeMonth(delta: 1 | -1) {
    const next = addMonths(calendarMonth, delta);
    const ym = formatDateOnly(next).slice(0, 7);
    const firstWithShift = (shifts ?? [])
      .map((sh) => sh.date)
      .filter((d) => d.startsWith(ym))
      .sort()[0];
    setMonthDirection(delta);
    setCalendarMonth(next);
    setSelectedDate(todayStr.startsWith(ym) ? todayStr : (firstWithShift ?? `${ym}-01`));
  }

  function goToToday() {
    const now = new Date();
    setMonthDirection(now < calendarMonth ? -1 : 1);
    setCalendarMonth(now);
    setSelectedDate(todayStr);
  }

  if (!listReport || !calendarReport) return null;

  const listLines = [...listReport.shiftLines].reverse(); // most recent first
  const selectedDateLines = [...(shiftsByDate.get(selectedDate) ?? [])].sort((a, b) => a.shift.startTime.localeCompare(b.shift.startTime));
  const monthPrefix = formatDateOnly(calendarMonth).slice(0, 7);
  const monthLines = calendarReport.shiftLines.filter((l) => l.shift.date.startsWith(monthPrefix));
  const monthTotal = monthLines.reduce((sum, l) => sum + l.breakdown.finalGrossPay, 0);
  const monthHours = monthLines.reduce((sum, l) => sum + l.breakdown.workedHours, 0);
  const selectedTotal = selectedDateLines.reduce((sum, l) => sum + l.breakdown.finalGrossPay, 0);
  const selectedHours = selectedDateLines.reduce((sum, l) => sum + l.breakdown.workedHours, 0);
  const viewingToday = selectedDate === todayStr && monthPrefix === todayStr.slice(0, 7);

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader
        icon={<Clock className="h-5 w-5" />}
        title="Shifts"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget({ mode: 'new' })}>
            Add shift
          </Button>
        }
      />

      <ViewToggle value={viewMode} onChange={setViewMode} />

      {viewMode === 'calendar' && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
          <Card className="p-3! sm:p-4!">
            <div className="flex items-center gap-2 px-1">
              <h2 className="flex-1 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {calendarMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
              </h2>
              {!viewingToday && (
                <button
                  type="button"
                  onClick={goToToday}
                  className="animate-pop-in rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
                >
                  Today
                </button>
              )}
              <IconButton label="Previous month" onClick={() => changeMonth(-1)}>
                <ChevronLeft className="h-5 w-5" />
              </IconButton>
              <IconButton label="Next month" onClick={() => changeMonth(1)}>
                <ChevronRight className="h-5 w-5" />
              </IconButton>
            </div>

            <div className="my-3 grid grid-cols-3 gap-2">
              <MonthStat label="Earned" value={<Money amount={monthTotal} animate />} />
              <MonthStat label="Hours" value={formatHours(monthHours)} />
              <MonthStat label="Shifts" value={String(monthLines.length)} />
            </div>

            <ShiftCalendar
              month={calendarMonth}
              weekStartDay={settings!.weekStartDay}
              shiftsByDate={shiftsByDate}
              todayStr={todayStr}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onChangeMonth={changeMonth}
              direction={monthDirection}
            />
            <p className="mt-2 text-center text-[11px] text-slate-400 lg:hidden dark:text-slate-500">Swipe the calendar to change month</p>
          </Card>

          <section key={selectedDate} className="space-y-2.5">
            <div className="flex items-end justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                  {selectedDate === todayStr ? 'Today' : parseDateOnly(selectedDate).toLocaleDateString('en-AU', { weekday: 'long' })}
                </p>
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {parseDateOnly(selectedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </h2>
              </div>
              {selectedDateLines.length > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    <Money amount={selectedTotal} />
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedDateLines.length} shift{selectedDateLines.length === 1 ? '' : 's'}
                    {selectedHours > 0 && ` · ${formatHours(selectedHours)}`}
                  </p>
                </div>
              )}
            </div>

            {selectedDateLines.length === 0 && (
              <Card>
                <EmptyState
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="Nothing logged this day"
                  subtitle="Add a shift or earnings for this date"
                />
              </Card>
            )}
            {selectedDateLines.map(({ shift, job, breakdown }, index) => (
              <ShiftLineCard
                key={shift.id}
                index={index}
                showDate={false}
                shift={shift}
                job={job}
                breakdown={breakdown}
                expanded={expandedId === shift.id}
                onToggleExpand={() => setExpandedId(expandedId === shift.id ? null : shift.id)}
                onEdit={() => setFormTarget({ mode: 'edit', shift })}
                onDelete={() => handleDelete(shift)}
                onCopy={() => handleCopy(shift)}
              />
            ))}
            <Button
              variant="secondary"
              className="w-full py-2.5!"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setFormTarget({ mode: 'new', date: selectedDate })}
            >
              Add on {parseDateOnly(selectedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </Button>
          </section>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-2">
          {listLines.length === 0 && (
            <Card>
              <EmptyState icon={<Inbox className="h-5 w-5" />} title="No shifts logged yet" subtitle="Tap Add shift to log your first one" />
            </Card>
          )}
          {listLines.map(({ shift, job, breakdown }, index) => (
            <ShiftLineCard
              key={shift.id}
              index={index}
              shift={shift}
              job={job}
              breakdown={breakdown}
              expanded={expandedId === shift.id}
              onToggleExpand={() => setExpandedId(expandedId === shift.id ? null : shift.id)}
              onEdit={() => setFormTarget({ mode: 'edit', shift })}
              onDelete={() => handleDelete(shift)}
                onCopy={() => handleCopy(shift)}
            />
          ))}
        </div>
      )}

      {formTarget && (
        <Modal
          title={
            formTarget.mode === 'new'
              ? 'Add shift'
              : jobs?.find((j) => j.id === formTarget.shift.jobId)?.kind === 'abn'
                ? 'Edit earnings'
                : 'Edit shift'
          }
          onClose={() => setFormTarget(null)}
        >
          <ShiftForm
            shift={formTarget.mode === 'edit' ? formTarget.shift : undefined}
            initialDate={formTarget.mode === 'new' ? formTarget.date : undefined}
            template={formTarget.mode === 'new' ? formTarget.template : undefined}
            onDone={() => setFormTarget(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const options: { mode: ViewMode; label: string; Icon: typeof List }[] = [
    { mode: 'calendar', label: 'Calendar', Icon: CalendarDays },
    { mode: 'list', label: 'List', Icon: List },
  ];
  return (
    <div className="relative grid grid-cols-2 rounded-xl bg-slate-100 p-1 sm:inline-grid sm:w-72 dark:bg-slate-800">
      <span
        aria-hidden
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out dark:bg-slate-700 ${
          value === 'list' ? 'translate-x-full' : ''
        }`}
      />
      {options.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={`relative flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
            value === mode ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 active:scale-90 dark:text-slate-400 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

function MonthStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2 text-center dark:bg-slate-900/40">
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="truncate text-base font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
