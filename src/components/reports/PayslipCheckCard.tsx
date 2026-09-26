import { useState } from 'react';
import { ReceiptText } from 'lucide-react';
import type { AppSettings, Payslip } from '../../types';
import type { RangeReport } from '../../lib/payCalculation/reports';
import { settingsRepo } from '../../db/repository';
import { formatCurrency } from '../../lib/format';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Field';

function Difference({ paid, calculated }: { paid: number; calculated: number }) {
  const diff = paid - calculated;
  if (Math.abs(diff) < 1) {
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Matches</span>;
  }
  return diff < 0 ? (
    <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Underpaid {formatCurrency(-diff)}</span>
  ) : (
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Paid {formatCurrency(diff)} more</span>
  );
}

/** Compare what each employer paid for this period against the calculated gross. */
export function PayslipCheckCard({ report, settings }: { report: RangeReport; settings: AppSettings }) {
  const payslips = settings.payslips ?? [];
  const find = (jobId: string) =>
    payslips.find((p) => p.jobId === jobId && p.periodStart === report.startDate && p.periodEnd === report.endDate);

  async function save(jobId: string, raw: string) {
    const others = payslips.filter((p) => !(p.jobId === jobId && p.periodStart === report.startDate && p.periodEnd === report.endDate));
    const amount = Number(raw);
    const next: Payslip[] =
      raw.trim() === '' || !(amount >= 0)
        ? others
        : [...others, { id: find(jobId)?.id ?? crypto.randomUUID(), jobId, periodStart: report.startDate, periodEnd: report.endDate, amountPaid: amount }];
    await settingsRepo.put({ ...settings, payslips: next });
  }

  return (
    <Card>
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        <ReceiptText className="h-4 w-4" /> Payslip check
      </h2>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Enter the gross pay on your payslip for this period (before tax, excluding super).</p>
      {report.jobSubtotals.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">No shifts in this period.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {report.jobSubtotals.map((job) => {
            const saved = find(job.jobId);
            return (
              <div key={`${job.jobId}|${report.startDate}|${report.endDate}`} className="grid grid-cols-[1fr_7.5rem] items-center gap-x-3 gap-y-0.5">
                <div className="min-w-0">
                  <Badge color={job.color}>{job.jobName}</Badge>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Calculated <span className="tabular-nums">{formatCurrency(job.grossPay)}</span>
                    {saved && (
                      <>
                        {' · '}
                        <Difference paid={saved.amountPaid} calculated={job.grossPay} />
                      </>
                    )}
                  </p>
                </div>
                <PaidInput initial={saved?.amountPaid} onSave={(v) => save(job.jobId, v)} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PaidInput({ initial, onSave }: { initial?: number; onSave: (value: string) => void }) {
  const [value, setValue] = useState(initial !== undefined ? String(initial) : '');
  return (
    <Input
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      placeholder="Paid $"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      aria-label="Amount paid"
    />
  );
}
