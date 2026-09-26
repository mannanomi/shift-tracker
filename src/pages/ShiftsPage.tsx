import { useMemo, useState } from 'react';
import { addDays, addMonths } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Inbox, List, Plus } from 'lucide-react';
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayStr = useMemo(() => formatDateOnly(new Date()), []);

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
    setSelectedDate(null);
    setFormTarget({ mode: 'new', template: { ...rest, date: formatDateOnly(addDays(parseDateOnly(shift.date), 7)) } });
  }

  if (!listReport || !calendarReport) return null;

  const listLines = [...listReport.shiftLines].reverse(); // most recent first
  const selectedDateLines = selectedDate ? (shiftsByDate.get(selectedDate) ?? []) : [];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Clock className="h-5 w-5" />}
        title="Shifts"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget({ mode: 'new' })}>
            Add shift
          </Button>
        }
      />

      <div className="flex gap-2">
        <Button
          icon={<CalendarDays className="h-4 w-4" />}
          variant={viewMode === 'calendar' ? 'primary' : 'secondary'}
          onClick={() => setViewMode('calendar')}
        >
          Calendar
        </Button>
        <Button
          icon={<List className="h-4 w-4" />}
          variant={viewMode === 'list' ? 'primary' : 'secondary'}
          onClick={() => setViewMode('list')}
        >
          List
        </Button>
      </div>

      {viewMode === 'calendar' && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setCalendarMonth((m) => addMonths(m, -1))}>
              Prev
            </Button>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {calendarMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
            </p>
            <Button
              variant="ghost"
              className="flex-row-reverse"
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
            >
              Next
            </Button>
          </div>
          <ShiftCalendar
            month={calendarMonth}
            weekStartDay={settings!.weekStartDay}
            shiftsByDate={shiftsByDate}
            todayStr={todayStr}
            onSelectDate={setSelectedDate}
          />
        </Card>
      )}

      {viewMode === 'list' && (
        <div className="grid gap-2 lg:grid-cols-2 lg:items-start">
          {listLines.length === 0 && (
            <Card>
              <EmptyState icon={<Inbox className="h-5 w-5" />} title="No shifts logged yet" subtitle="Tap Add shift to log your first one" />
            </Card>
          )}
          {listLines.map(({ shift, job, breakdown }) => (
            <ShiftLineCard
              key={shift.id}
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

      {selectedDate && (
        <Modal
          title={parseDateOnly(selectedDate).toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          onClose={() => setSelectedDate(null)}
        >
          <div className="space-y-2">
            {selectedDateLines.length === 0 && <EmptyState icon={<Inbox className="h-5 w-5" />} title="No shifts on this day" />}
            {selectedDateLines.map(({ shift, job, breakdown }) => (
              <ShiftLineCard
                key={shift.id}
                shift={shift}
                job={job}
                breakdown={breakdown}
                expanded={expandedId === shift.id}
                onToggleExpand={() => setExpandedId(expandedId === shift.id ? null : shift.id)}
                onEdit={() => {
                  setSelectedDate(null);
                  setFormTarget({ mode: 'edit', shift });
                }}
                onDelete={() => handleDelete(shift)}
                onCopy={() => handleCopy(shift)}
              />
            ))}
            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  const date = selectedDate;
                  setSelectedDate(null);
                  setFormTarget({ mode: 'new', date });
                }}
              >
                Add shift for this day
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {formTarget && (
        <Modal title={formTarget.mode === 'new' ? 'Add shift' : 'Edit shift'} onClose={() => setFormTarget(null)}>
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
