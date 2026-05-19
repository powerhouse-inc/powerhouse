import type { Job } from "../queue/types.js";
import type { ExecutorManagerStatus, JobResult } from "./types.js";

/**
 * Snapshot of the single in-flight slot maintained by an {@link IExecutorWorker}.
 */
export type WorkerInFlightSnapshot = {
  correlationId: string;
  jobId: string;
};

/**
 * Parent-side handle for a single executor worker.
 *
 * Implementations wrap an IPC transport (worker_threads, child_process, or a
 * test fake) and expose a transport-agnostic surface that the worker-pool
 * manager uses to dispatch jobs. The handle owns one worker's lifecycle
 * (`start` -> `execute`* -> `shutdown`) and bounds its in-flight map to a
 * single entry; `SimpleJobExecutor` is single-threaded inside the worker, so
 * concurrent dispatches would race its caches.
 */
export interface IExecutorWorker {
  /** Stable identifier of the worker (mirrors `InitMessage.workerId`). */
  readonly workerId: string;

  /** Zero-based index within the pool, used for sticky routing. */
  readonly index: number;

  /**
   * Spawn the worker (if not already started), send the `init` payload and
   * resolve when the worker replies with `ready`.
   */
  start(): Promise<void>;

  /**
   * Dispatch a job to the worker and resolve with its `result` payload.
   * Rejects with a transport-level error if the worker exits, aborts, or
   * times out before producing a result.
   */
  execute(job: Job, signal?: AbortSignal): Promise<JobResult>;

  /**
   * Request cancellation of the in-flight job (if any). The handle posts an
   * `abort` message; if the worker fails to reply within its grace window it
   * is force-terminated.
   */
  abort(correlationId: string, reason?: string): void;

  /**
   * Stop the worker. When `graceful` is true the handle waits for the
   * in-flight job to settle (up to `graceMs`) before terminating; otherwise
   * the worker is terminated immediately.
   */
  shutdown(graceful: boolean, graceMs?: number): Promise<void>;

  /** True when no job is currently in flight. */
  isIdle(): boolean;

  /** Snapshot of the in-flight slot, or null when idle. */
  getInFlight(): WorkerInFlightSnapshot | null;
}

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
  executeJob(job: Job, signal?: AbortSignal): Promise<JobResult>;
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
