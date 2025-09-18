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
 * Default implementation of IJobAwaiter that polls for job status.
 * Uses a single interval timer to check all pending jobs.
 */
export class JobAwaiter implements IJobAwaiter {
  // Map from job ID to list of waiters (multiple waiters can wait for same job)
  private pendingJobs = new Map<string, JobWaiter[]>();
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private getJobStatus: (
      jobId: string,
      signal?: AbortSignal,
    ) => Promise<JobInfo>,
    private pollIntervalMs = 10,
  ) {
    //
  }

  shutdown(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Reject all pending jobs
    for (const [, waiters] of this.pendingJobs) {
      for (const waiter of waiters) {
        waiter.reject(new Error("JobAwaiter destroyed"));
      }
    }
    this.pendingJobs.clear();
  }

  async waitForJob(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    // Check if signal is already aborted
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    // Create promise for this job
    const promise = new Promise<JobInfo>((resolve, reject) => {
      const waiter: JobWaiter = { resolve, reject, signal };

      // Add to the list of waiters for this job
      const existingWaiters = this.pendingJobs.get(jobId) || [];
      existingWaiters.push(waiter);
      this.pendingJobs.set(jobId, existingWaiters);

      // If signal is provided, handle abort
      if (signal) {
        const abortHandler = () => {
          // Find and remove this specific waiter
          const waiters = this.pendingJobs.get(jobId);
          if (waiters) {
            const index = waiters.indexOf(waiter);
            if (index !== -1) {
              waiters.splice(index, 1);
              if (waiters.length === 0) {
                this.pendingJobs.delete(jobId);
              }
              waiter.reject(new Error("Operation aborted"));
              this.stopIntervalIfNoJobs();
            }
          }
        };

        signal.addEventListener("abort", abortHandler, { once: true });
      }
    });

    // Start interval if not already running
    this.startInterval();

    return promise;
  }

  private startInterval(): void {
    if (this.intervalId === null && this.pendingJobs.size > 0) {
      this.intervalId = setInterval(async () => {
        await this.checkPendingJobs();
      }, this.pollIntervalMs);
      // Check immediately as well - schedule it for next tick
      setTimeout(() => this.checkPendingJobs(), 0);
    }
  }

  private stopIntervalIfNoJobs(): void {
    if (this.pendingJobs.size === 0 && this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkPendingJobs(): Promise<void> {
    // Get unique job IDs to check
    const jobIds = Array.from(this.pendingJobs.keys());

    // Check each job
    const jobChecks = jobIds.map(async (jobId) => {
      const waiters = this.pendingJobs.get(jobId);
      if (!waiters || waiters.length === 0) {
        return;
      }

      try {
        // Filter out aborted waiters
        const activeWaiters = waiters.filter((w) => !w.signal?.aborted);

        if (activeWaiters.length === 0) {
          // All waiters were aborted
          this.pendingJobs.delete(jobId);
          return;
        }

        // Use the first active waiter's signal for the status check
        const jobInfo = await this.getJobStatus(jobId, activeWaiters[0].signal);

        // Check if job is complete
        if (
          jobInfo.status === JobStatus.COMPLETED ||
          jobInfo.status === JobStatus.FAILED
        ) {
          // Remove from pending
          this.pendingJobs.delete(jobId);

          // Resolve all active waiters
          for (const waiter of activeWaiters) {
            waiter.resolve(jobInfo);
          }

          // Reject aborted waiters
          for (const waiter of waiters) {
            if (waiter.signal?.aborted) {
              waiter.reject(new Error("Operation aborted"));
            }
          }
        }
      } catch (error) {
        // Remove from pending
        this.pendingJobs.delete(jobId);

        // Reject all waiters with the error
        for (const waiter of waiters) {
          waiter.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    });

    // Wait for all checks to complete
    await Promise.all(jobChecks);

    // Stop interval if no more jobs
    this.stopIntervalIfNoJobs();
  }
}
