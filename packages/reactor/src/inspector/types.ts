import type { ProcessorStatus } from "@powerhousedao/shared/processors";
import type { RebuildResult, ValidationResult } from "../admin/types.js";
import type { CatchUpStatus, SweepResult } from "../catch-up/types.js";
import type { StorageSessionRecreatedEvent } from "../events/types.js";
import type { Job } from "../queue/types.js";

/**
 * The reactor's storage-health dimension, distinct from a channel's connection
 * state so "connected" can never read green while the single PGlite session is
 * dead (see
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md).
 *
 * `healthy` is false while a poisoned session has been reported and not yet
 * recovered; a successful recreate flips it back. `everRecreated`/`recreateCount`
 * and `lastRecreated` expose the self-heal history (W0.7's
 * STORAGE_SESSION_RECREATED signal).
 */
export type StorageHealth = {
  healthy: boolean;
  everRecreated: boolean;
  recreateCount: number;
  lastRecreated?: StorageSessionRecreatedEvent;
};

/** The storage-health source a `ReactorInspector` reads, when one is wired. */
export interface IStorageHealthProvider {
  getStorageHealth(): StorageHealth;
}

/**
 * Point-in-time view of the job queue, as the inspector surfaces it.
 *
 * `pendingJobs`/`executingJobs` are the queue's own `Job` records; the totals
 * are their lengths, carried on the snapshot so a consumer that only renders
 * counts does not have to walk the arrays.
 */
export type QueueStateSnapshot = {
  isPaused: boolean;
  pendingJobs: Job[];
  executingJobs: Job[];
  totalPending: number;
  totalExecuting: number;
};

/**
 * One registered document model, flattened for inspection: the model's type
 * and name, the module version registered for it, and every version the
 * registry supports for that type. Plain data, so it survives a structured
 * clone or a JSON hop to an inspector UI.
 */
export type InspectorDocumentModelInfo = {
  documentType: string;
  name: string;
  version: number;
  supportedVersions: number[];
};

/**
 * A tracked processor flattened for inspection: the identity and progress
 * fields of `TrackedProcessor` without its `record` or its `retry()` closure,
 * so the shape survives a structured-clone hop to an inspector UI.
 */
export type InspectorProcessorInfo = {
  processorId: string;
  factoryId: string;
  driveId: string;
  processorIndex: number;
  lastOrdinal: number;
  status: ProcessorStatus;
  lastError: string | undefined;
  lastErrorTimestamp: Date | undefined;
};

/**
 * The queue surface the inspector reads. A structural subset of
 * `InMemoryQueue`'s inspection methods rather than `IQueue`: these are
 * debugging affordances of the in-memory queue, not part of the queue
 * contract every implementation owes.
 */
export interface IInspectableQueue {
  readonly paused: boolean;
  pause(): void;
  resume(): Promise<void>;
  getPendingJobs(): Job[];
  getExecutingJobIds(): Map<string, Set<string>>;
  getJob(jobId: string): Job | undefined;
}

/**
 * The reactor's inspection surface: read-only observation plus the few
 * operator actions (pause/resume, retry, sweep, rebuild) that an inspector
 * UI drives. Implementations are expected to be hostable remotely, so every
 * method is async and every result is plain data.
 *
 * Raw SQL access is deliberately NOT here — see `IReactorDbQuery`.
 */
export interface IInspector {
  /**
   * The document models this reactor has registered, each with the module
   * version registered for it and every version its type supports. A reactor
   * with no registry wired reports an empty list.
   */
  listDocumentModels(): Promise<InspectorDocumentModelInfo[]>;
  getQueueState(): Promise<QueueStateSnapshot>;
  pauseQueue(): Promise<void>;
  resumeQueue(): Promise<void>;
  getProcessors(): Promise<InspectorProcessorInfo[]>;
  retryProcessor(processorId: string): Promise<void>;
  getCatchUpStatus(): Promise<CatchUpStatus>;
  sweepCatchUp(): Promise<SweepResult[]>;
  validateDocument(
    documentId: string,
    branch?: string,
  ): Promise<ValidationResult>;
  rebuildKeyframes(documentId: string, branch?: string): Promise<RebuildResult>;
  rebuildSnapshots(documentId: string, branch?: string): Promise<RebuildResult>;
  /**
   * The reactor's storage-health dimension. A reactor with no storage-health
   * source reports a healthy, never-recreated default.
   */
  getStorageHealth(): Promise<StorageHealth>;
}

/**
 * Raw SQL against the reactor's own store. Separate from `IInspector` because
 * it is an escape hatch, not reactor domain: a host can expose the inspection
 * surface while withholding this one.
 */
export interface IReactorDbQuery {
  queryDb(sql: string, params?: unknown[]): Promise<unknown[]>;
}
