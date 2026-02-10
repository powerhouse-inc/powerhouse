import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobFailedEvent,
  type JobReadReadyEvent,
  type JobWriteReadyEvent,
  type Unsubscribe,
} from "../events/types.js";
import {
  createConsistencyToken,
  createEmptyConsistencyToken,
} from "../executor/util.js";
import type { Job } from "../queue/types.js";
import type { ErrorInfo } from "../shared/types.js";
import { JobStatus, type JobInfo } from "../shared/types.js";
import type { IJobTracker } from "./interfaces.js";

/**
 * In-memory implementation of IJobTracker.
 * Maintains job status in a Map for synchronous access.
 * Subscribes to operation events to update job states.
 */
export class InMemoryJobTracker implements IJobTracker {
  private jobs = new Map<string, JobInfo>();
  private unsubscribers: Unsubscribe[] = [];

  constructor(private eventBus: IEventBus) {
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.eventBus.subscribe(
        ReactorEventTypes.JOB_WRITE_READY,
        (_type, event: JobWriteReadyEvent) => {
          this.handleWriteReady(event);
        },
      ),
    );

    this.unsubscribers.push(
      this.eventBus.subscribe(
        ReactorEventTypes.JOB_READ_READY,
        (_type, event: JobReadReadyEvent) => {
          this.handleReadReady(event);
        },
      ),
    );

    this.unsubscribers.push(
      this.eventBus.subscribe(
        ReactorEventTypes.JOB_FAILED,
        (_type, event: JobFailedEvent) => {
          this.handleJobFailed(event);
        },
      ),
    );
  }

  private handleWriteReady(event: JobWriteReadyEvent): void {
    const jobId = event.jobId;
    const job = this.jobs.get(jobId);
    if (job && job.status === JobStatus.RUNNING) {
      const consistencyToken = createConsistencyToken(event.operations);
      this.jobs.set(jobId, {
        ...job,
        status: JobStatus.WRITE_READY,
        consistencyToken,
      });
    }
  }

  private handleReadReady(event: JobReadReadyEvent): void {
    const jobId = event.jobId;
    const job = this.jobs.get(jobId);
    if (job && job.status === JobStatus.WRITE_READY) {
      this.jobs.set(jobId, {
        ...job,
        status: JobStatus.READ_READY,
      });
    }
  }

  private handleJobFailed(event: JobFailedEvent): void {
    this.markFailed(
      event.jobId,
      {
        message: event.error.message,
        stack: event.error.stack || "",
      },
      event.job,
    );
  }

  shutdown(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

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
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: jobId, batchJobIds: [jobId] },
      });
      return;
    }

    // Update existing job
    this.jobs.set(jobId, {
      ...job,
      status: JobStatus.RUNNING,
    });
  }

  markFailed(jobId: string, error: ErrorInfo, job?: Job): void {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      this.jobs.set(jobId, {
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        completedAtUtcIso: new Date().toISOString(),
        error,
        job,
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: jobId, batchJobIds: [jobId] },
      });
      return;
    }

    this.jobs.set(jobId, {
      ...existing,
      status: JobStatus.FAILED,
      completedAtUtcIso: new Date().toISOString(),
      error,
      job,
      consistencyToken: createEmptyConsistencyToken(),
    });
  }

  getJobStatus(jobId: string): JobInfo | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }
}
