import type { CreateDocumentActionInput } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes } from "../events/types.js";
import type { IDocumentModelResolver } from "../registry/document-model-resolver.js";
import type { ErrorInfo } from "../shared/types.js";
import type { IQueue } from "./interfaces.js";
import { JobExecutionHandle } from "./job-execution-handle.js";
import type { IJobExecutionHandle, Job, JobAvailableEvent } from "./types.js";
import { JobQueueState, QueueEventTypes } from "./types.js";

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
  private isPausedFlag = false;

  constructor(
    private eventBus: IEventBus,
    private resolver: IDocumentModelResolver,
  ) {}

  private toErrorInfo(error: Error | string): ErrorInfo {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack || new Error().stack || "",
      };
    }
    return {
      message: error,
      stack: new Error().stack || "",
    };
  }

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
    if (job.queueHint.length === 0) {
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

  private getCreateDocumentType(job: Job): string | undefined {
    for (const action of job.actions) {
      if (action.type === "CREATE_DOCUMENT") {
        return (action.input as CreateDocumentActionInput).model;
      }
    }
    for (const operation of job.operations) {
      if (operation.action.type === "CREATE_DOCUMENT") {
        return (operation.action.input as CreateDocumentActionInput).model;
      }
    }
    return undefined;
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

    // Gate CREATE_DOCUMENT jobs on model availability
    const documentType = this.getCreateDocumentType(job);
    if (documentType) {
      try {
        await this.resolver.ensureModelLoaded(documentType);
      } catch {
        await this.failJob(job.id, {
          message: `Failed to load document model for type: ${documentType}`,
          stack: new Error().stack || "",
        });
        return;
      }
    }

    // Emit job available event
    const eventData: JobAvailableEvent = {
      documentId: job.documentId,
      scope: job.scope,
      branch: job.branch,
      jobId: job.id,
    };

    await this.eventBus.emit(QueueEventTypes.JOB_AVAILABLE, eventData);
  }

  dequeue(
    documentId: string,
    scope: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<IJobExecutionHandle | null> {
    const queueKey = this.createQueueKey(documentId, scope, branch);
    const queue = this.queues.get(queueKey);

    if (signal?.aborted) {
      return Promise.reject(new Error("Operation aborted"));
    }

    if (!queue || queue.length === 0) {
      return Promise.resolve(null);
    }

    // Find the first job with met dependencies
    const job = this.getNextJobWithMetDependencies(queue);
    if (!job) {
      return Promise.resolve(null);
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
        void this.completeJob(job.id);
      },
      onFail: (error: ErrorInfo) => {
        void this.failJob(job.id, error);
      },
    });

    return Promise.resolve(handle);
  }

  dequeueNext(signal?: AbortSignal): Promise<IJobExecutionHandle | null> {
    if (signal?.aborted) {
      return Promise.reject(new Error("Operation aborted"));
    }

    if (this.isPausedFlag) {
      return Promise.resolve(null);
    }

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
              void this.completeJob(job.id);
            },
            onFail: (error: ErrorInfo) => {
              void this.failJob(job.id, error);
            },
          });

          return Promise.resolve(handle);
        }
      }
    }

    return Promise.resolve(null);
  }

  size(documentId: string, scope: string, branch: string): Promise<number> {
    const queueKey = this.createQueueKey(documentId, scope, branch);
    const queue = this.queues.get(queueKey);
    return Promise.resolve(queue ? queue.length : 0);
  }

  totalSize(): Promise<number> {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return Promise.resolve(total);
  }

  remove(jobId: string): Promise<boolean> {
    const queueKey = this.jobIdToQueueKey.get(jobId);
    if (!queueKey) {
      return Promise.resolve(false);
    }

    const queue = this.queues.get(queueKey);
    if (!queue) {
      // Clean up orphaned index entry
      this.jobIdToQueueKey.delete(jobId);
      this.jobIndex.delete(jobId);
      return Promise.resolve(false);
    }

    const jobIdx = queue.findIndex((job) => job.id === jobId);
    if (jobIdx === -1) {
      // Clean up orphaned index entry
      this.jobIdToQueueKey.delete(jobId);
      this.jobIndex.delete(jobId);
      return Promise.resolve(false);
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

    return Promise.resolve(true);
  }

  clear(documentId: string, scope: string, branch: string): Promise<void> {
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

    return Promise.resolve();
  }

  clearAll(): Promise<void> {
    // Clear all job indices
    this.jobIdToQueueKey.clear();
    this.jobIndex.clear();
    this.completedJobs.clear();

    // Clear all queues
    this.queues.clear();

    return Promise.resolve();
  }

  hasJobs(): Promise<boolean> {
    return Promise.resolve(
      this.queues.size > 0 &&
        Array.from(this.queues.values()).some((q) => q.length > 0),
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

  async failJob(jobId: string, error?: ErrorInfo): Promise<void> {
    // Get the documentId for the executing job
    const documentId = this.jobIdToDocId.get(jobId);
    if (documentId) {
      // Mark the job as no longer executing
      this.markJobComplete(jobId, documentId);
    }

    // update the job lastError and errorHistory
    const job = this.jobIndex.get(jobId);
    if (job) {
      job.lastError = error;
      if (error) {
        job.errorHistory.push(error);
      }
    }

    // Remove from job index
    this.jobIndex.delete(jobId);

    // Track as completed so dependent jobs are unblocked
    this.completedJobs.add(jobId);

    // For in-memory queue, failing just removes the job
    // In a persistent queue, this would update the job status and store the error
    await this.remove(jobId);

    // Emit JOB_FAILED so subscribers (sync manager, job tracker, etc.) can react
    this.eventBus
      .emit(ReactorEventTypes.JOB_FAILED, {
        jobId,
        error: new Error(error?.message ?? "Job failed"),
        job,
      })
      .catch(() => {});

    // Check if queue is now drained
    this.checkDrained();
  }

  async retryJob(jobId: string, error?: ErrorInfo): Promise<void> {
    // Get the job from the index (it might be executing, not in queue)
    const job = this.jobIndex.get(jobId);
    if (!job) {
      return;
    }

    // update the job lastError
    job.lastError = error;

    // Mark it as no longer executing if it was
    const documentId = this.jobIdToDocId.get(jobId);
    if (documentId) {
      this.markJobComplete(jobId, documentId);
    }

    // Remove from indices
    this.jobIndex.delete(jobId);
    this.jobIdToQueueKey.delete(jobId);

    // Add error to history
    if (error) {
      job.errorHistory.push(error);
    }

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

  /**
   * Pauses job dequeuing. Jobs can still be enqueued but dequeueNext() will return null.
   */
  pause(): void {
    this.isPausedFlag = true;
  }

  /**
   * Resumes job dequeuing and emits JOB_AVAILABLE events for pending jobs to wake up executors.
   */
  async resume(): Promise<void> {
    this.isPausedFlag = false;
    // Emit JOB_AVAILABLE for each queue with pending jobs to wake up the executor manager
    for (const [, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        const job = queue[0];
        await this.eventBus.emit(QueueEventTypes.JOB_AVAILABLE, {
          documentId: job.documentId,
          scope: job.scope,
          branch: job.branch,
          jobId: job.id,
        });
      }
    }
  }

  /**
   * Returns whether job dequeuing is paused.
   */
  get paused(): boolean {
    return this.isPausedFlag;
  }

  /**
   * Returns all pending jobs across all queues.
   */
  getPendingJobs(): Job[] {
    const jobs: Job[] = [];
    for (const queue of this.queues.values()) {
      jobs.push(...queue);
    }
    return jobs;
  }

  /**
   * Returns a map of document IDs to sets of executing job IDs.
   */
  getExecutingJobIds(): Map<string, Set<string>> {
    return new Map(
      Array.from(this.docIdToJobId.entries()).map(([k, v]) => [k, new Set(v)]),
    );
  }

  /**
   * Returns a job by ID from the job index.
   */
  getJob(jobId: string): Job | undefined {
    return this.jobIndex.get(jobId);
  }
}
