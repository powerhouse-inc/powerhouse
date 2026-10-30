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
  summarizeSubmittedActions,
} from "../executor/util.js";
import type { Job } from "../queue/types.js";
import type { ErrorInfo } from "../shared/types.js";
import { JobStatus, type JobInfo } from "../shared/types.js";
import type { IJobTracker } from "./interfaces.js";

/** Sizes for telemetry. */
export type JobTrackerStats = {
  size: number;
  pending: number;
  running: number;
  writeReady: number;
  readReady: number;
  failed: number;
  failedWithPayload: number;
  failedPayloadBytes: number;
};

/**
 * In-memory implementation of IJobTracker.
 * Maintains job status in a Map for synchronous access.
 * Subscribes to operation events to update job states.
 */
export class InMemoryJobTracker implements IJobTracker {
  private jobs = new Map<string, JobInfo>();
  private unsubscribers: Unsubscribe[] = [];
  private readonly byStatus = new Map<JobStatus, number>();
  // Serialized size of each failed job's payload, measured when it failed.
  private readonly failedBytes = new Map<string, number>();
  private failedBytesTotal = 0;

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
      this.put({
        ...job,
        status: JobStatus.WRITE_READY,
        consistencyToken,
        // A reducer error or a denial leaves the job on its way to READ_READY,
        // so the status alone cannot tell the caller one of its actions was
        // rejected. This is where it finds out.
        result: summarizeSubmittedActions(
          event.operations,
          event.submittedActionIds,
        ),
      });
    }
  }

  private handleReadReady(event: JobReadReadyEvent): void {
    const jobId = event.jobId;
    const job = this.jobs.get(jobId);
    if (job && job.status === JobStatus.WRITE_READY) {
      this.put({
        ...job,
        status: JobStatus.READ_READY,
      });
    }
  }

  private handleJobFailed(event: JobFailedEvent): void {
    this.markFailed(
      event.jobId,
      {
        name: event.error.name,
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
    this.put({ ...jobInfo });
  }

  markRunning(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      // Job not found - might have been registered elsewhere
      // Create minimal job entry
      this.put({
        id: jobId,
        documentId: "",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: jobId, batchJobIds: [jobId] },
      });
      return;
    }

    this.put({
      ...job,
      status: JobStatus.RUNNING,
    });
  }

  markFailed(jobId: string, error: ErrorInfo, job?: Job): void {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      this.put({
        id: jobId,
        documentId: job?.documentId ?? "",
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

    this.put({
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

  /** What the tracker holds, kept current on each transition, so O(1). */
  stats(): JobTrackerStats {
    const count = (status: JobStatus) => this.byStatus.get(status) ?? 0;
    return {
      size: this.jobs.size,
      pending: count(JobStatus.PENDING),
      running: count(JobStatus.RUNNING),
      writeReady: count(JobStatus.WRITE_READY),
      readReady: count(JobStatus.READ_READY),
      failed: count(JobStatus.FAILED),
      failedWithPayload: this.failedBytes.size,
      failedPayloadBytes: this.failedBytesTotal,
    };
  }

  private put(job: JobInfo): void {
    const previous = this.jobs.get(job.id);
    if (previous) {
      this.byStatus.set(
        previous.status,
        (this.byStatus.get(previous.status) ?? 1) - 1,
      );
    }
    this.byStatus.set(job.status, (this.byStatus.get(job.status) ?? 0) + 1);
    this.jobs.set(job.id, job);

    this.failedBytesTotal -= this.failedBytes.get(job.id) ?? 0;
    this.failedBytes.delete(job.id);
    if (job.status === JobStatus.FAILED && job.job) {
      const bytes = payloadBytes(job.job);
      this.failedBytes.set(job.id, bytes);
      this.failedBytesTotal += bytes;
    }
  }
}

/** The JSON size of what a failed job holds on to; failures are rare enough. */
function payloadBytes(job: Job): number {
  try {
    return JSON.stringify([job.actions, job.operations]).length;
  } catch {
    return 0;
  }
}
