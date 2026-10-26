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

/**
 * A stage of a job a caller can wait for.
 *
 * - `written`: the operations are in the log (WRITE_READY).
 * - `readable`: every pre-ready read model holds them (READ_READY).
 *
 * FAILED settles either stage. A job that reached READ_READY has passed
 * WRITE_READY, so `readable` also settles `written`.
 */
export type JobStage = "written" | "readable";

/** An awaiter that can also wait for the `written` stage. */
export interface IJobStageAwaiter extends IJobAwaiter {
  /**
   * Waits until the job reaches the stage, or FAILED. Resolves with the job in
   * either case; a FAILED job is not a rejection here.
   *
   * @param jobId - The job id
   * @param stage - The stage to wait for
   * @param signal - Optional abort signal to cancel the wait
   * @returns The job as it stood when the stage settled
   */
  waitForStage(
    jobId: string,
    stage: JobStage,
    signal?: AbortSignal,
  ): Promise<JobInfo>;
}

/** Whether the awaiter can wait for a stage short of READ_READY. */
export function isJobStageAwaiter(
  awaiter: IJobAwaiter,
): awaiter is IJobStageAwaiter {
  return (
    typeof (awaiter as Partial<IJobStageAwaiter>).waitForStage === "function"
  );
}

type JobWaiter = {
  stage: JobStage;
  resolve: (value: JobInfo) => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
};

/**
 * Whether a job in `status` has settled the stage. WRITE_READY settles only
 * `written`; READ_READY and FAILED settle both.
 */
export function settlesStage(status: JobStatus, stage: JobStage): boolean {
  if (status === JobStatus.READ_READY || status === JobStatus.FAILED) {
    return true;
  }
  return stage === "written" && status === JobStatus.WRITE_READY;
}

/**
 * Event-driven implementation of IJobAwaiter.
 * Subscribes to operation events to detect job completion without polling.
 */
export class JobAwaiter implements IJobStageAwaiter {
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
    return this.waitForStage(jobId, "readable", signal);
  }

  async waitForStage(
    jobId: string,
    stage: JobStage,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const currentStatus = await this.getJobStatus(jobId, signal);
    if (settlesStage(currentStatus.status, stage)) {
      return currentStatus;
    }

    const promise = new Promise<JobInfo>((resolve, reject) => {
      const waiter: JobWaiter = { stage, resolve, reject, signal };

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

      const remaining = activeWaiters.filter(
        (waiter) => !settlesStage(jobInfo.status, waiter.stage),
      );
      if (remaining.length === activeWaiters.length) {
        return;
      }

      if (remaining.length === 0) {
        this.pendingJobs.delete(jobId);
      } else {
        this.pendingJobs.set(jobId, remaining);
      }

      for (const waiter of activeWaiters) {
        if (!remaining.includes(waiter)) {
          waiter.resolve(jobInfo);
        }
      }

      for (const waiter of waiters) {
        if (waiter.signal?.aborted) {
          waiter.reject(new Error("Operation aborted"));
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
