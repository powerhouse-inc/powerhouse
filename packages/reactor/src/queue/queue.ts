import { type IEventBus } from "../events/interfaces.js";
import { type IQueue } from "./interfaces.js";
import { JobExecutionHandle } from "./job-execution-handle.js";
import {
  QueueEventTypes,
  JobQueueState,
  type Job,
  type JobAvailableEvent,
  type IJobExecutionHandle,
} from "./types.js";

/**
 * In-memory implementation of the IQueue interface.
 * Organizes jobs by documentId, scope, and branch to ensure proper ordering.
 * Ensures serial execution per document by tracking executing jobs.
 * Implements dependency management through queue hints.
 */
export class InMemoryQueue implements IQueue {
  private queues = new Map<string, Job[]>();
  private jobIdToQueueKey = new Map<string, string>();
  private docIdToJobId = new Map<string, Set<string>>();
  private jobIdToDocId = new Map<string, string>();
  private completedJobs = new Set<string>();
  private jobIndex = new Map<string, Job>();
  private isBlocked = false;
  private onDrainedCallback?: () => void;

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

  /**
   * Check if a document has any jobs currently executing
   */
  private isDocumentExecuting(documentId: string): boolean {
    const executingSet = this.docIdToJobId.get(documentId);
    return executingSet ? executingSet.size > 0 : false;
  }

  /**
   * Mark a job as executing for its document
   */
  private markJobExecuting(job: Job): void {
    let executingSet = this.docIdToJobId.get(job.documentId);
    if (!executingSet) {
      executingSet = new Set();
      this.docIdToJobId.set(job.documentId, executingSet);
    }
    executingSet.add(job.id);
    this.jobIdToDocId.set(job.id, job.documentId);
  }

  /**
   * Mark a job as no longer executing for its document
   */
  private markJobComplete(jobId: string, documentId: string): void {
    const executingSet = this.docIdToJobId.get(documentId);
    if (executingSet) {
      executingSet.delete(jobId);
      if (executingSet.size === 0) {
        this.docIdToJobId.delete(documentId);
      }
    }
    this.jobIdToDocId.delete(jobId);
  }

  /**
   * Check if all dependencies for a job have been completed
   */
  private areDependenciesMet(job: Job): boolean {
    if (!job.queueHint || job.queueHint.length === 0) {
      return true;
    }
    return job.queueHint.every((depId) => this.completedJobs.has(depId));
  }

  /**
   * Get the next job that has all its dependencies met
   */
  private getNextJobWithMetDependencies(queue: Job[]): Job | null {
    for (const job of queue) {
      if (this.areDependenciesMet(job)) {
        return job;
      }
    }
    return null;
  }

  async enqueue(job: Job): Promise<void> {
    // Throw error if queue is blocked
    if (this.isBlocked) {
      throw new Error("Queue is blocked");
    }

    const queueKey = this.createQueueKey(job.documentId, job.scope, job.branch);
    const queue = this.getQueue(queueKey);

    // Add job to the end of the queue (FIFO)
    queue.push(job);

    // Track job location for removal and dependency resolution
    this.jobIdToQueueKey.set(job.id, queueKey);
    this.jobIndex.set(job.id, job);

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
    signal?: AbortSignal,
  ): Promise<IJobExecutionHandle | null> {
    const queueKey = this.createQueueKey(documentId, scope, branch);
    const queue = this.queues.get(queueKey);

    if (!queue || queue.length === 0) {
      return null;
    }

    // Find the first job with met dependencies
    const job = this.getNextJobWithMetDependencies(queue);
    if (!job) {
      return null; // No job with met dependencies
    }

    // Remove job from queue
    const jobIndex = queue.indexOf(job);
    queue.splice(jobIndex, 1);

    // Remove from queue tracking but keep in job index for retry
    this.jobIdToQueueKey.delete(job.id);

    // Mark this job as executing for its document
    this.markJobExecuting(job);

    // Clean up empty queue
    if (queue.length === 0) {
      this.queues.delete(queueKey);
    }

    // Create and return the execution handle
    const handle = new JobExecutionHandle(job, JobQueueState.READY, {
      onStart: () => {
        // Job is now running
      },
      onComplete: () => {
        this.completeJob(job.id);
      },
      onFail: (reason: string) => {
        this.failJob(job.id, reason);
      },
    });

    return handle;
  }

