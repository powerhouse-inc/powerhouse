import type { Job } from "../queue/types.js";
import type { JobExecutorConfig, JobResult } from "./types.js";

/**
 * Simple interface for executing a job.
 * A JobExecutor simply takes a job and executes it - nothing more.
 */
export interface IJobExecutor {
  /**
   * Execute a single job.
   * @param job - The job to execute
   * @returns Promise that resolves to the job result
   */
  executeJob(job: Job): Promise<JobResult>;
}

/**
 * Interface for managing multiple job executors.
 * Listens for 'jobAvailable' events from the event bus, pulls jobs from the queue,
 * and coordinates the distribution of jobs across multiple executor instances.
 */
export interface IJobExecutorManager {
  /**
   * Start the executor manager.
   * Begins listening for 'jobAvailable' events and dispatching to executors.
   *
   * @param numExecutors - Number of executor instances to create
   * @returns Promise that resolves when the manager is started
   */
  start(numExecutors: number): Promise<void>;

  /**
   * Stop the executor manager.
   *
   * @param graceful - Whether to wait for current jobs to complete
   * @returns Promise that resolves when the manager is stopped
   */
  stop(graceful?: boolean): Promise<void>;

  /**
   * Get all managed executor instances.
   *
   * @returns Array of executor instances
   */
  getExecutors(): IJobExecutor[];

  /**
   * Get the current status of the manager.
   *
   * @returns The current manager status
   */
  getStatus(): ExecutorManagerStatus;
}
