import type { IEventBus } from "../events/interfaces.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { IJobExecutionHandle } from "../queue/types.js";
import { QueueEventTypes } from "../queue/types.js";
import type { IJobExecutor, IJobExecutorManager } from "./interfaces.js";
import type { ExecutorManagerStatus, JobResult } from "./types.js";

export type JobExecutorFactory = () => IJobExecutor;

/**
 * Manages multiple job executors and coordinates job distribution.
 * Listens for job available events and dispatches jobs to executors.
 */
export class SimpleJobExecutorManager implements IJobExecutorManager {
  private executors: IJobExecutor[] = [];
  private isRunning = false;
  private activeJobs = 0;
  private totalJobsProcessed = 0;
  private unsubscribe?: () => void;

  constructor(
    private executorFactory: JobExecutorFactory,
    private eventBus: IEventBus,
    private queue: IQueue,
    private jobTracker: IJobTracker,
  ) {}

  async start(numExecutors: number): Promise<void> {
    if (this.isRunning) {
      throw new Error("JobExecutorManager is already running");
    }

    if (numExecutors < 1) {
      throw new Error("Number of executors must be at least 1");
    }

    // Create executors
    this.executors = [];
    for (let i = 0; i < numExecutors; i++) {
      this.executors.push(this.executorFactory());
    }

    // Start listening for job available events
    this.unsubscribe = this.eventBus.subscribe(
      QueueEventTypes.JOB_AVAILABLE,
      async () => {
        // Only process if we have capacity (simple round-robin for now)
        if (this.activeJobs < this.executors.length) {
          await this.processNextJob();
        }
      },
    );

    this.isRunning = true;

    // Process any existing jobs in the queue
    await this.processExistingJobs();
  }

  async stop(graceful = true): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Stop listening for new jobs
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    if (graceful) {
      // Wait for active jobs to complete
      while (this.activeJobs > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.executors = [];
    this.isRunning = false;
  }

  getExecutors(): IJobExecutor[] {
    return [...this.executors];
  }

  getStatus(): ExecutorManagerStatus {
    return {
      isRunning: this.isRunning,
      numExecutors: this.executors.length,
      activeJobs: this.activeJobs,
      totalJobsProcessed: this.totalJobsProcessed,
    };
  }

  private async processNextJob(): Promise<void> {
    // dequeue next available job
    let handle: IJobExecutionHandle | null;
    try {
      handle = await this.queue.dequeueNext();
    } catch (error) {
      console.error("Error dequeueing job:", error);
      return;
    }

    if (!handle) {
      return;
    }

    // start the job execution
    handle.start();
    this.activeJobs++;
    this.jobTracker.markRunning(handle.job.id);

    // Find an available executor (simple round-robin)
    const executorIndex = this.totalJobsProcessed % this.executors.length;
    const executor = this.executors[executorIndex];

    // execute the job
    let result: JobResult;
    try {
      result = await executor.executeJob(handle.job);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Error executing job ${handle.job.id}:`, errorMessage);

      handle.fail(errorMessage);
      this.activeJobs--;
      this.jobTracker.markFailed(handle.job.id, errorMessage);

      await this.checkForMoreJobs();
      return;
    }

    // handle the result
    if (result.success) {
      handle.complete();
      this.totalJobsProcessed++;
      this.jobTracker.markCompleted(handle.job.id, result.operations);
    } else {
      // Handle retry logic
      const retryCount = handle.job.retryCount || 0;
      const maxRetries = handle.job.maxRetries || 0;

      if (retryCount < maxRetries) {
        try {
          await this.queue.retryJob(handle.job.id, result.error?.message);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to retry job";
          console.error(`Failed to retry job ${handle.job.id}:`, errorMessage);

          this.jobTracker.markFailed(handle.job.id, errorMessage);
          handle.fail(errorMessage);
        }
      } else {
        const currentError = result.error?.message || "Unknown error";

        const fullErrorMessage = this.formatErrorHistory(
          handle.job.errorHistory,
          currentError,
          retryCount + 1,
        );

        this.jobTracker.markFailed(handle.job.id, fullErrorMessage);
        handle.fail(fullErrorMessage);
      }
    }

    this.activeJobs--;
    await this.checkForMoreJobs();
  }

  private async checkForMoreJobs(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    let hasMore: boolean;
    try {
      hasMore = await this.queue.hasJobs();
    } catch (error) {
      console.error("Error checking for more jobs:", error);
      return;
    }

    if (hasMore) {
      await this.processNextJob();
    }
  }

  private async processExistingJobs(): Promise<void> {
    let hasJobs: boolean;
    try {
      hasJobs = await this.queue.hasJobs();
    } catch (error) {
      console.error("Error checking for existing jobs:", error);
      return;
    }

    if (hasJobs) {
      // Start processing up to the number of executors
      const promises: Promise<void>[] = [];
      for (let i = 0; i < Math.min(this.executors.length, 5); i++) {
        promises.push(this.processNextJob());
      }

      try {
        await Promise.all(promises);
      } catch (error) {
        console.error("Error processing existing jobs:", error);
      }
    }
  }

  private formatErrorHistory(
    errorHistory: string[],
    currentError: string,
    totalAttempts: number,
  ): string {
    const allErrors = [...errorHistory, currentError];

    if (allErrors.length === 1) {
      return currentError;
    }

    const lines = [`Job failed after ${totalAttempts} attempts:`];
    allErrors.forEach((error, index) => {
      lines.push(`[Attempt ${index + 1}] ${error}`);
    });

    return lines.join("\n");
  }
}
