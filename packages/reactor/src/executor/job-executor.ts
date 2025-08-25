import { type IEventBus } from "../events/interfaces.js";
import { type IQueue } from "../queue/interfaces.js";
import {
  type Job,
  QueueEventTypes,
  type JobAvailableEvent,
} from "../queue/types.js";
import { type IJobExecutor } from "./interfaces.js";
import {
  type ExecutorStartedEvent,
  type ExecutorStoppedEvent,
  type JobCompletedEvent,
  type JobExecutorConfig,
  JobExecutorEventTypes,
  type JobFailedEvent,
  type JobResult,
  type JobStartedEvent,
} from "./types.js";

/**
 * Default configuration for the job executor
 */
const DEFAULT_CONFIG: Required<JobExecutorConfig> = {
  maxConcurrency: 5,
  jobTimeout: 30000, // 30 seconds
  retryBaseDelay: 1000, // 1 second
  retryMaxDelay: 30000, // 30 seconds
};

/**
 * In-memory implementation of the IJobExecutor interface.
 * Listens for job available events and executes jobs with concurrency control and retry logic.
 */
export class InMemoryJobExecutor implements IJobExecutor {
  private isRunning = false;
  private isPaused = false;
  private config: Required<JobExecutorConfig> = DEFAULT_CONFIG;
  private activeJobs = new Set<string>();
  private jobAvailableUnsubscribe?: () => void;
  private startedAt?: Date;

  // Statistics
  private totalJobsProcessed = 0;
  private totalJobsSucceeded = 0;
  private totalJobsFailed = 0;
  private lastJobCompletedAt?: string;
  private executionTimes: number[] = [];

