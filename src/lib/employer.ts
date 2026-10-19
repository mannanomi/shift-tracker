import type { Job } from '../types';

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
