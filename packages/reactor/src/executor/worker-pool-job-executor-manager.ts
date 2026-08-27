import type { ILogger } from "document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobRunningEvent,
  type JobWriteReadyEvent,
} from "../events/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type {
  IJobExecutionHandle,
  Job,
  JobRoutingMeta,
} from "../queue/types.js";
import { QueueEventTypes } from "../queue/types.js";
import type { IDocumentModelResolver } from "../registry/document-model-resolver.js";
import type {
  IExecutorWorker,
  IJobExecutor,
  IJobExecutorManager,
  WorkerExecutionOutcome,
} from "./interfaces.js";
import { DeferredJobs } from "./deferred-jobs.js";
import {
  JobResultHandler,
  toErrorInfo,
  type IJobResultHandler,
} from "./job-result-handler.js";
import {
  DEFAULT_DEFERRED_JOB_TTL_MS,
  JobExecutorEventTypes,
  type ExecutorManagerStatus,
  type JobCompletedEvent,
  type JobFailedEvent,
  type JobStartedEvent,
} from "./types.js";
import {
  WorkerAbortTimeoutError,
  WorkerExitedError,
  WorkerInitFailedError,
} from "./worker/errors.js";
import { bucketFor } from "./worker-pool-router.js";
import type {
  JobWriteReadyPayload,
  ModelManifestEntry,
} from "./worker/protocol.js";

/**
 * Factory invoked once per worker at `start()` time. The index is the
 * worker's position in the pool and the same value the manager will use
 * for sticky routing (`bucketFor(documentId) === index`).
 */
export type WorkerFactory = (index: number) => IExecutorWorker;

/**
 * Manages a pool of executor workers and dispatches jobs across them with
 * sticky-by-documentId routing. Replaces `SimpleJobExecutorManager` when
 * the worker pool is enabled.
 *
 * Responsibilities that stay on the parent (not in the worker):
 *  - Dequeueing from `IQueue` and routing to the matching worker bucket.
 *  - Emitting `JOB_RUNNING` and `JOB_WRITE_READY` events; the worker's
 *    local event bus is a no-op stub.
 *  - Maintaining the deferred-jobs map for `DocumentNotFoundError`.
 *  - Enriching the outgoing `JOB_WRITE_READY` with
 *    `collectionMemberships`, read from the operation index after the
 *    worker has committed. It takes the whole index rather than a
 *    narrower read interface so that handing it a cache does not
 *    compile: which documents a commit moves between collections is not
 *    derivable from action shape, because joining a collection also
 *    joins every group the joining document has referenced and that set
 *    comes from selects run inside the commit. A parent-side cache
 *    cannot learn it went stale, and a stale entry silently drops the
 *    document's operations from the outbox of every remote subscribed to
 *    the omitted collection. Costs one primary-key-prefix lookup on
 *    `document_collections` per job that produced operations, on a
 *    fire-and-forget path.
 *
 * @see Executor Worker Pool Design wiki page
 *   (Powerhouse board wiki id: d400d711-f07e-4389-a226-4e9fdd4fa8ba)
 */
export class WorkerPoolJobExecutorManager implements IJobExecutorManager {
  private workers: IExecutorWorker[] = [];
  private isRunning = false;
  private activeJobs = 0;
  private totalJobsProcessed = 0;
  private unsubscribe?: () => void;
  private deferredJobs: DeferredJobs;
  private resultHandler: IJobResultHandler;
  private jobTimeoutMs: number;

  constructor(
    private workerFactory: WorkerFactory,
    private eventBus: IEventBus,
    private queue: IQueue,
    private jobTracker: IJobTracker,
    private logger: ILogger,
    private resolver: IDocumentModelResolver,
    private operationIndex: IOperationIndex,
    jobTimeoutMs: number = 30_000,
    deferredJobTtlMs: number = DEFAULT_DEFERRED_JOB_TTL_MS,
  ) {
    this.jobTimeoutMs = jobTimeoutMs;
    this.deferredJobs = new DeferredJobs(
      queue,
      jobTracker,
      eventBus,
      logger,
      deferredJobTtlMs,
      () => this.tryDispatchAll(),
    );
    this.resultHandler = new JobResultHandler(
      queue,
      jobTracker,
      eventBus,
      resolver,
      logger,
    );
  }

  async start(numWorkers: number): Promise<void> {
    if (this.isRunning) {
      throw new Error("WorkerPoolJobExecutorManager is already running");
    }
    if (numWorkers < 1) {
      throw new Error("Number of workers must be at least 1");
    }

    this.workers = Array.from({ length: numWorkers }, (_, i) =>
      this.workerFactory(i),
    );
    await Promise.all(this.workers.map((w) => w.start()));

    this.unsubscribe = this.eventBus.subscribe(
      QueueEventTypes.JOB_AVAILABLE,
      async () => {
        await this.tryDispatchAll();
      },
    );

    this.isRunning = true;
    await this.tryDispatchAll();
  }