  // Job execution tracking
  private jobPromises = new Map<string, Promise<JobResult>>();
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private eventBus: IEventBus,
    private queue: IQueue,
  ) {}

  async start(config?: JobExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Job executor is already running");
    }

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isRunning = true;
    this.isPaused = false;
    this.startedAt = new Date();

    // Subscribe to job available events
    this.jobAvailableUnsubscribe = this.eventBus.subscribe(
      QueueEventTypes.JOB_AVAILABLE,
      this.handleJobAvailable.bind(this),
    );

    // Emit executor started event
    const startedEvent: ExecutorStartedEvent = {
      config: this.config,
      startedAt: this.startedAt.toISOString(),
    };

    await this.eventBus.emit(
      JobExecutorEventTypes.EXECUTOR_STARTED,
      startedEvent,
    );

    // Check for existing jobs in the queue
    await this.processAvailableJobs();
  }

  async stop(graceful = true): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Unsubscribe from job available events
    if (this.jobAvailableUnsubscribe) {
      this.jobAvailableUnsubscribe();
      this.jobAvailableUnsubscribe = undefined;
    }

    if (graceful) {
      // Wait for all active jobs to complete
      await Promise.allSettled(Array.from(this.jobPromises.values()));
    } else {
      // Abort all active jobs
      for (const controller of this.abortControllers.values()) {
        controller.abort();
      }
    }

    // Clean up
    this.activeJobs.clear();
    this.jobPromises.clear();
    this.abortControllers.clear();

    // Emit executor stopped event
    const stoppedEvent: ExecutorStoppedEvent = {
      stoppedAt: new Date().toISOString(),
      graceful,
    };

    await this.eventBus.emit(
      JobExecutorEventTypes.EXECUTOR_STOPPED,
      stoppedEvent,
    );
  }

  async executeJob(job: Job): Promise<JobResult> {
    return this.executeJobInternal(job);
  }

  async getStatus() {
    const uptime = this.startedAt
      ? Date.now() - this.startedAt.getTime()
      : undefined;

    return {
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      totalJobsProcessed: this.totalJobsProcessed,
      totalJobsSucceeded: this.totalJobsSucceeded,
      totalJobsFailed: this.totalJobsFailed,
      lastJobCompletedAt: this.lastJobCompletedAt,
      uptime,
    };
  }

  async getStats() {
    const averageExecutionTime =
      this.executionTimes.length > 0
        ? this.executionTimes.reduce((sum, time) => sum + time, 0) /
          this.executionTimes.length
        : 0;

    const successRate =
      this.totalJobsProcessed > 0
        ? this.totalJobsSucceeded / this.totalJobsProcessed
        : 0;

    const uptime = this.startedAt
      ? (Date.now() - this.startedAt.getTime()) / 1000
      : 0;
    const jobsPerSecond = uptime > 0 ? this.totalJobsProcessed / uptime : 0;

    const queueBacklog = await this.queue.totalSize();

    return {
      averageExecutionTime,
      successRate,
      jobsPerSecond,
      queueBacklog,
    };
  }

  async pause(): Promise<void> {
    this.isPaused = true;
  }

  async resume(): Promise<void> {
    this.isPaused = false;
    // Process any available jobs
    await this.processAvailableJobs();
  }

  on(
    event:
      | "jobStarted"
      | "jobCompleted"
      | "jobFailed"
      | "executorStarted"
      | "executorStopped",
    handler: (data: any) => void,
  ): () => void {
    const eventType = this.getEventType(event);
    return this.eventBus.subscribe(eventType, (_, data) => handler(data));
  }

  private getEventType(event: string): number {
    switch (event) {
      case "jobStarted":
        return JobExecutorEventTypes.JOB_STARTED;
      case "jobCompleted":
        return JobExecutorEventTypes.JOB_COMPLETED;
      case "jobFailed":
        return JobExecutorEventTypes.JOB_FAILED;
      case "executorStarted":
        return JobExecutorEventTypes.EXECUTOR_STARTED;
      case "executorStopped":
        return JobExecutorEventTypes.EXECUTOR_STOPPED;
      default:
        throw new Error(`Unknown event type: ${event}`);
    }
  }

  private async handleJobAvailable(
    _: number,
    event: JobAvailableEvent,
  ): Promise<void> {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    await this.processAvailableJobs();
  }

  private async processAvailableJobs(): Promise<void> {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    // Check if we have capacity for more jobs
    while (this.activeJobs.size < this.config.maxConcurrency) {
      const job = await this.queue.dequeueNext();
      if (!job) {
        break; // No more jobs available
      }

      // Start executing the job (don't await - run concurrently)
      const jobPromise = this.executeJobWithRetry(job);
      this.jobPromises.set(job.id, jobPromise);

      // Handle job completion asynchronously
      jobPromise.finally(() => {
        this.jobPromises.delete(job.id);
        // Try to process more jobs when this one completes
        this.processAvailableJobs().catch(console.error);
      });
    }
  }

  private async executeJobWithRetry(job: Job): Promise<JobResult> {
    let lastResult: JobResult;

    do {
      lastResult = await this.executeJobInternal(job);

      if (lastResult.success) {
        return lastResult;
      }

      // Check if we should retry before incrementing
      if (!this.shouldRetryJob(job)) {
        return lastResult;
      }

      // Increment retry count after deciding to retry
      job.retryCount = (job.retryCount || 0) + 1;

      // Wait before retrying
      const delay = this.calculateRetryDelay(job.retryCount);
      await this.sleep(delay);
    } while (true); // We'll break out when shouldRetryJob returns false
  }

  private async executeJobInternal(job: Job): Promise<JobResult> {
    const startTime = Date.now();
    const abortController = new AbortController();

    try {
      // Track the job
      this.activeJobs.add(job.id);
      this.abortControllers.set(job.id, abortController);

      // Emit job started event
      const startedEvent: JobStartedEvent = {
        job,
        startedAt: new Date().toISOString(),
      };
      await this.eventBus.emit(JobExecutorEventTypes.JOB_STARTED, startedEvent);

      // Execute the job with timeout
      const result = await this.executeJobWithTimeout(
        job,
        abortController.signal,
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Update statistics
      this.totalJobsProcessed++;
      this.totalJobsSucceeded++;
      this.lastJobCompletedAt = new Date().toISOString();
      this.executionTimes.push(duration);

      // Keep only last 1000 execution times for average calculation
      if (this.executionTimes.length > 1000) {
        this.executionTimes = this.executionTimes.slice(-1000);
      }

      const jobResult: JobResult = {
        job,
        success: true,
        completedAt: this.lastJobCompletedAt,
        duration,
        metadata: result.metadata,
      };

      // Emit job completed event
      const completedEvent: JobCompletedEvent = {
        job,
        result: jobResult,
      };
      await this.eventBus.emit(
        JobExecutorEventTypes.JOB_COMPLETED,
        completedEvent,
      );

      return jobResult;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Update statistics
      this.totalJobsProcessed++;
      this.totalJobsFailed++;

      const jobResult: JobResult = {
        job,
        success: false,
        error: errorMessage,
        completedAt: new Date().toISOString(),
        duration,
      };

      // Emit job failed event
      const failedEvent: JobFailedEvent = {
        job,
        error: errorMessage,
        willRetry: this.shouldRetryJob(job),
        retryCount: job.retryCount || 0,
      };
      await this.eventBus.emit(JobExecutorEventTypes.JOB_FAILED, failedEvent);

      return jobResult;
    } finally {
      // Clean up
      this.activeJobs.delete(job.id);
      this.abortControllers.delete(job.id);
    }
  }

  private async executeJobWithTimeout(
    job: Job,
    signal: AbortSignal,
  ): Promise<{ metadata?: Record<string, any> }> {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Job ${job.id} timed out after ${this.config.jobTimeout}ms`,
          ),
        );
      }, this.config.jobTimeout);

      // Clear timeout if aborted
      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new Error(`Job ${job.id} was aborted`));
      });
    });

    // Create the actual job execution promise
    const jobPromise = this.performJobExecution(job, signal);

    // Race between job execution and timeout
    return Promise.race([jobPromise, timeoutPromise]);
  }

  private async performJobExecution(
    job: Job,
    signal: AbortSignal,
  ): Promise<{ metadata?: Record<string, any> }> {
    // This is where the actual job execution logic would go
    // For now, we'll simulate job execution

    // Check if aborted
    if (signal.aborted) {
      throw new Error("Job was aborted");
    }

    // Simulate some work
    await this.sleep(Math.random() * 100 + 50); // 50-150ms (reduced for faster tests)

    // Check if aborted again
    if (signal.aborted) {
      throw new Error("Job was aborted");
    }

    // Always succeed unless explicitly mocked in tests
    return {
      metadata: {
        operationType: job.operation.type,
        documentId: job.documentId,
        executedAt: new Date().toISOString(),
      },
    };
  }

  private shouldRetryJob(job: Job): boolean {
    const retryCount = job.retryCount || 0;
    const maxRetries = job.maxRetries || 3;
    return retryCount < maxRetries;
  }

  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff with jitter
    const exponentialDelay =
      this.config.retryBaseDelay * Math.pow(2, retryCount - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const delay = Math.min(
      exponentialDelay + jitter,
      this.config.retryMaxDelay,
    );
    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Re-export types and interfaces for backward compatibility
export type { IJobExecutor } from "./interfaces.js";
export { JobExecutorEventTypes } from "./types.js";
export type {
  ExecutorStartedEvent,
  ExecutorStoppedEvent,
  JobCompletedEvent,
  JobExecutorConfig,
  JobFailedEvent,
  JobResult,
  JobStartedEvent,
} from "./types.js";
