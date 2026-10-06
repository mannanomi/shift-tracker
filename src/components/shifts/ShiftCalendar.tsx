import { useRef } from 'react';
import { addDays } from 'date-fns';
import type { ShiftLine } from '../../lib/payCalculation/reports';
import { formatDateOnly, parseDateOnly } from '../../lib/dateUtils';
import { formatCurrency } from '../../lib/format';

const WEEKDAY_LABELS_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_LABELS_SUN_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** How far a horizontal swipe must travel to change month. */
const SWIPE_DISTANCE = 50;

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

/** Day totals in a narrow cell: $409, $1.2k, $12k. */
function compactMoney(amount: number): string {
  if (amount >= 10_000) return `$${Math.round(amount / 1000)}k`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${Math.round(amount)}`;
}

export function ShiftCalendar({
  month,
  weekStartDay,
  shiftsByDate,
  todayStr,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  direction,
}: {
  /** Any date within the month to display. */
  month: Date;
  weekStartDay: 0 | 1;
  shiftsByDate: Map<string, ShiftLine[]>;
  todayStr: string;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  /** Called with +1/-1 when the grid is swiped to the next/previous month. */
  onChangeMonth: (delta: 1 | -1) => void;
  /** Which way the month last changed, so the grid slides in from that side. */
  direction: 1 | -1 | 0;
}) {
  const monthStart = startOfMonthStr(month);
  const monthEnd = endOfMonthStr(month);
  const start = gridStart(monthStart, weekStartDay);
  const end = gridEnd(monthEnd, weekStartDay);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const labels = weekStartDay === 1 ? WEEKDAY_LABELS_MON_FIRST : WEEKDAY_LABELS_SUN_FIRST;
  const slide = direction === 1 ? 'animate-month-next' : direction === -1 ? 'animate-month-prev' : '';

  return (
    <div
      className="touch-pan-y select-none"
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') swipeStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipeStart.current;
        swipeStart.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) onChangeMonth(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        swipeStart.current = null;
      }}
    >
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:gap-2 dark:text-slate-500">
        {labels.map((label) => (
          <div key={label} className="pb-2">
            {label}
          </div>
        ))}
      </div>
      <div key={formatDateOnly(monthStart)} className={`grid grid-cols-7 gap-1 lg:gap-2 ${slide}`}>
        {days.map((day) => {
          const dateStr = formatDateOnly(day);
          const inMonth = day.getMonth() === month.getMonth();
          const lines = shiftsByDate.get(dateStr) ?? [];
          const jobColors = [...new Map(lines.map((l) => [l.job.id, l.job.color])).values()];
          const dayTotal = lines.reduce((sum, l) => sum + l.breakdown.finalGrossPay, 0);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const label = parseDateOnly(dateStr).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDate(dateStr)}
              aria-pressed={isSelected}
              aria-label={`${label}${lines.length ? `, ${lines.length} shift${lines.length === 1 ? '' : 's'}, ${formatCurrency(dayTotal)}` : ''}`}
              className={`flex h-14 flex-col items-center rounded-xl pt-1 transition duration-150 active:scale-95 lg:h-20 lg:pt-1.5 ${
                isSelected
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : lines.length > 0
                    ? 'bg-slate-100 text-slate-800 hover:bg-slate-200/80 dark:bg-slate-700/50 dark:text-slate-100 dark:hover:bg-slate-700'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/30'
              } ${inMonth || isSelected ? '' : 'opacity-35'}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums lg:h-7 lg:w-7 lg:text-sm ${
                  isToday && !isSelected ? 'bg-brand-600 text-white' : ''
                } ${isToday && isSelected ? 'bg-white text-brand-700' : ''}`}
              >
                {day.getDate()}
              </span>
              {jobColors.length > 0 && (
                <span className="mt-1 flex gap-0.5">
                  {jobColors.slice(0, 3).map((color) => (
                    <span
                      key={color}
                      className="h-1 w-2.5 rounded-full lg:w-3.5"
                      style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.85)' : color }}
                    />
                  ))}
                </span>
              )}
              {dayTotal > 0 && (
                <span
                  className={`mt-auto pb-1 text-[10px] font-semibold tabular-nums leading-none lg:pb-2 lg:text-xs ${
                    isSelected ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {compactMoney(dayTotal)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
