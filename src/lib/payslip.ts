import type { Job, Payslip } from '../types';
import type { JobSubtotal } from './payCalculation/reports';

/** The separator people put between employer and role: "MSS - Restraint", "MSS – Restraint". */
const EMPLOYER_SEPARATOR = /\s+[-–—]\s+/;

/** Who pays a job: its Employer field, or else the part of its name before " - ". */
export function employerOf(job: Pick<Job, 'name' | 'employer'>): string | null {
  const explicit = job.employer?.trim();
  if (explicit) return explicit;
  const [prefix, ...rest] = job.name.split(EMPLOYER_SEPARATOR);
  return rest.length > 0 && prefix.trim() ? prefix.trim() : null;
}

/** A job's name without its employer prefix, for compact labels ("MSS - Restraint" → "Restraint"). */
export function roleName(jobName: string, employer: string | null): string {
  if (!employer) return jobName;
  const [prefix, ...rest] = jobName.split(EMPLOYER_SEPARATOR);
  return rest.length > 0 && prefix.trim().toLowerCase() === employer.toLowerCase() ? rest.join(' - ') : jobName;
}

/** One payslip to check: all of an employer's jobs together, or a single job with no employer. */
export interface PayslipGroup {
  key: string;
  /** Employer name, or the job's name when it has no employer. */
  label: string;
  employer: string | null;
  color: string;
  jobs: JobSubtotal[];
  calculated: number;
}

/** Groups a period's jobs by employer. ABN jobs are left out — there's no payslip for them. */
export function groupForPayslips(subtotals: JobSubtotal[], jobs: Job[]): PayslipGroup[] {
  const jobsById = new Map(jobs.map((j) => [j.id, j]));
  const groups = new Map<string, PayslipGroup>();
  for (const sub of subtotals) {
    if (sub.category === 'abn') continue;
    const job = jobsById.get(sub.jobId);
    const employer = job ? employerOf(job) : null;
    const key = employer ? `employer:${employer.toLowerCase()}` : `job:${sub.jobId}`;
    const group = groups.get(key) ?? { key, label: employer ?? sub.jobName, employer, color: sub.color, jobs: [], calculated: 0 };
    group.jobs.push(sub);
    group.calculated += sub.grossPay;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function inPeriod(p: Payslip, start: string, end: string) {
  return p.periodStart === start && p.periodEnd === end;
}

/**
 * What was recorded as paid for a group this period. Entries saved before grouping existed
 * were per job, so if the group has no entry of its own, those of its jobs are added up.
 */
export function paidForGroup(group: PayslipGroup, payslips: Payslip[], start: string, end: string): number | null {
  const current = payslips.filter((p) => inPeriod(p, start, end));
  const own = current.find((p) => p.groupKey === group.key);
  if (own) return own.amountPaid;
  const legacy = current.filter((p) => !p.groupKey && group.jobs.some((j) => j.jobId === p.jobId));
  return legacy.length > 0 ? legacy.reduce((sum, p) => sum + p.amountPaid, 0) : null;
}

/** Replaces the group's entry for the period (and any old per-job entries it supersedes). */
export function withGroupPayment(
  payslips: Payslip[],
  group: PayslipGroup,
  start: string,
  end: string,
  amount: number | null,
): Payslip[] {
  const jobIds = new Set(group.jobs.map((j) => j.jobId));
  const others = payslips.filter(
    (p) => !(inPeriod(p, start, end) && (p.groupKey === group.key || (!p.groupKey && jobIds.has(p.jobId)))),
  );
  if (amount === null) return others;
  const existing = payslips.find((p) => inPeriod(p, start, end) && p.groupKey === group.key);
  return [
    ...others,
    { id: existing?.id ?? crypto.randomUUID(), jobId: group.jobs[0].jobId, groupKey: group.key, periodStart: start, periodEnd: end, amountPaid: amount },
  ];
}
