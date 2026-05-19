import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { ICollectionMembershipCache } from "../cache/collection-membership-cache.js";
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
import { DocumentNotFoundError } from "../shared/errors.js";
import type {
  IExecutorWorker,
  IJobExecutor,
  IJobExecutorManager,
  WorkerExecutionOutcome,
} from "./interfaces.js";
import {
  JobResultHandler,
  toErrorInfo,
  type IJobResultHandler,
} from "./job-result-handler.js";
import type { ExecutorManagerStatus } from "./types.js";
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
 * Action types whose application invalidates the parent's collection
 * membership cache. Mirrors the in-process invalidation pattern in
 * `document-action-handler.ts` (the worker pool relocates that work to
 * the parent because the cache lives there).
 */
const MEMBERSHIP_INVALIDATING_ACTIONS = new Set([
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
  "UPDATE_RELATIONSHIP",
  "DELETE_DOCUMENT",
]);

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
 *  - Owning the authoritative `ICollectionMembershipCache` — workers do
 *    not query it. Each result enriches the outgoing `JOB_WRITE_READY`
 *    with `collectionMemberships` and invalidates targets named by
 *    relationship/delete operations before the lookup.
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
  private deferredJobs = new Map<string, Job[]>();
  private resultHandler: IJobResultHandler;
  private jobTimeoutMs: number;

  constructor(
    private workerFactory: WorkerFactory,
    private eventBus: IEventBus,
    private queue: IQueue,
    private jobTracker: IJobTracker,
    private logger: ILogger,
    private resolver: IDocumentModelResolver,
    private collectionMembershipCache: ICollectionMembershipCache,
    jobTimeoutMs: number = 30_000,
  ) {
    this.jobTimeoutMs = jobTimeoutMs;
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

    for (const [, jobs] of this.deferredJobs) {
      for (const job of jobs) {
        const errorInfo = toErrorInfo(
          new DocumentNotFoundError(job.documentId),
        );
        this.jobTracker.markFailed(job.id, errorInfo, job);
        this.eventBus
          .emit(ReactorEventTypes.JOB_FAILED, {
            jobId: job.id,
            error: new DocumentNotFoundError(job.documentId),
            job,
          })
          .catch(() => {});
      }
    }
    this.deferredJobs.clear();

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
      await this.tryDispatchFor(worker);
      return;
    }

    if (outcome.result.success && outcome.writeReady) {
      await this.emitWriteReady(handle.job, outcome.writeReady);
    }

    if (outcome.result.success) {
      this.totalJobsProcessed++;
    }

    await this.resultHandler.handleResult(handle, outcome.result, {
      deferJob: (documentId, job) => {
        const existing = this.deferredJobs.get(documentId) ?? [];
        existing.push(job);
        this.deferredJobs.set(documentId, existing);
      },
      flushDeferredFor: (documentId) => this.flushDeferredJobs(documentId),
    });

    this.activeJobs--;
    await this.tryDispatchFor(worker);
  }

  private async emitWriteReady(
    job: Job,
    payload: JobWriteReadyPayload,
  ): Promise<void> {
    this.invalidateMembershipsFor(payload.operations);

    const documentIds = [
      ...new Set(payload.operations.map((op) => op.context.documentId)),
    ];
    let collectionMemberships: Record<string, string[]> = {};
    try {
      collectionMemberships =
        await this.collectionMembershipCache.getCollectionsForDocuments(
          documentIds,
        );
    } catch (error) {
      this.logger.error(
        "Failed to load collection memberships for JOB_WRITE_READY: @Error",
        error,
      );
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

  private invalidateMembershipsFor(operations: OperationWithContext[]): void {
    for (const op of operations) {
      const actionType = op.operation.action.type;
      if (!MEMBERSHIP_INVALIDATING_ACTIONS.has(actionType)) {
        continue;
      }
      const target = extractMembershipTarget(op);
      if (target) {
        this.collectionMembershipCache.invalidate(target);
      }
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

  private async flushDeferredJobs(documentId: string): Promise<void> {
    const jobs = this.deferredJobs.get(documentId);
    if (!jobs || jobs.length === 0) {
      return;
    }
    this.deferredJobs.delete(documentId);

    for (const job of jobs) {
      try {
        await this.queue.enqueue(job);
      } catch (error) {
        this.logger.error("Error re-enqueuing deferred job: @Error", error);
      }
    }
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

function extractMembershipTarget(op: OperationWithContext): string | undefined {
  const actionType = op.operation.action.type;
  const input = op.operation.action.input as
    | { targetId?: string; documentId?: string }
    | undefined;
  if (
    actionType === "ADD_RELATIONSHIP" ||
    actionType === "REMOVE_RELATIONSHIP" ||
    actionType === "UPDATE_RELATIONSHIP"
  ) {
    return input?.targetId;
  }
  if (actionType === "DELETE_DOCUMENT") {
    return input?.documentId ?? op.context.documentId;
  }
  return undefined;
}
