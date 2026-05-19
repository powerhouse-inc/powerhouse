import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes, type JobRunningEvent } from "../events/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { IJobExecutionHandle, Job } from "../queue/types.js";
import { QueueEventTypes } from "../queue/types.js";
import type { IDocumentModelResolver } from "../registry/document-model-resolver.js";
import { DocumentNotFoundError } from "../shared/errors.js";
import type { IJobExecutor, IJobExecutorManager } from "./interfaces.js";
import {
  JobResultHandler,
  toErrorInfo,
  type IJobResultHandler,
} from "./job-result-handler.js";
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
  private deferredJobs = new Map<string, Job[]>();
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
  ) {
    this.jobTimeoutMs = jobTimeoutMs;
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
    for (const [, jobs] of this.deferredJobs) {
      for (const job of jobs) {
        const errorInfo = toErrorInfo(
          new DocumentNotFoundError(job.documentId),
        );
        this.jobTracker.markFailed(job.id, errorInfo, job);
        this.eventBus
          .emit(ReactorEventTypes.JOB_FAILED, {
            jobId: job.id,
            error: new DocumentNotFoundError(job.documentId),
            job,
          })
          .catch(() => {});
      }
    }
    this.deferredJobs.clear();

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

      await this.checkForMoreJobs();
      return;
    }

    // handle the result
    if (result.success) {
      this.totalJobsProcessed++;
    }

    await this.resultHandler.handleResult(handle, result, {
      deferJob: (documentId, job) => {
        const existing = this.deferredJobs.get(documentId) ?? [];
        existing.push(job);
        this.deferredJobs.set(documentId, existing);
      },
      flushDeferredFor: (documentId) => this.flushDeferredJobs(documentId),
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

  private async flushDeferredJobs(documentId: string): Promise<void> {
    const jobs = this.deferredJobs.get(documentId);
    if (!jobs || jobs.length === 0) {
      return;
    }
    this.deferredJobs.delete(documentId);

    for (const job of jobs) {
      try {
        await this.queue.enqueue(job);
      } catch (error) {
        this.logger.error("Error re-enqueuing deferred job: @Error", error);
      }
    }
  }
}
