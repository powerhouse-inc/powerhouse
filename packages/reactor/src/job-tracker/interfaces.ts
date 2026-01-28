import type { Job } from "../queue/types.js";
import type { ErrorInfo, JobInfo } from "../shared/types.js";

/**
 * Interface for tracking job lifecycle status.
 * Maintains job state throughout execution: PENDING → RUNNING → COMPLETED/FAILED.
 */
export interface IJobTracker {
  /**
   * Register a new job with PENDING status.
   *
   * @param jobInfo - The job information to register
   */
  registerJob(jobInfo: JobInfo): void;

  /**
   * Update a job's status to RUNNING.
   *
   * @param jobId - The job ID to mark as running
   */
  markRunning(jobId: string): void;

  /**
   * Mark a job as failed.
   *
   * @param jobId - The job ID to mark as failed
   * @param error - Error information including message and stack trace
   * @param job - Optional full job object for debugging purposes
   */
  markFailed(jobId: string, error: ErrorInfo, job?: Job): void;

  /**
   * Retrieve the current status of a job.
   *
   * @param jobId - The job ID to query
   * @returns The job information, or null if the job is not found
   */
  getJobStatus(jobId: string): JobInfo | null;

  /**
   * Shutdown the job tracker and clean up resources.
   * Unsubscribes from all event bus subscriptions.
   */
  shutdown(): void;
}
