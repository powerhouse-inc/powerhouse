import { type IEventBus } from "../events/interfaces.js";
import { type IQueue } from "./interfaces.js";
import { type Job, type JobAvailableEvent, QueueEventTypes } from "./types.js";

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
