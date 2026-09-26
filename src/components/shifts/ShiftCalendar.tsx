import { addDays } from 'date-fns';
import type { ShiftLine } from '../../lib/payCalculation/reports';
import { formatDateOnly, parseDateOnly } from '../../lib/dateUtils';

const WEEKDAY_LABELS_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_LABELS_SUN_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonthStr(monthAnchor: Date): Date {
  return new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
}

function endOfMonthStr(monthAnchor: Date): Date {
  return new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
}

function gridStart(monthStart: Date, weekStartDay: 0 | 1): Date {
  const diff = (monthStart.getDay() - weekStartDay + 7) % 7;
  return addDays(monthStart, -diff);
}

function gridEnd(monthEnd: Date, weekStartDay: 0 | 1): Date {
  const weekEndDay = (weekStartDay + 6) % 7;
  const diff = (weekEndDay - monthEnd.getDay() + 7) % 7;
  return addDays(monthEnd, diff);
}

/** The full visible grid range (including lead/trail days from neighboring months) for a month. */
export function getCalendarGridRange(month: Date, weekStartDay: 0 | 1): { start: string; end: string } {
  const start = gridStart(startOfMonthStr(month), weekStartDay);
  const end = gridEnd(endOfMonthStr(month), weekStartDay);
  return { start: formatDateOnly(start), end: formatDateOnly(end) };
}

export function ShiftCalendar({
  month,
  weekStartDay,
  shiftsByDate,
  todayStr,
  onSelectDate,
}: {
  /** Any date within the month to display. */
  month: Date;
  weekStartDay: 0 | 1;
  shiftsByDate: Map<string, ShiftLine[]>;
  todayStr: string;
  onSelectDate: (dateStr: string) => void;
}) {
  const monthStart = startOfMonthStr(month);
  const monthEnd = endOfMonthStr(month);
  const start = gridStart(monthStart, weekStartDay);
  const end = gridEnd(monthEnd, weekStartDay);

  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const labels = weekStartDay === 1 ? WEEKDAY_LABELS_MON_FIRST : WEEKDAY_LABELS_SUN_FIRST;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
        {labels.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 lg:gap-2">
        {days.map((day) => {
          const dateStr = formatDateOnly(day);
          const inMonth = day.getMonth() === month.getMonth();
          const lines = shiftsByDate.get(dateStr) ?? [];
          const jobColors = [...new Map(lines.map((l) => [l.job.id, l.job.color])).values()];
          const dayTotal = lines.reduce((sum, l) => sum + l.breakdown.finalGrossPay, 0);
          const isToday = dateStr === todayStr;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              style={jobColors.length > 0 ? { backgroundColor: `${jobColors[0]}22` } : undefined}
              className={`flex aspect-square flex-col items-center justify-start gap-0.5 rounded-lg pt-1 text-xs lg:aspect-auto lg:h-24 lg:gap-1 lg:pt-2 lg:text-sm ${
                inMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300 dark:text-slate-700'
              } ${isToday ? 'ring-1 ring-brand-400 dark:ring-brand-500' : ''} ${
                lines.length > 0 ? '' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
              }`}
            >
              <span className={isToday ? 'font-semibold text-brand-600 dark:text-brand-400' : ''}>
                {parseDateOnly(dateStr).getDate()}
              </span>
              {jobColors.length > 0 && (
                <div className="flex gap-0.5">
                  {jobColors.slice(0, 4).map((color) => (
                    <span key={color} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  ))}
                </div>
              )}
              {dayTotal > 0 && <span className="text-[9px] leading-none lg:text-xs text-slate-400 dark:text-slate-500">${Math.round(dayTotal)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
