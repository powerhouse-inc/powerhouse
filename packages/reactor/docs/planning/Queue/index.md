# IQueue

### Summary

The `IQueue` provides a simple API to queue new write jobs. Internally, it creates separate queues keyed by documentId, scope, and branch to ensure proper ordering of operations within each document context. Jobs are processed in FIFO order within each queue to maintain consistency. When jobs are enqueued, the queue emits 'jobAvailable' events to the event bus to notify job executors.

### Dependencies

- [IEventBus](../Events/index.md)

### Interface

```tsx
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
  dequeue(documentId: string, scope: string, branch: string): Promise<Job | null>;
  
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
```

### Usage

```tsx
// Create a new job for a document operation
const job: Job = {
  id: crypto.randomUUID(),
  documentId: 'doc-123',
  scope: 'global',
  branch: 'main',
  operation: {
    type: 'UPDATE_TITLE',
    input: { title: 'New Title' },
    scope: 'global',
    index: 42,
    timestamp: new Date().toISOString(),
    hash: 'abc123',
    skip: 0
  },
  createdAt: new Date().toISOString(),
  maxRetries: 3
};

// Enqueue the job (this will emit a 'jobAvailable' event to the event bus)
await queue.enqueue(job);

// Check queue size for a specific document/scope/branch
const queueSize = await queue.size('doc-123', 'global', 'main');
console.log(`Queue size: ${queueSize}`);

// Get the next job for processing (used by job executor)
const nextJob = await queue.dequeueNext();
if (nextJob) {
  console.log(`Processing job: ${nextJob.id}`);
}

// Remove a specific job if needed
const removed = await queue.remove('job-id-456');
if (removed) {
  console.log('Job removed successfully');
}

// Clear all jobs for a specific document context
await queue.clear('doc-123', 'global', 'main');

// Get total queue size across all documents
const totalSize = await queue.totalSize();
console.log(`Total jobs in queue: ${totalSize}`);
```

### Implementation Notes

- The queue internally maintains separate queues keyed by `(documentId, scope, branch)` to ensure proper ordering of operations within each document context.
- Jobs within the same document/scope/branch combination are processed in FIFO order to maintain consistency.
- When a job is enqueued, the queue emits a 'jobAvailable' event to the event bus to notify job executors.
- Retry logic should be handled by the job executor, with exponential backoff recommended.
