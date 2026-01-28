import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobFailedEvent,
  type JobReadReadyEvent,
  type JobWriteReadyEvent,
  type Unsubscribe,
} from "../events/types.js";
import { JobStatus, type JobInfo } from "./types.js";

export interface IJobAwaiter {
  /**
   * Waits for a job to complete: turns a job into a promise.
   *
   * @param jobId - The job id or job object
   * @param signal - Optional abort signal to cancel the request
   * @returns The result of the job
   */
  waitForJob(jobId: string, signal?: AbortSignal): Promise<JobInfo>;

  /**
   * Shuts down the job awaiter. This will synchronously reject all pending jobs.
   */
  shutdown(): void;
}

type JobWaiter = {
  resolve: (value: JobInfo) => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
};

/**
 * Checks if a job status is terminal (job has finished).
 * WRITE_READY is not terminal - it's an intermediate state.
 * Only READ_READY and FAILED are truly terminal.
 */
function isTerminalStatus(status: JobStatus): boolean {
  return status === JobStatus.READ_READY || status === JobStatus.FAILED;
}

/**
 * Event-driven implementation of IJobAwaiter.
 * Subscribes to operation events to detect job completion without polling.
 */
export class JobAwaiter implements IJobAwaiter {
  private pendingJobs = new Map<string, JobWaiter[]>();
  private unsubscribers: Unsubscribe[] = [];

  constructor(
    private eventBus: IEventBus,
    private getJobStatus: (
      jobId: string,
      signal?: AbortSignal,
    ) => Promise<JobInfo>,
  ) {
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.eventBus.subscribe(
        ReactorEventTypes.JOB_WRITE_READY,
        async (_type, event: JobWriteReadyEvent) => {
          await this.handleWriteReady(event);
        },
      ),
    );

    this.unsubscribers.push(
      this.eventBus.subscribe(
        ReactorEventTypes.JOB_READ_READY,
        async (_type, event: JobReadReadyEvent) => {
          await this.handleReadReady(event);
        },
      ),
    );

    this.unsubscribers.push(
      this.eventBus.subscribe(
        ReactorEventTypes.JOB_FAILED,
        async (_type, event: JobFailedEvent) => {
          await this.handleJobFailed(event);
        },
      ),
    );
  }

  shutdown(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    for (const [, waiters] of this.pendingJobs) {
      for (const waiter of waiters) {
        waiter.reject(new Error("JobAwaiter destroyed"));
      }
    }
    this.pendingJobs.clear();
  }

  async waitForJob(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const currentStatus = await this.getJobStatus(jobId, signal);
    if (isTerminalStatus(currentStatus.status)) {
      return currentStatus;
    }

    const promise = new Promise<JobInfo>((resolve, reject) => {
      const waiter: JobWaiter = { resolve, reject, signal };

      const existingWaiters = this.pendingJobs.get(jobId) || [];
      existingWaiters.push(waiter);
      this.pendingJobs.set(jobId, existingWaiters);

      if (signal) {
        const abortHandler = () => {
          const waiters = this.pendingJobs.get(jobId);
          if (waiters) {
            const index = waiters.indexOf(waiter);
            if (index !== -1) {
              waiters.splice(index, 1);
              if (waiters.length === 0) {
                this.pendingJobs.delete(jobId);
              }
              waiter.reject(new Error("Operation aborted"));
            }
          }
        };

        signal.addEventListener("abort", abortHandler, { once: true });
      }
    });

    return promise;
  }

  private async handleWriteReady(event: JobWriteReadyEvent): Promise<void> {
    const jobId = event.jobId;
    await this.checkAndResolveWaiters(jobId);
  }

  private async handleReadReady(event: JobReadReadyEvent): Promise<void> {
    const jobId = event.jobId;
    await this.checkAndResolveWaiters(jobId);
  }

  private async handleJobFailed(event: JobFailedEvent): Promise<void> {
    await this.checkAndResolveWaiters(event.jobId);
  }

  private async checkAndResolveWaiters(jobId: string): Promise<void> {
    const waiters = this.pendingJobs.get(jobId);
    if (!waiters || waiters.length === 0) {
      return;
    }

    try {
      const activeWaiters = waiters.filter((w) => !w.signal?.aborted);

      if (activeWaiters.length === 0) {
        this.pendingJobs.delete(jobId);
        return;
      }

      const jobInfo = await this.getJobStatus(jobId, activeWaiters[0].signal);

      if (isTerminalStatus(jobInfo.status)) {
        this.pendingJobs.delete(jobId);

        for (const waiter of activeWaiters) {
          waiter.resolve(jobInfo);
        }

        for (const waiter of waiters) {
          if (waiter.signal?.aborted) {
            waiter.reject(new Error("Operation aborted"));
          }
        }
      }
    } catch (error) {
      this.pendingJobs.delete(jobId);

      for (const waiter of waiters) {
        waiter.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }
}
