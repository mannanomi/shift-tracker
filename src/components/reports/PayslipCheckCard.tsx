import { useState } from 'react';
import { Building2, ReceiptText } from 'lucide-react';
import type { AppSettings, Job } from '../../types';
import type { RangeReport } from '../../lib/payCalculation/reports';
import { settingsRepo } from '../../db/repository';
import { formatCurrency } from '../../lib/format';
import { groupForPayslips, paidForGroup, roleName, withGroupPayment, type PayslipGroup } from '../../lib/payslip';
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

/**
 * Compare what each employer paid for this period against the calculated gross. Jobs with the
 * same employer (e.g. "MSS - Restraint" and "MSS - Non Restraint") are checked against one payslip.
 */
export function PayslipCheckCard({ report, settings, jobs }: { report: RangeReport; settings: AppSettings; jobs: Job[] }) {
  const payslips = settings.payslips ?? [];
  const groups = groupForPayslips(report.jobSubtotals, jobs);

  async function save(group: PayslipGroup, raw: string) {
    const amount = Number(raw);
    const value = raw.trim() === '' || !(amount >= 0) ? null : amount;
    await settingsRepo.put({ ...settings, payslips: withGroupPayment(payslips, group, report.startDate, report.endDate, value) });
  }

  return (
    <Card>
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        <ReceiptText className="h-4 w-4" /> Payslip check
      </h2>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Enter the gross pay on each payslip for this period (before tax, excluding super). Jobs with the same employer share
        one payslip.
      </p>
      {groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">No shifts in this period.</p>
      ) : (
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
          {groups.map((group) => {
            const paid = paidForGroup(group, payslips, report.startDate, report.endDate);
            return (
              <div
                key={`${group.key}|${report.startDate}|${report.endDate}`}
                className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-x-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  {group.employer ? (
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{group.label}</span>
                    </p>
                  ) : (
                    <Badge color={group.color}>{group.label}</Badge>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Calculated <span className="tabular-nums">{formatCurrency(group.calculated)}</span>
                    {paid !== null && (
                      <>
                        {' · '}
                        <Difference paid={paid} calculated={group.calculated} />
                      </>
                    )}
                  </p>
                  {group.employer && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {group.jobs.map((j) => (
                        <span
                          key={j.jobId}
                          className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700/60 dark:text-slate-300"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: j.color }} />
                          <span className="truncate">{roleName(j.jobName, group.employer)}</span>
                          <span className="tabular-nums text-slate-400 dark:text-slate-500">{formatCurrency(j.grossPay)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <PaidInput initial={paid ?? undefined} onSave={(v) => save(group, v)} />
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
