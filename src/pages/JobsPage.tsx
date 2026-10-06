import { useState } from 'react';
import { Archive, ArchiveRestore, Briefcase, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Job } from '../types';
import { useJobs } from '../hooks/useData';
import { countShiftsForJob, deleteJobWithShifts, jobsRepo } from '../db/repository';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { JobForm } from '../components/jobs/JobForm';

export function JobsPage() {
  const jobs = useJobs();
  const [editingJob, setEditingJob] = useState<Job | 'new' | null>(null);

  async function toggleArchive(job: Job) {
    await jobsRepo.put({ ...job, archived: !job.archived, updatedAt: new Date().toISOString() });
  }

  async function handleDelete(job: Job) {
    const count = await countShiftsForJob(job.id);
    const detail = count > 0 ? ` and its ${count} shift${count === 1 ? '' : 's'}` : '';
    if (!confirm(`Delete "${job.name}"${detail}? This can't be undone.`)) return;
    await deleteJobWithShifts(job.id);
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader
        icon={<Briefcase className="h-5 w-5" />}
        title="Jobs"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditingJob('new')}>
            Add job
          </Button>
        }
      />

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:*:h-full">
        {jobs?.length === 0 && (
          <Card>
            <EmptyState
              icon={<Briefcase className="h-5 w-5" />}
              title="No jobs yet"
              subtitle="Add your first job to start logging shifts"
            />
          </Card>
        )}
        {jobs?.map((job, index) => (
          <Card key={job.id} className={`flex flex-col ${job.archived ? 'opacity-60' : ''}`} style={{ animationDelay: `${index * 70}ms` }}>
            <div className="flex items-start justify-between gap-2">
              <Badge color={job.color}>{job.name}</Badge>
              <div className="flex shrink-0 items-center gap-1.5">
                {job.kind === 'abn' && (
                  <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                    ABN
                  </span>
                )}
                {job.kind !== 'abn' && !job.taxable && (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    Cash
                  </span>
                )}
                {job.archived && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    Archived
                  </span>
                )}
              </div>
            </div>

            {job.kind === 'abn' ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <RateTile label="Paid as" value="Daily earnings" hint="You enter each day's total" />
                <RateTile label="Tax" value="Not withheld" hint="Set aside shown on Dashboard" />
              </div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <RateTile label="Day rate" value={`$${job.morningRate.toFixed(2)}`} hint="Standard hours" />
                  <RateTile
                    label="Night rate"
                    value={`$${job.nightRate.toFixed(2)}`}
                    hint={job.nightRateEndsAt ? `${job.nightRateStartsAt} – ${job.nightRateEndsAt}` : `From ${job.nightRateStartsAt}`}
                  />
                </div>
    
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <LoadingChip label="Sat" value={`+${Math.round((job.saturdayMultiplier - 1) * 100)}%`} />
                  <LoadingChip label="Sun" value={`+${Math.round((job.sundayMultiplier - 1) * 100)}%`} />
                  <LoadingChip label="PH" value={`+${Math.round((job.publicHolidayMultiplier - 1) * 100)}%`} />
                  {job.casualLoadingPercent > 0 && <LoadingChip label="Casual" value={`${job.casualLoadingPercent}%`} />}
                  {job.includeSuper && <LoadingChip label="Super" value={`${job.superRatePercent}%`} />}
                </div>
              </>
            )}

            <div className="mt-auto pt-4">
              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                <Button variant="secondary" className="w-full px-2!" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditingJob(job)}>
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  className="w-full px-2!"
                  icon={job.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  onClick={() => toggleArchive(job)}
                >
                  {job.archived ? 'Restore' : 'Archive'}
                </Button>
                <Button variant="danger" className="w-full px-2!" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => handleDelete(job)}>
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {editingJob && (
        <Modal title={editingJob === 'new' ? 'Add job' : 'Edit job'} onClose={() => setEditingJob(null)}>
          <JobForm job={editingJob === 'new' ? undefined : editingJob} onDone={() => setEditingJob(null)} />
        </Modal>
      )}
    </div>
  );
}

function RateTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  const isRate = value.startsWith('$');
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
        {value}
        {isRate && <span className="text-xs font-medium text-slate-400 dark:text-slate-500">/hr</span>}
      </p>
      <p className="text-xs tabular-nums text-slate-400 dark:text-slate-500">{hint}</p>
    </div>
  );
}

function LoadingChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {label} <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{value}</span>
    </span>
  );
}
