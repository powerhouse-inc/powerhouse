import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes, type JobRunningEvent } from "../events/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { IJobExecutionHandle } from "../queue/types.js";
import { QueueEventTypes } from "../queue/types.js";
import type { IDocumentModelResolver } from "../registry/document-model-resolver.js";
import type { IJobExecutor, IJobExecutorManager } from "./interfaces.js";
import { DeferredJobs } from "./deferred-jobs.js";
import {
  JobResultHandler,
  toErrorInfo,
  type IJobResultHandler,
} from "./job-result-handler.js";
import {
  DEFAULT_DEFERRED_JOB_TTL_MS,
  JobExecutorEventTypes,
  type ExecutorManagerStatus,
  type JobCompletedEvent,
  type JobFailedEvent,
  type JobResult,
  type JobStartedEvent,
} from "./types.js";

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
  private deferredJobs: DeferredJobs;
  private resultHandler: IJobResultHandler;

  private jobTimeoutMs: number;

  constructor(
    private executorFactory: JobExecutorFactory,
    private eventBus: IEventBus,
    private queue: IQueue,
    private jobTracker: IJobTracker,
    private logger: ILogger,
    private resolver: IDocumentModelResolver,
    jobTimeoutMs: number = 30_000,
    deferredJobTtlMs: number = DEFAULT_DEFERRED_JOB_TTL_MS,
  ) {
    this.jobTimeoutMs = jobTimeoutMs;
    this.deferredJobs = new DeferredJobs(
      queue,
      jobTracker,
      eventBus,
      logger,
      deferredJobTtlMs,
      () => this.checkForMoreJobs(),
    );
    this.resultHandler = new JobResultHandler(
      queue,
      jobTracker,
      eventBus,
      resolver,
      logger,
    );
  }

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

    // Fail any deferred jobs that were never flushed
    this.deferredJobs.failAll();

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
    const workerId = `in-process-${executorIndex}`;

    const startedEvent: JobStartedEvent = {
      job: handle.job,
      startedAt: new Date().toISOString(),
      workerId,
    };
    this.eventBus
      .emit(JobExecutorEventTypes.JOB_STARTED, startedEvent)
      .catch(() => {});

    // execute the job with a timeout signal; race ensures the timeout fires
    // even if the executor hangs on a call that does not check the signal
    const signal = AbortSignal.timeout(this.jobTimeoutMs);
    const toError = (reason: unknown): Error =>
      reason instanceof Error ? reason : new Error(String(reason));
    const abortPromise = new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(toError(signal.reason));
        return;
      }
      signal.addEventListener("abort", () => reject(toError(signal.reason)), {
        once: true,
      });
    });
    let result: JobResult;
    try {
      result = await Promise.race([
        executor.executeJob(handle.job, signal),
        abortPromise,
      ]);
    } catch (error) {
      const errorInfo = toErrorInfo(
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

      const failedEvent: JobFailedEvent = {
        job: handle.job,
        error: errorInfo.message,
        willRetry: false,
        retryCount: 0,
        workerId,
      };
      this.eventBus
        .emit(JobExecutorEventTypes.JOB_FAILED, failedEvent)
        .catch(() => {});

      await this.checkForMoreJobs();
      return;
    }

    // handle the result
    if (result.success) {
      this.totalJobsProcessed++;
    }

    if (result.success) {
      const completedEvent: JobCompletedEvent = {
        job: handle.job,
        result,
        workerId,
      };
      this.eventBus
        .emit(JobExecutorEventTypes.JOB_COMPLETED, completedEvent)
        .catch(() => {});
    } else {
      const failedEvent: JobFailedEvent = {
        job: handle.job,
        error: result.error?.message ?? "unknown",
        willRetry: false,
        retryCount: 0,
        workerId,
      };
      this.eventBus
        .emit(JobExecutorEventTypes.JOB_FAILED, failedEvent)
        .catch(() => {});
    }

    await this.resultHandler.handleResult(handle, result, {
      deferJob: (documentId, job) => this.deferredJobs.add(documentId, job),
      flushDeferredFor: (documentId) => this.deferredJobs.flush(documentId),
    });

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
}
