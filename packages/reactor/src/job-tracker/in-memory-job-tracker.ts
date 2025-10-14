import { JobStatus, type JobInfo } from "../shared/types.js";
import type { IJobTracker } from "./interfaces.js";

/**
 * In-memory implementation of IJobTracker.
 * Maintains job status in a Map for synchronous access.
 */
export class InMemoryJobTracker implements IJobTracker {
  private jobs = new Map<string, JobInfo>();

  registerJob(jobInfo: JobInfo): void {
    this.jobs.set(jobInfo.id, { ...jobInfo });
  }

  markRunning(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      // Job not found - might have been registered elsewhere
      // Create minimal job entry
      this.jobs.set(jobId, {
        id: jobId,
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
      });
      return;
    }

    // Update existing job
    this.jobs.set(jobId, {
      ...job,
      status: JobStatus.RUNNING,
    });
  }

  markCompleted(jobId: string, result?: any): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      // Job not found - create minimal completed entry
      this.jobs.set(jobId, {
        id: jobId,
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        completedAtUtcIso: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        result,
      });
      return;
    }

    // Update existing job
    this.jobs.set(jobId, {
      ...job,
      status: JobStatus.COMPLETED,
      completedAtUtcIso: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result,
    });
  }

  markFailed(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      // Job not found - create minimal failed entry
      this.jobs.set(jobId, {
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        completedAtUtcIso: new Date().toISOString(),
        error,
      });
      return;
    }

    // Update existing job
    this.jobs.set(jobId, {
      ...job,
      status: JobStatus.FAILED,
      completedAtUtcIso: new Date().toISOString(),
      error,
    });
  }

  getJobStatus(jobId: string): JobInfo | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }
}
