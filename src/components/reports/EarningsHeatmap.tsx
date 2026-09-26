import { useEffect, useMemo, useRef } from 'react';
import { addDays } from 'date-fns';
import { Flame } from 'lucide-react';
import type { ShiftLine } from '../../lib/payCalculation/reports';
import { formatDateOnly, parseDateOnly, startOfWeekStr } from '../../lib/dateUtils';
import { formatCurrency } from '../../lib/format';
import { Card } from '../ui/Card';

const WEEKS = 53;
const LEVEL_CLASSES = [
  'bg-slate-100 dark:bg-slate-700/50',
  'bg-brand-200 dark:bg-brand-900',
  'bg-brand-300 dark:bg-brand-700',
  'bg-brand-500 dark:bg-brand-500',
  'bg-brand-700 dark:bg-brand-300',
];

/** A year of days, GitHub-style, shaded by how much was earned (all jobs). */
export function EarningsHeatmap({ lines, today, weekStartDay }: { lines: ShiftLine[]; today: string; weekStartDay: 0 | 1 }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { weeks, max, total, daysWorked } = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const l of lines) byDate.set(l.shift.date, (byDate.get(l.shift.date) ?? 0) + l.breakdown.finalGrossPay);
    const firstDay = parseDateOnly(startOfWeekStr(formatDateOnly(addDays(parseDateOnly(today), -7 * (WEEKS - 1))), weekStartDay));
    const weeks: { date: string; amount: number; future: boolean }[][] = [];
    let max = 0;
    let total = 0;
    let daysWorked = 0;
    for (let w = 0; w < WEEKS; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = formatDateOnly(addDays(firstDay, w * 7 + d));
        const amount = date <= today ? (byDate.get(date) ?? 0) : 0;
        if (amount > 0) {
          daysWorked++;
          total += amount;
        }
        max = Math.max(max, amount);
        week.push({ date, amount, future: date > today });
      }
      weeks.push(week);
    }
    return { weeks, max, total, daysWorked };
  }, [lines, today, weekStartDay]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  const level = (amount: number) => (amount <= 0 || max === 0 ? 0 : Math.min(4, Math.ceil((amount / max) * 4)));

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
          <Flame className="h-4 w-4" /> Last 12 months
        </h2>
        <p className="ml-auto text-xs text-slate-400 dark:text-slate-500">
          {daysWorked} days worked · <span className="font-medium text-slate-600 dark:text-slate-300">{formatCurrency(total)}</span>
        </p>
      </div>
      <div ref={scrollRef} className="mt-3 overflow-x-auto pb-1">
        <div className="flex w-max gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => (
                <div
                  key={day.date}
                  title={`${parseDateOnly(day.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${
                    day.amount > 0 ? ` · ${formatCurrency(day.amount)}` : ''
                  }`}
                  className={`h-3 w-3 rounded-[3px] ${day.future ? 'opacity-0' : LEVEL_CLASSES[level(day.amount)]}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-slate-400 dark:text-slate-500">
        Less
        {LEVEL_CLASSES.map((c) => (
          <span key={c} className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />
        ))}
        More
      </div>
    </Card>
  );
}
