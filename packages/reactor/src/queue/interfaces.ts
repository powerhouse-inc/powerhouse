import type { Job } from "./types.js";

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
   * @returns Promise that resolves to the next job or null if no jobs available
   */
  dequeue(
    documentId: string,
    scope: string,
    branch: string,
  ): Promise<Job | null>;

  /**
   * Get the next available job from any queue.
   * @returns Promise that resolves to the next job or null if no jobs available
   */
  dequeueNext(): Promise<Job | null>;

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
}
