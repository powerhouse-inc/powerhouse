import type { Job } from "../queue/types.js";
import type { JobExecutorConfig, JobResult } from "./types.js";

/**
 * Interface for executing jobs from the queue.
 * Listens for 'jobAvailable' events from the event bus and pulls jobs from IQueue when capacity allows.
 */
export interface IJobExecutor {
  /**
   * Start the job executor.
   * Begins listening for 'jobAvailable' events from the event bus and executing jobs when capacity allows.
   *
   * @param config - Configuration options for the executor
   * @returns Promise that resolves when the executor is started
   */
  start(config?: JobExecutorConfig): Promise<void>;

  /**
   * Stop the job executor.
   * Gracefully stops listening for events and waits for current jobs to complete.
   * @param graceful - Whether to wait for current jobs to complete
   * @returns Promise that resolves when the executor is stopped
   */
  stop(graceful?: boolean): Promise<void>;

  /**
   * Execute a single job immediately.
   * @param job - The job to execute
   * @returns Promise that resolves to the job result
   */
  executeJob(job: Job): Promise<JobResult>;

  /**
   * Get the current status of the job executor.
   * @returns Promise that resolves to the executor status
   */
  getStatus(): Promise<{
    isRunning: boolean;
    activeJobs: number;
    totalJobsProcessed: number;
    totalJobsSucceeded: number;
    totalJobsFailed: number;
    lastJobCompletedAt?: string;
    uptime?: number;
  }>;

  /**
   * Get statistics about job execution performance.
   * @returns Promise that resolves to execution statistics
   */
  getStats(): Promise<{
    averageExecutionTime: number;
    successRate: number;
    jobsPerSecond: number;
    queueBacklog: number;
  }>;

  /**
   * Pause job execution.
   * Stops processing new jobs but keeps the executor running.
   * @returns Promise that resolves when execution is paused
   */
  pause(): Promise<void>;

  /**
   * Resume job execution.
   * Resumes processing jobs from the queue.
   * @returns Promise that resolves when execution is resumed
   */
  resume(): Promise<void>;

  /**
   * Subscribe to job execution events.
   * @param event - The event type to subscribe to
   * @param handler - The event handler function
   * @returns Function to unsubscribe from the event
   */
  on(
    event:
      | "jobStarted"
      | "jobCompleted"
      | "jobFailed"
      | "executorStarted"
      | "executorStopped",
    handler: (data: any) => void,
  ): () => void;
}