  async stop(graceful = true): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    if (graceful) {
      while (this.activeJobs > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    this.deferredJobs.failAll();

    await Promise.all(
      this.workers.map((w) =>
        w.shutdown(graceful).catch((err: unknown) => {
          this.logger.warn("worker shutdown failed: @Error", err);
        }),
      ),
    );

    this.workers = [];
    this.isRunning = false;
  }

  /**
   * Worker-pool mode has no in-process `IJobExecutor` instances — the
   * executors live in worker threads behind `IExecutorWorker` handles.
   * Returns an empty array; callers that need pool-aware introspection
   * should use `getStatus()` instead.
   */
  getExecutors(): IJobExecutor[] {
    return [];
  }

  /**
   * Broadcasts a `load-model` request to every running worker in parallel.
   * Rejects with the first worker's failure if any worker rejects (after
   * waiting for all in-flight broadcasts to settle). Workers that already
   * have the model registered respond with a `DuplicateModuleError`-rooted
   * failure; those are treated as success on the broadcast level so that
   * a model registered on some workers but not others still converges.
   */
  async loadModel(entry: ModelManifestEntry): Promise<void> {
    if (this.workers.length === 0) {
      return;
    }
    const results = await Promise.allSettled(
      this.workers.map((w) => w.loadModel(entry)),
    );
    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .filter((r) => !isDuplicateModuleFailure(r.reason));
    if (failures.length === 0) {
      return;
    }
    for (const f of failures) {
      this.logger.error(
        "worker failed to load model @entry: @error",
        entry,
        f.reason,
      );
    }
    throw failures[0].reason instanceof Error
      ? failures[0].reason
      : new Error(String(failures[0].reason));
  }

  getStatus(): ExecutorManagerStatus {
    return {
      isRunning: this.isRunning,
      numExecutors: this.workers.length,
      activeJobs: this.activeJobs,
      totalJobsProcessed: this.totalJobsProcessed,
    };
  }

  private async tryDispatchAll(): Promise<void> {
    if (!this.isRunning && this.workers.length === 0) {
      return;
    }
    await Promise.all(
      this.workers.map((worker) => this.tryDispatchFor(worker)),
    );
  }

  private async tryDispatchFor(worker: IExecutorWorker): Promise<void> {
    if (!worker.isIdle()) {
      return;
    }

    const index = worker.index;
    const numWorkers = this.workers.length;
    const predicate = (meta: JobRoutingMeta): boolean =>
      bucketFor(meta.documentId, numWorkers) === index;

    let handle: IJobExecutionHandle | null;
    try {
      handle = await this.queue.dequeueNextMatching(predicate);
    } catch (error) {
      this.logger.error("Error dequeueing next job: @Error", error);
      return;
    }

    if (!handle) {
      return;
    }

    handle.start();
    this.activeJobs++;
    this.jobTracker.markRunning(handle.job.id);

    const runningEvent: JobRunningEvent = {
      jobId: handle.job.id,
      jobMeta: handle.job.meta,
    };
    this.eventBus
      .emit(ReactorEventTypes.JOB_RUNNING, runningEvent)
      .catch(() => {});

    const workerId = worker.workerId;
    const startedEvent: JobStartedEvent = {
      job: handle.job,
      startedAt: new Date().toISOString(),
      workerId,
    };
    this.eventBus
      .emit(JobExecutorEventTypes.JOB_STARTED, startedEvent)
      .catch(() => {});

    const signal = AbortSignal.timeout(this.jobTimeoutMs);
    let outcome: WorkerExecutionOutcome;
    try {
      outcome = await worker.execute(handle.job, signal);
    } catch (error) {
      const errorInfo = toErrorInfo(
        error instanceof Error ? error : String(error),
      );
      if (isWorkerTransportError(error)) {
        await this.handleWorkerTransportFailure(worker, handle.job, errorInfo);
        return;
      }
      handle.fail(errorInfo);
      this.activeJobs--;
      this.jobTracker.markFailed(handle.job.id, errorInfo, handle.job);
      this.eventBus
        .emit(ReactorEventTypes.JOB_FAILED, {
          jobId: handle.job.id,
          error: new Error(errorInfo.message),
          job: handle.job,
        })
        .catch(() => {});
      const failedEvent: JobFailedEvent = {
        job: handle.job,
        error: errorInfo.message,
        willRetry: false,
        retryCount: 0,
        workerId,
      };
      this.eventBus
        .emit(JobExecutorEventTypes.JOB_FAILED, failedEvent)
        .catch(() => {});
      await this.tryDispatchFor(worker);
      return;
    }

    if (outcome.result.success) {
      this.totalJobsProcessed++;
      const completedEvent: JobCompletedEvent = {
        job: handle.job,
        result: outcome.result,
        workerId,
      };
      this.eventBus
        .emit(JobExecutorEventTypes.JOB_COMPLETED, completedEvent)
        .catch(() => {});
    } else {
      const failedEvent: JobFailedEvent = {
        job: handle.job,
        error: outcome.result.error?.message ?? "unknown",
        willRetry: false,
        retryCount: 0,
        workerId,
      };
      this.eventBus
        .emit(JobExecutorEventTypes.JOB_FAILED, failedEvent)
        .catch(() => {});
    }

    if (outcome.result.success && outcome.writeReady) {
      void this.emitWriteReady(handle.job, outcome.writeReady).catch(
        (error) => {
          this.logger.error(
            "emitWriteReady failed for job @jobId: @Error",
            { jobId: handle.job.id },
            error,
          );
        },
      );
    }

    await this.resultHandler.handleResult(handle, outcome.result, {
      deferJob: (documentId, job) => this.deferredJobs.add(documentId, job),
      flushDeferredFor: (documentId) => this.deferredJobs.flush(documentId),
    });

    this.activeJobs--;
    await this.tryDispatchFor(worker);
  }

  private async emitWriteReady(
    job: Job,
    payload: JobWriteReadyPayload,
  ): Promise<void> {
    const documentIds = [
      ...new Set(payload.operations.map((op) => op.context.documentId)),
    ];
    let collectionMemberships: Record<string, string[]> = {};
    if (documentIds.length > 0) {
      try {
        const found =
          await this.operationIndex.getCollectionsForDocuments(documentIds);
        collectionMemberships = fillMissingMemberships(documentIds, found);
      } catch (error) {
        this.logger.error(
          "Failed to load collection memberships for JOB_WRITE_READY: @Error",
          error,
        );
      }
    }

    const event: JobWriteReadyEvent = {
      jobId: job.id,
      operations: payload.operations,
      jobMeta: payload.jobMeta,
      collectionMemberships,
    };
    try {
      await this.eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, event);
    } catch (error) {
      this.logger.error("Failed to emit JOB_WRITE_READY event: @Error", error);
    }
  }

