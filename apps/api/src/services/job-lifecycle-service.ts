import type { JobEntity } from "../entities/job-entity.js";

const terminalStatuses = new Set(["completed", "failed", "canceled"]);

export interface JobLifecycle {
  start(job: JobEntity, message: string): boolean;
  updateProgress(job: JobEntity, progress: number, message?: string): boolean;
  complete(job: JobEntity, message: string): boolean;
  fail(job: JobEntity, message: string): boolean;
  cancel(job: JobEntity, message: string): boolean;
  isTerminal(job: JobEntity): boolean;
}

export class JobLifecycleService implements JobLifecycle {
  start(job: JobEntity, message: string): boolean {
    if (job.status !== "queued") return false;
    job.status = "running";
    job.message = message;
    return true;
  }

  updateProgress(job: JobEntity, progress: number, message?: string): boolean {
    if (job.status !== "running") return false;
    job.progress = clampProgress(progress);
    if (message !== undefined) job.message = message;
    return true;
  }

  complete(job: JobEntity, message: string): boolean {
    if (job.status !== "running") return false;
    job.status = "completed";
    job.progress = 100;
    job.message = message;
    job.completedAt = new Date().toISOString();
    return true;
  }

  fail(job: JobEntity, message: string): boolean {
    if (job.status !== "queued" && job.status !== "running") return false;
    job.status = "failed";
    job.message = message;
    job.completedAt = new Date().toISOString();
    return true;
  }

  cancel(job: JobEntity, message: string): boolean {
    if (job.status !== "queued" && job.status !== "running") return false;
    job.status = "canceled";
    job.message = message;
    job.completedAt = new Date().toISOString();
    return true;
  }

  isTerminal(job: JobEntity): boolean {
    return terminalStatuses.has(job.status);
  }
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}
