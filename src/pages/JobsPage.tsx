import { useState } from 'react';
import { Archive, ArchiveRestore, Briefcase, Pencil, Plus } from 'lucide-react';
import type { Job } from '../types';
import { useJobs } from '../hooks/useData';
import { jobsRepo } from '../db/repository';
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

      <div className="space-y-3">
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
                  ${job.morningRate.toFixed(2)}/hr day · ${job.nightRate.toFixed(2)}/hr night (from {job.nightRateStartsAt})
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Sat +{Math.round((job.saturdayMultiplier - 1) * 100)}% · Sun +{Math.round((job.sundayMultiplier - 1) * 100)}% · PH +
                  {Math.round((job.publicHolidayMultiplier - 1) * 100)}%
                  {job.casualLoadingPercent > 0 && ` · Casual loading ${job.casualLoadingPercent}%`}
                  {job.includeSuper && ` · Super ${job.superRatePercent}%`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
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
