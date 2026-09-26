import { useRef, useState } from 'react';
import { ChevronDown, Copy, Pencil, Trash2 } from 'lucide-react';
import type { Job, Shift } from '../../types';
import type { ShiftWeeklyBreakdown } from '../../lib/payCalculation/types';
import { formatCurrency, formatHours } from '../../lib/format';
import { parseDateOnly } from '../../lib/dateUtils';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Money } from '../ui/Money';
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
  onCopy,
}: {
  shift: Shift;
  job: Job;
  breakdown: ShiftWeeklyBreakdown;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const swipe = useSwipe({ onSwipeLeft: onDelete, onSwipeRight: onCopy });

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {swipe.offset !== 0 && (
        <div
          className={`absolute inset-0 flex items-center px-5 text-sm font-semibold text-white ${
            swipe.offset > 0 ? 'justify-start bg-brand-600' : 'justify-end bg-red-600'
          }`}
        >
          {swipe.offset > 0 ? (
            <span className="flex items-center gap-1.5">
              <Copy className="h-4 w-4" /> Copy
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              Delete <Trash2 className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
      <div
        {...swipe.handlers}
        className="relative touch-pan-y rounded-2xl bg-slate-50 dark:bg-slate-900"
        style={{
          transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined,
          transition: swipe.dragging ? 'none' : 'transform 0.2s ease-out',
        }}
      >
    <Card className="border-l-4" style={{ borderLeftColor: job.color }}>
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => {
          if (!swipe.consumeClick()) onToggleExpand();
        }}
      >
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
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              <Money amount={breakdown.finalGrossPay} />
            </p>
            {job.includeSuper && <p className="text-xs text-slate-400 dark:text-slate-500">+{formatCurrency(breakdown.superAmount)} super</p>}
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-300 transition-transform dark:text-slate-600 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <>
          <ShiftBreakdown breakdown={breakdown} />
          <div className="mt-3 flex justify-end gap-1">
            <Button variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={onCopy}>
              Copy
            </Button>
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
      </div>
    </div>
  );
}

const SWIPE_THRESHOLD = 80;
const SWIPE_MAX = 120;

/** Horizontal swipe on touch devices; vertical movement is left to page scrolling. */
function useSwipe({ onSwipeLeft, onSwipeRight }: { onSwipeLeft: () => void; onSwipeRight: () => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; axis: 'h' | 'v' | null } | null>(null);
  const swiped = useRef(false);

  const reset = () => {
    start.current = null;
    setDragging(false);
    setOffset(0);
  };

  return {
    offset,
    dragging,
    /** True (once) if the last gesture was a swipe, so the tap handler can ignore it. */
    consumeClick: () => {
      const was = swiped.current;
      swiped.current = false;
      return was;
    },
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        start.current = { x: e.clientX, y: e.clientY, axis: null };
        swiped.current = false;
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          s.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
          if (s.axis === 'h') setDragging(true);
        }
        if (s.axis === 'h') {
          swiped.current = true;
          setOffset(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx)));
        }
      },
      onPointerUp: () => {
        if (start.current?.axis === 'h') {
          if (offset <= -SWIPE_THRESHOLD) onSwipeLeft();
          else if (offset >= SWIPE_THRESHOLD) onSwipeRight();
        }
        reset();
      },
      onPointerCancel: reset,
    },
  };
}
