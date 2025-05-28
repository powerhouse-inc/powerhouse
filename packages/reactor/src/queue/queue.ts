import { Operation } from "#shared/types.js";
import { IEventBus } from "../events/event-bus.js";

/**
 * Represents a job to be executed by the job executor
 */
export type Job = {
  /** Unique identifier for the job */
  id: string;

  /** The document ID this job operates on */
  documentId: string;

  /** The scope of the operation */
  scope: string;

  /** The branch of the operation */
  branch: string;

  /** The operation to be executed */
  operation: Operation;

  /** Timestamp when the job was created */
  createdAt: string;

  /** Number of retry attempts */
  retryCount?: number;

  /** Maximum number of retries allowed */
  maxRetries?: number;
};

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

/**
 * Event types for the queue system
 */
export const QueueEventTypes = {
  JOB_AVAILABLE: 10000,
} as const;

/**
 * Event data for job available events
 */
export type JobAvailableEvent = {
  documentId: string;
  scope: string;
  branch: string;
  jobId: string;
};

/**
 * In-memory implementation of the IQueue interface.
 * Organizes jobs by documentId, scope, and branch to ensure proper ordering.
 */
export class InMemoryQueue implements IQueue {
  private queues = new Map<string, Job[]>();
  private jobIndex = new Map<string, string>(); // jobId -> queueKey mapping

  constructor(private eventBus: IEventBus) {}

  /**
   * Creates a unique key for a document/scope/branch combination
   */
  private createQueueKey(
    documentId: string,
    scope: string,
    branch: string,
  ): string {
    return `${documentId}:${scope}:${branch}`;
  }

  /**
   * Gets or creates a queue for the given key
   */
  private getQueue(queueKey: string): Job[] {
    let queue = this.queues.get(queueKey);
    if (!queue) {
      queue = [];
      this.queues.set(queueKey, queue);
    }
    return queue;
  }

  async enqueue(job: Job): Promise<void> {
    const queueKey = this.createQueueKey(job.documentId, job.scope, job.branch);
    const queue = this.getQueue(queueKey);

    // Add job to the end of the queue (FIFO)
    queue.push(job);

    // Track job location for removal
    this.jobIndex.set(job.id, queueKey);

    // Emit job available event
    const eventData: JobAvailableEvent = {
      documentId: job.documentId,
      scope: job.scope,
      branch: job.branch,
      jobId: job.id,
    };

    await this.eventBus.emit(QueueEventTypes.JOB_AVAILABLE, eventData);
  }

  async dequeue(
    documentId: string,
    scope: string,
    branch: string,
  ): Promise<Job | null> {
    const queueKey = this.createQueueKey(documentId, scope, branch);
    const queue = this.queues.get(queueKey);

    if (!queue || queue.length === 0) {
      return null;
    }

    // Remove job from the front of the queue (FIFO)
    const job = queue.shift()!;

    // Remove from job index
    this.jobIndex.delete(job.id);

    // Clean up empty queue
    if (queue.length === 0) {
      this.queues.delete(queueKey);
    }

    return job;
  }

  async dequeueNext(): Promise<Job | null> {
    // Find the first non-empty queue and dequeue from it
    for (const [queueKey, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        const job = queue.shift()!;

        // Remove from job index
        this.jobIndex.delete(job.id);

        // Clean up empty queue
        if (queue.length === 0) {
          this.queues.delete(queueKey);
        }

        return job;
      }
    }

    return null;
  }

  async size(
    documentId: string,
    scope: string,
    branch: string,
  ): Promise<number> {
    const queueKey = this.createQueueKey(documentId, scope, branch);
    const queue = this.queues.get(queueKey);
    return queue ? queue.length : 0;
  }

  async totalSize(): Promise<number> {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  async remove(jobId: string): Promise<boolean> {
    const queueKey = this.jobIndex.get(jobId);
    if (!queueKey) {
      return false;
    }

    const queue = this.queues.get(queueKey);
    if (!queue) {
      // Clean up orphaned index entry
      this.jobIndex.delete(jobId);
      return false;
    }

    const jobIndex = queue.findIndex((job) => job.id === jobId);
    if (jobIndex === -1) {
      // Clean up orphaned index entry
      this.jobIndex.delete(jobId);
      return false;
    }

    // Remove job from queue
    queue.splice(jobIndex, 1);

    // Remove from job index
    this.jobIndex.delete(jobId);

    // Clean up empty queue
    if (queue.length === 0) {
      this.queues.delete(queueKey);
    }

    return true;
  }

  async clear(
    documentId: string,
    scope: string,
    branch: string,
  ): Promise<void> {
    const queueKey = this.createQueueKey(documentId, scope, branch);
    const queue = this.queues.get(queueKey);

    if (queue) {
      // Remove all jobs from the job index
      for (const job of queue) {
        this.jobIndex.delete(job.id);
      }

      // Remove the queue
      this.queues.delete(queueKey);
    }
  }

  async clearAll(): Promise<void> {
    // Clear all job indices
    this.jobIndex.clear();

    // Clear all queues
    this.queues.clear();
  }
}
