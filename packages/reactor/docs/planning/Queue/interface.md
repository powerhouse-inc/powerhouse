### Interface

See the [Jobs](../Jobs/index.md) doc for a detailed specification on `Job`s.

```tsx

class QueueCycleError extends Error {
  constructor() {
    super("Cycle detected in job dependencies");
  }
}

class QueueBlockedError extends Error {
  constructor() {
    super("Queue is blocked");
  }
}

enum JobQueueState {
  UNKNOWN = -1,
  PREPROCESSING,
  PENDING,
  READY,
  RUNNING,
  RESOLVED,
}

type QueueParameters = {
  /** The document id that the job is operating on */
  documentId: string;

  /** The scopes affected by the actions */
  scopes: string[];

  /** The branch that the job is operating on */
  branch: string;

  /** The list of actions to apply */
  actions: Action[];

  /** The optional expected hash of the resulting state */
  resultingHash?: string;

  /** The list of job ids that this job depends on */
  dependsOn?: string[]
}

interface IJobExecutionHandle {
  get job(): Job;

  start(): void;
  complete(): void;
  fail(reason: string): void;
}

export interface IQueue {
  /**
   * Returns true if and only if all jobs have been resolved.
   */
  get isDrained(): boolean;

  /**
   * Blocks the queue from accepting new jobs.
   * 
   * @param onDrained - Optional callback to call when the queue is drained
   */
  block(onDrained?: () => void): void;

  /**
   * Unblocks the queue from accepting new jobs.
   */
  unblock(): void;
  
  /**
   * Adds a new set of actions to the queue, and returns a job id.
   * 
   * @param params - The parameters for the job to add to the queue
   * @param dependsOn - The list of job ids that this job depends on
   * 
   * @returns The job id
   */
  enqueue(params: QueueParameters): string;
  
  /**
   * Get the next available job from any queue.
   * 
   * Note that if the execution handle is not marked as started, `getNext` will continue to return the same handle until it is started.
   * 
   * @param signal - Optional abort signal to cancel the request
   * 
   * @returns Promise that resolves to the next job execution handle or null if no jobs available
   */
  getNext(signal?: AbortSignal): IJobExecutionHandle | null;
}
```
