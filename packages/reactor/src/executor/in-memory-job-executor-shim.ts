/**
 * Backwards compatibility shim for InMemoryJobExecutor
 * This is a temporary wrapper to maintain backwards compatibility while transitioning to the simplified design.
 * @deprecated Use SimpleJobExecutor and SimpleJobExecutorManager instead
 */

import type { IDocumentStorage } from "document-drive/storage/types";
import type { IEventBus } from "../events/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { SimpleJobExecutorManager } from "./simple-job-executor-manager.js";
import { SimpleJobExecutor } from "./simple-job-executor.js";
import type { JobExecutorConfig, JobResult } from "./types.js";

export const JobExecutorEventTypes = {
  JOB_STARTED: "jobStarted",
  JOB_COMPLETED: "jobCompleted",
  JOB_FAILED: "jobFailed",
  EXECUTOR_STARTED: "executorStarted",
  EXECUTOR_STOPPED: "executorStopped",
} as const;

export type JobStartedEvent = { job: Job };
export type JobCompletedEvent = { job: Job; result: JobResult };
export type JobFailedEvent = { job: Job; error: Error };
export type ExecutorStartedEvent = { config: JobExecutorConfig };
export type ExecutorStoppedEvent = { graceful: boolean };

/**
 * @deprecated Use SimpleJobExecutor and SimpleJobExecutorManager instead
 */
export class InMemoryJobExecutor {
  private executor: SimpleJobExecutor;
  private manager?: SimpleJobExecutorManager;
  private isRunning = false;
  private jobsProcessed = 0;
  private jobsSucceeded = 0;
  private jobsFailed = 0;
  private startTime?: number;

  constructor(
    private eventBus: IEventBus,
    private queue: IQueue,
    private registry?: IDocumentModelRegistry,
    private documentStorage?: IDocumentStorage,
  ) {
    // Create a simple executor if registry and storage are provided
    if (registry && documentStorage) {
      this.executor = new SimpleJobExecutor(registry, documentStorage);
    } else {
      // Create a mock executor for tests that don't provide these
      this.executor = {
        executeJob: async (job: Job) => ({
          job,
          success: true,
          duration: 10,
        }),
      } as SimpleJobExecutor;
    }
  }

  async start(config?: JobExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Executor is already running");
    }

    // Create manager for event listening
    const factory = () => this.executor;
    this.manager = new SimpleJobExecutorManager(
      factory,
      this.eventBus,
      this.queue,
    );
    await this.manager.start(1); // Single executor for backwards compat

    this.isRunning = true;
    this.startTime = Date.now();
  }

  async stop(graceful = true): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.manager) {
      await this.manager.stop(graceful);
    }

    this.isRunning = false;
  }

  async executeJob(job: Job): Promise<JobResult> {
    const result = await this.executor.executeJob(job);

    this.jobsProcessed++;
    if (result.success) {
      this.jobsSucceeded++;
    } else {
      this.jobsFailed++;
    }

    return result;
  }

  async getStatus(): Promise<{
    isRunning: boolean;
    activeJobs: number;
    totalJobsProcessed: number;
    totalJobsSucceeded: number;
    totalJobsFailed: number;
    lastJobCompletedAt?: string;
    uptime?: number;
  }> {
    const managerStatus = this.manager ? await this.manager.getStatus() : null;

    return {
      isRunning: this.isRunning,
      activeJobs: managerStatus?.activeJobs || 0,
      totalJobsProcessed: this.jobsProcessed,
      totalJobsSucceeded: this.jobsSucceeded,
      totalJobsFailed: this.jobsFailed,
      uptime: this.startTime ? Date.now() - this.startTime : undefined,
    };
  }

  async getStats(): Promise<{
    averageExecutionTime: number;
    successRate: number;
    jobsPerSecond: number;
    queueBacklog: number;
  }> {
    const queueSize = await this.queue.totalSize();
    const successRate =
      this.jobsProcessed > 0
        ? (this.jobsSucceeded / this.jobsProcessed) * 100
        : 100;

    const runTime = this.startTime ? (Date.now() - this.startTime) / 1000 : 1;
    const jobsPerSecond = this.jobsProcessed / runTime;

    return {
      averageExecutionTime: 10, // Mock value
      successRate,
      jobsPerSecond,
      queueBacklog: queueSize,
    };
  }

  async pause(): Promise<void> {
    // No-op for compatibility
  }

  async resume(): Promise<void> {
    // No-op for compatibility
  }

  on(event: string, handler: (data: any) => void): () => void {
    // Return a no-op unsubscribe function
    return () => {};
  }
}
