import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes, type JobRunningEvent } from "../events/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { ILogger } from "../logging/types.js";
import type { IQueue } from "../queue/interfaces.js";
import type { IJobExecutionHandle } from "../queue/types.js";
import { QueueEventTypes } from "../queue/types.js";
import type { IDocumentModelResolver } from "../registry/document-model-resolver.js";
import { ModuleNotFoundError } from "../registry/implementation.js";
import type { ErrorInfo } from "../shared/types.js";
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
    private logger: ILogger,
    private resolver: IDocumentModelResolver,
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
      this.logger.error("Error dequeueing next job: @Error", error);
      return;
    }

    if (!handle) {
      return;
    }

    // start the job execution
    handle.start();
    this.activeJobs++;
    this.jobTracker.markRunning(handle.job.id);

    // Emit JOB_RUNNING event
    const runningEvent: JobRunningEvent = {
      jobId: handle.job.id,
      jobMeta: handle.job.meta,
    };
    this.eventBus
      .emit(ReactorEventTypes.JOB_RUNNING, runningEvent)
      .catch(() => {
        // Ignore event emission errors
      });

    // Find an available executor (simple round-robin)
    const executorIndex = this.totalJobsProcessed % this.executors.length;
    const executor = this.executors[executorIndex];

    // execute the job
    let result: JobResult;
    try {
      result = await executor.executeJob(handle.job);
    } catch (error) {
      const errorInfo = this.toErrorInfo(
        error instanceof Error ? error : String(error),
      );

      handle.fail(errorInfo);
      this.activeJobs--;
      this.jobTracker.markFailed(handle.job.id, errorInfo, handle.job);

      this.eventBus
        .emit(ReactorEventTypes.JOB_FAILED, {
          jobId: handle.job.id,
          error: new Error(errorInfo.message),
          job: handle.job,
        })
        .catch(() => {});

      await this.checkForMoreJobs();
      return;
    }

    // handle the result
    if (result.success) {
      handle.complete();
      this.totalJobsProcessed++;
    } else {
      // Attempt model recovery before exhausting retries
      if (result.error && ModuleNotFoundError.isError(result.error)) {
        let modelLoaded = false;
        try {
          await this.resolver.ensureModelLoaded(result.error.documentType);
          modelLoaded = true;
        } catch {
          // Model could not be loaded, fall through to normal failure path
        }

        if (modelLoaded) {
          const errorInfo = this.toErrorInfo(result.error);
          try {
            await this.queue.retryJob(handle.job.id, errorInfo);
            this.activeJobs--;
            await this.checkForMoreJobs();
            return;
          } catch {
            // Fall through to normal failure path
          }
        }
      }

      // Handle retry logic
      const retryCount = handle.job.retryCount || 0;
      const maxRetries = handle.job.maxRetries || 0;

      if (retryCount < maxRetries) {
        const currentErrorInfo = result.error
          ? this.toErrorInfo(result.error)
          : this.toErrorInfo("Unknown error");

        try {
          await this.queue.retryJob(handle.job.id, currentErrorInfo);
        } catch (error) {
          const retryErrorInfo = this.toErrorInfo(
            error instanceof Error ? error : "Failed to retry job",
          );

          this.jobTracker.markFailed(handle.job.id, retryErrorInfo, handle.job);

          this.eventBus
            .emit(ReactorEventTypes.JOB_FAILED, {
              jobId: handle.job.id,
              error: new Error(retryErrorInfo.message),
              job: handle.job,
            })
            .catch(() => {});

          handle.fail(retryErrorInfo);
        }
      } else {
        const currentErrorInfo = result.error
          ? this.toErrorInfo(result.error)
          : this.toErrorInfo("Unknown error");

        const fullErrorInfo = this.formatErrorHistory(
          handle.job.errorHistory,
          currentErrorInfo,
          retryCount + 1,
        );

        this.jobTracker.markFailed(handle.job.id, fullErrorInfo, handle.job);

        this.eventBus
          .emit(ReactorEventTypes.JOB_FAILED, {
            jobId: handle.job.id,
            error: new Error(fullErrorInfo.message),
            job: handle.job,
          })
          .catch(() => {});

        handle.fail(fullErrorInfo);
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
      this.logger.error("Error checking for more jobs: @Error", error);
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
      this.logger.error("Error checking for existing jobs: @Error", error);
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
        this.logger.error("Error processing existing jobs: @Error", error);
      }
    }
  }

  private toErrorInfo(error: Error | string): ErrorInfo {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack || new Error().stack || "",
      };
    }
    return {
      message: error,
      stack: new Error().stack || "",
    };
  }

  private formatErrorHistory(
    errorHistory: ErrorInfo[],
    currentError: ErrorInfo,
    totalAttempts: number,
  ): ErrorInfo {
    const allErrors = [...errorHistory, currentError];

    if (allErrors.length === 1) {
      return currentError;
    }

    const messageLines = [`Job failed after ${totalAttempts} attempts:`];
    const stackLines: string[] = [];

    allErrors.forEach((error, index) => {
      messageLines.push(`[Attempt ${index + 1}] ${error.message}`);
      stackLines.push(`[Attempt ${index + 1}] Stack trace:\n${error.stack}`);
    });

    return {
      message: messageLines.join("\n"),
      stack: stackLines.join("\n\n"),
    };
  }
}
