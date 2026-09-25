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
    <div className="space-y-4">
      <PageHeader
        icon={<Briefcase className="h-5 w-5" />}
        title="Jobs"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditingJob('new')}>
            Add job
          </Button>
        }
      />

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {jobs?.length === 0 && (
          <Card>
            <EmptyState
              icon={<Briefcase className="h-5 w-5" />}
              title="No jobs yet"
              subtitle="Add your first job to start logging shifts"
            />
          </Card>
        )}
        {jobs?.map((job) => (
          <Card key={job.id} className={job.archived ? 'opacity-60' : ''}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={job.color}>{job.name}</Badge>
                  {!job.taxable && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                      Cash
                    </span>
                  )}
                  {job.archived && <span className="text-xs text-slate-400 dark:text-slate-500">(archived)</span>}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  ${job.morningRate.toFixed(2)}/hr day · ${job.nightRate.toFixed(2)}/hr night ({job.nightRateStartsAt}
                  {job.nightRateEndsAt ? `–${job.nightRateEndsAt}` : ' onward'})
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Sat +{Math.round((job.saturdayMultiplier - 1) * 100)}% · Sun +{Math.round((job.sundayMultiplier - 1) * 100)}% · PH +
                  {Math.round((job.publicHolidayMultiplier - 1) * 100)}%
                  {job.casualLoadingPercent > 0 && ` · Casual loading ${job.casualLoadingPercent}%`}
                  {job.includeSuper && ` · Super ${job.superRatePercent}%`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <Button variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditingJob(job)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  icon={job.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  onClick={() => toggleArchive(job)}
                >
                  {job.archived ? 'Unarchive' : 'Archive'}
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => handleDelete(job)}
                >
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
