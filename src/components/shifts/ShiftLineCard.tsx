import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import type { Job, Shift } from '../../types';
import type { ShiftWeeklyBreakdown } from '../../lib/payCalculation/types';
import { formatCurrency, formatHours } from '../../lib/format';
import { parseDateOnly } from '../../lib/dateUtils';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ShiftBreakdown } from './ShiftBreakdown';

export function ShiftLineCard({
  shift,
  job,
  breakdown,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: {
  shift: Shift;
  job: Job;
  breakdown: ShiftWeeklyBreakdown;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={onToggleExpand}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={job.color}>{job.name}</Badge>
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {parseDateOnly(shift.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {shift.startTime}–{shift.endTime}
            </span>
            {breakdown.dayType !== 'weekday' && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                {breakdown.dayType === 'publicHoliday' ? 'Public holiday' : breakdown.dayType}
              </span>
            )}
            {breakdown.overtimeSegments.length + breakdown.weeklyOvertimeSegments.length > 0 && (
              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-500/10 dark:text-purple-400">
                OT
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {formatHours(breakdown.workedHours)} worked{shift.notes && ` · ${shift.notes}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(breakdown.finalGrossPay)}</p>
            {job.includeSuper && <p className="text-xs text-slate-400 dark:text-slate-500">+{formatCurrency(breakdown.superAmount)} super</p>}
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-300 transition-transform dark:text-slate-600 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <>
          <ShiftBreakdown breakdown={breakdown} />
          <div className="mt-3 flex justify-end gap-1">
            <Button variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
              Delete
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
