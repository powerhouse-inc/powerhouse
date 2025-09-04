import { type IJobExecutionHandle, type Job } from "./types.js";

/**
 * Interface for a job queue that manages write operations.
 * Internally organizes jobs by documentId, scope, and branch to ensure proper ordering.
 * Emits events to the event bus when new jobs are available for consumption.
 */
export interface IQueue {
  /**
   * Add a new job to the queue.
   * Jobs are automatically organized by documentId, scope, and branch internally.
   * Emits a 'jobAvailable' event to the event bus when the job is queued.
   * @param job - The job to add to the queue
   * @returns Promise that resolves when the job is queued
   */
  enqueue(job: Job): Promise<void>;

  /**
   * Get the next job to execute for a specific document/scope/branch combination.
   * @param documentId - The document ID to get jobs for
   * @param scope - The scope to get jobs for
   * @param branch - The branch to get jobs for
   * @param signal - Optional abort signal to cancel the request
   * @returns Promise that resolves to the next job execution handle or null if no jobs available
   */
  dequeue(
    documentId: string,
    scope: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<IJobExecutionHandle | null>;

  /**
   * Get the next available job from any queue.
   * @param signal - Optional abort signal to cancel the request
   * @returns Promise that resolves to the next job execution handle or null if no jobs available
   */
  dequeueNext(signal?: AbortSignal): Promise<IJobExecutionHandle | null>;

  /**
   * Get the current size of the queue for a specific document/scope/branch.
   * @param documentId - The document ID
   * @param scope - The scope
   * @param branch - The branch
   * @returns Promise that resolves to the number of jobs in the queue
   */
  size(documentId: string, scope: string, branch: string): Promise<number>;

  /**
   * Get the total size of all queues.
   * @returns Promise that resolves to the total number of jobs across all queues
   */
  totalSize(): Promise<number>;

  /**
   * Remove a specific job from the queue.
   * @param jobId - The ID of the job to remove
   * @returns Promise that resolves to true if job was removed, false if not found
   */
  remove(jobId: string): Promise<boolean>;

  /**
   * Clear all jobs for a specific document/scope/branch combination.
   * @param documentId - The document ID
   * @param scope - The scope
   * @param branch - The branch
   * @returns Promise that resolves when the queue is cleared
   */
  clear(documentId: string, scope: string, branch: string): Promise<void>;

  /**
   * Clear all jobs from all queues.
   * @returns Promise that resolves when all queues are cleared
   */
  clearAll(): Promise<void>;

  /**
   * Check if there are any jobs in the queue.
   * @returns Promise that resolves to true if there are jobs, false otherwise
   */
  hasJobs(): Promise<boolean>;

  /**
   * Mark a job as completed.
   * @param jobId - The ID of the job to mark as completed
   * @returns Promise that resolves when the job is marked as completed
   */
  completeJob(jobId: string): Promise<void>;

  /**
   * Mark a job as failed.
   * @param jobId - The ID of the job to mark as failed
   * @param error - Optional error message
   * @returns Promise that resolves when the job is marked as failed
   */
  failJob(jobId: string, error?: string): Promise<void>;

  /**
   * Retry a failed job.
   * @param jobId - The ID of the job to retry
   * @param error - Optional error message from the failure
   * @returns Promise that resolves when the job is requeued for retry
   */
  retryJob(jobId: string, error?: string): Promise<void>;

  /**
   * Returns true if and only if all jobs have been resolved.
   */
  get isDrained(): boolean;

  /**
   * Blocks the queue from accepting new jobs.
   * @param onDrained - Optional callback to call when the queue is drained
   */
  block(onDrained?: () => void): void;

  /**
   * Unblocks the queue from accepting new jobs.
   */
  unblock(): void;
}
