import { describe, expect, it } from 'vitest';
import { createDefaultJob, type Payslip } from '../types';
import type { JobSubtotal } from './payCalculation/reports';
import { employerOf, groupForPayslips, paidForGroup, roleName, withGroupPayment } from './payslip';

function subtotal(jobId: string, jobName: string, grossPay: number, category: JobSubtotal['category'] = 'payg'): JobSubtotal {
  return { jobId, jobName, color: '#000', grossPay, superAmount: 0, hours: 0, shiftCount: 1, taxable: category !== 'cash', category };
}

const restraint = createDefaultJob({ id: 'r', name: 'MSS - Restraint' });
const nonRestraint = createDefaultJob({ id: 'n', name: 'MSS – Non Restraint' });
const cafe = createDefaultJob({ id: 'c', name: 'Corner Cafe' });
const uber = createDefaultJob({ id: 'u', name: 'Uber Eats', kind: 'abn' });

describe('employerOf', () => {
  it('uses the Employer field when set, else the name before " - "', () => {
    expect(employerOf({ name: 'MSS - Restraint' })).toBe('MSS');
    expect(employerOf({ name: 'MSS – Non Restraint' })).toBe('MSS');
    expect(employerOf({ name: 'Corner Cafe' })).toBeNull();
    expect(employerOf({ name: 'Weekend shifts', employer: ' Coles ' })).toBe('Coles');
    expect(employerOf({ name: 'Mid-week' })).toBeNull(); // a hyphen inside a word isn't a separator
  });

  it('shortens job names to the role within the employer', () => {
    expect(roleName('MSS - Restraint', 'MSS')).toBe('Restraint');
    expect(roleName('Corner Cafe', null)).toBe('Corner Cafe');
  });
});

describe('payslip groups', () => {
  const subs = [subtotal('r', 'MSS - Restraint', 600), subtotal('n', 'MSS – Non Restraint', 400), subtotal('c', 'Corner Cafe', 150, 'cash'), subtotal('u', 'Uber Eats', 200, 'abn')];
  const groups = groupForPayslips(subs, [restraint, nonRestraint, cafe, uber]);

  it('puts an employer’s jobs on one payslip and leaves ABN jobs out', () => {
    expect(groups.map((g) => g.label)).toEqual(['Corner Cafe', 'MSS']);
    const mss = groups.find((g) => g.label === 'MSS')!;
    expect(mss.jobs.map((j) => j.jobId).sort()).toEqual(['n', 'r']);
    expect(mss.calculated).toBe(1000);
  });

  it('adds up per-job entries saved before grouping, and replaces them when the group is saved', () => {
    const mss = groups.find((g) => g.label === 'MSS')!;
    const legacy: Payslip[] = [
      { id: 'p1', jobId: 'r', periodStart: 'a', periodEnd: 'b', amountPaid: 590 },
      { id: 'p2', jobId: 'n', periodStart: 'a', periodEnd: 'b', amountPaid: 400 },
      { id: 'p3', jobId: 'r', periodStart: 'x', periodEnd: 'y', amountPaid: 1 }, // another period: untouched
    ];
    expect(paidForGroup(mss, legacy, 'a', 'b')).toBe(990);

    const next = withGroupPayment(legacy, mss, 'a', 'b', 1000);
    expect(next).toHaveLength(2);
    expect(paidForGroup(mss, next, 'a', 'b')).toBe(1000);
    expect(next.find((p) => p.id === 'p3')).toBeDefined();

    expect(paidForGroup(mss, withGroupPayment(next, mss, 'a', 'b', null), 'a', 'b')).toBeNull();
  });
});