  /**
   * Handle a worker-transport failure (worker exited / init failed / abort
   * timed out) detected while `worker.execute` was in flight. Re-enqueues
   * the in-flight job via `queue.retryJob` so it is retried on a healthy
   * worker, then replaces the dead worker with a fresh handle and resumes
   * dispatch on the same bucket. Does NOT emit JOB_FAILED — the job is
   * not failed, only the worker is.
   */
  private async handleWorkerTransportFailure(
    dead: IExecutorWorker,
    job: Job,
    errorInfo: ReturnType<typeof toErrorInfo>,
  ): Promise<void> {
    this.logger.warn(
      "worker transport error during execute; retrying job @jobId on a replacement worker: @error",
      { jobId: job.id, workerId: dead.workerId },
      errorInfo.message,
    );

    this.activeJobs--;

    // Replace the dead worker BEFORE re-enqueuing the job. Otherwise
    // `queue.retryJob` emits JOB_AVAILABLE, the subscriber re-runs
    // `tryDispatchAll`, and the still-in-the-array dead worker picks up
    // the retried job — looping until heap exhaustion.
    await this.replaceWorker(dead);

    try {
      await this.queue.retryJob(job.id, errorInfo);
    } catch (error) {
      this.logger.error(
        "failed to re-enqueue job after worker transport error: @Error",
        error,
      );
    }
  }

  /**
   * Replace a dead worker at its existing pool index with a fresh handle
   * produced by `workerFactory`. Awaits `start()` on the replacement so it
   * is ready before dispatch resumes. On replacement failure the slot is
   * left empty (the index becomes a hole that subsequent retries will
   * route to no worker) and the error is logged — the manager keeps
   * running so other buckets continue to make progress.
   */
  private async replaceWorker(dead: IExecutorWorker): Promise<void> {
    const deadIndex = dead.index;
    if (this.workers[deadIndex] !== dead) {
      return;
    }

    let fresh: IExecutorWorker;
    try {
      fresh = this.workerFactory(deadIndex);
    } catch (error) {
      this.logger.error(
        "workerFactory threw while replacing dead worker at index @index: @Error",
        deadIndex,
        error,
      );
      return;
    }

    try {
      await fresh.start();
    } catch (error) {
      this.logger.error(
        "replacement worker at index @index failed to start: @Error",
        deadIndex,
        error,
      );
      return;
    }

    this.workers[deadIndex] = fresh;
    await this.tryDispatchFor(fresh);
  }
}

function isWorkerTransportError(error: unknown): boolean {
  return (
    error instanceof WorkerExitedError ||
    error instanceof WorkerInitFailedError ||
    error instanceof WorkerAbortTimeoutError
  );
}

function isDuplicateModuleFailure(reason: unknown): boolean {
  if (!(reason instanceof Error)) {
    return false;
  }
  if (reason.name === "DuplicateModuleError") {
    return true;
  }
  const cause = (reason as { cause?: unknown }).cause;
  return (
    cause instanceof Error && (cause as Error).name === "DuplicateModuleError"
  );
}

/**
 * Gives every requested document a key, empty when it belongs to no
 * collection. The operation index omits documents with no rows while the
 * membership cache defaulted them to `[]`, so this keeps the emitted
 * `JobWriteReadyEvent.collectionMemberships` shape unchanged.
 */
function fillMissingMemberships(
  documentIds: string[],
  found: Record<string, string[]>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const documentId of documentIds) {
    result[documentId] = found[documentId] ?? [];
  }
  return result;
}