  async dequeueNext(signal?: AbortSignal): Promise<IJobExecutionHandle | null> {
    // Find the first non-empty queue for a document that's not currently executing
    for (const [queueKey, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        // Find the first job with met dependencies
        const job = this.getNextJobWithMetDependencies(queue);
        if (!job) {
          continue; // No job with met dependencies in this queue
        }

        // Only dequeue if the document is not currently executing jobs
        if (!this.isDocumentExecuting(job.documentId)) {
          // Remove job from queue
          const jobIdx = queue.indexOf(job);
          queue.splice(jobIdx, 1);

          // Remove from queue tracking but keep in job index for retry
          this.jobIdToQueueKey.delete(job.id);
          // Keep job in jobIndex so we can retry it if needed

          // Mark this job as executing for its document
          this.markJobExecuting(job);

          // Clean up empty queue
          if (queue.length === 0) {
            this.queues.delete(queueKey);
          }

          // Create and return the execution handle
          const handle = new JobExecutionHandle(job, JobQueueState.READY, {
            onStart: () => {
              // Job is now running
            },
            onComplete: () => {
              this.completeJob(job.id);
            },
            onFail: (reason: string) => {
              this.failJob(job.id, reason);
            },
          });

          return handle;
        }
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
    const queueKey = this.jobIdToQueueKey.get(jobId);
    if (!queueKey) {
      return false;
    }

    const queue = this.queues.get(queueKey);
    if (!queue) {
      // Clean up orphaned index entry
      this.jobIdToQueueKey.delete(jobId);
      this.jobIndex.delete(jobId);
      return false;
    }

    const jobIdx = queue.findIndex((job) => job.id === jobId);
    if (jobIdx === -1) {
      // Clean up orphaned index entry
      this.jobIdToQueueKey.delete(jobId);
      this.jobIndex.delete(jobId);
      return false;
    }

    // Remove job from queue
    queue.splice(jobIdx, 1);

    // Remove from job index
    this.jobIdToQueueKey.delete(jobId);
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
        this.jobIdToQueueKey.delete(job.id);
        this.jobIndex.delete(job.id);
      }

      // Remove the queue
      this.queues.delete(queueKey);
    }
  }

  async clearAll(): Promise<void> {
    // Clear all job indices
    this.jobIdToQueueKey.clear();
    this.jobIndex.clear();
    this.completedJobs.clear();

    // Clear all queues
    this.queues.clear();
  }

  async hasJobs(): Promise<boolean> {
    return (
      this.queues.size > 0 &&
      Array.from(this.queues.values()).some((q) => q.length > 0)
    );
  }

  async completeJob(jobId: string): Promise<void> {
    // Get the documentId for the executing job
    const documentId = this.jobIdToDocId.get(jobId);
    if (documentId) {
      // Mark the job as no longer executing
      this.markJobComplete(jobId, documentId);
    }

    // Track the job as completed for dependency resolution
    this.completedJobs.add(jobId);

    // Remove from job index
    this.jobIndex.delete(jobId);

    // For in-memory queue, completing just removes the job
    // In a persistent queue, this would update the job status
    await this.remove(jobId);

    // Check if queue is now drained
    this.checkDrained();
  }

  async failJob(jobId: string, error?: string): Promise<void> {
    // Get the documentId for the executing job
    const documentId = this.jobIdToDocId.get(jobId);
    if (documentId) {
      // Mark the job as no longer executing
      this.markJobComplete(jobId, documentId);
    }

    // Remove from job index
    this.jobIndex.delete(jobId);

    // For in-memory queue, failing just removes the job
    // In a persistent queue, this would update the job status and store the error
    await this.remove(jobId);

    // Check if queue is now drained
    this.checkDrained();
  }

  async retryJob(jobId: string, error?: string): Promise<void> {
    // Get the job from the index (it might be executing, not in queue)
    const job = this.jobIndex.get(jobId);
    if (!job) {
      return;
    }

    // Mark it as no longer executing if it was
    const documentId = this.jobIdToDocId.get(jobId);
    if (documentId) {
      this.markJobComplete(jobId, documentId);
    }

    // Remove from indices
    this.jobIndex.delete(jobId);
    this.jobIdToQueueKey.delete(jobId);

    // Update retry count
    const updatedJob: Job = {
      ...job,
      retryCount: (job.retryCount || 0) + 1,
      lastError: error,
    };

    // Re-enqueue with updated retry count
    await this.enqueue(updatedJob);
  }

  /**
   * Check if the queue is drained and call the callback if it is
   */
  private checkDrained(): void {
    if (this.isDrained && this.onDrainedCallback) {
      const callback = this.onDrainedCallback;
      this.onDrainedCallback = undefined;
      callback();
    }
  }

  /**
   * Returns true if and only if all jobs have been resolved.
   */
  get isDrained(): boolean {
    // Queue is drained if there are no pending jobs and no executing jobs
    const hasPendingJobs =
      this.queues.size > 0 &&
      Array.from(this.queues.values()).some((q) => q.length > 0);
    const hasExecutingJobs =
      this.docIdToJobId.size > 0 &&
      Array.from(this.docIdToJobId.values()).some((set) => set.size > 0);

    return !hasPendingJobs && !hasExecutingJobs;
  }

  /**
   * Blocks the queue from accepting new jobs.
   * @param onDrained - Optional callback to call when the queue is drained
   */
  block(onDrained?: () => void): void {
    this.isBlocked = true;
    this.onDrainedCallback = onDrained;

    // Check if already drained
    this.checkDrained();
  }

  /**
   * Unblocks the queue from accepting new jobs.
   */
  unblock(): void {
    this.isBlocked = false;
    this.onDrainedCallback = undefined;
  }
}
