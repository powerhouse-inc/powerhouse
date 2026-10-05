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
 * One drive (collection), flattened for inspection: its identity, the
 * collection id a remote synchronizes it under, and a summary of its node
 * tree. Plain data, so it survives a structured clone or a JSON hop.
 */
export type InspectorDriveInfo = {
  driveId: string;
  name: string;
  branch: string;
  /** The `drive.<branch>.<driveId>` collection id a remote syncs it under. */
  collectionId: string;
  documentType: string;
  /** Total entries in the drive's raw node array, malformed ones included. */
  nodeCount: number;
  /** File nodes (documents) in the drive tree. */
  fileCount: number;
  /** Folder nodes (`kind === "folder"`) in the drive tree. */
  folderCount: number;
  /** Readable nodes whose kind is neither file nor folder. */
  otherNodeCount: number;
  /** Raw node entries too malformed to read (no string id/kind). */
  unreadableNodeCount: number;
  /** The drive's icon, when it declares one. */
  icon: string | undefined;
};

/** One page of {@link InspectorDriveInfo}, cursor-paged for large reactors. */
export type InspectorDrivePage = {
  results: InspectorDriveInfo[];
  /** Absent once the last page has been served. */
  nextCursor: string | undefined;
};

/** One drive node a drive-integrity check flagged, by id and declared type. */
export type InspectorDriveIntegrityRef = {
  id: string;
  documentType: string;
};

/**
 * The result of walking a drive's node tree for integrity: file nodes whose
 * referenced document is absent from the reactor, and file nodes whose
 * declared document type no document model supports. Composed from the reactor
 * and the registry -- distinct from `DocumentIntegrityService`, which replays a
 * single document rather than walking a drive.
 *
 * The walk runs over ONE drive snapshot in a single pass, so the result is
 * internally consistent: every file node in the snapshot is examined once, and
 * `checkedNodeCount` therefore equals `totalFileNodeCount`. There is no cursor,
 * because paging the walk by array offset across re-reads of a mutating drive
 * is exactly what let a node be skipped or double-reported.
 */
export type InspectorDriveIntegrity = {
  driveId: string;
  /** File nodes examined (the whole snapshot; equals totalFileNodeCount). */
  checkedNodeCount: number;
  /** File nodes in the whole drive tree. */
  totalFileNodeCount: number;
  missingDocuments: InspectorDriveIntegrityRef[];
  unsupportedTypes: InspectorDriveIntegrityRef[];
};

/**
 * The attachment byte store and replicator as the inspector surfaces them.
 *
 * `present` is the fact a UI reads first: a reactor that holds no attachment
 * store answers `present: false` with everything else at its empty default,
 * rather than erroring -- honest degradation, because a reactor that moves no
 * bytes is a legitimate thing to inspect. `hasReplicator` separates a host with
 * a fetch-on-reference replicator (a browser monitor's own reactor) from one
 * whose store is served directly with no replicator (a Switchboard): when it is
 * false, the replicator counters below are not meaningful and a UI shows store
 * presence and bytes held instead.
 */
export type InspectorAttachmentInfo = {
  /** Whether this reactor holds an attachment byte store at all. */
  present: boolean;
  /** The store class, e.g. "kysely", "idb", "memory"; "none" when absent. */
  storeKind: string;
  /** Whether a fetch-on-reference replicator is wired over the store. */
  hasReplicator: boolean;
  /** Whether that replicator is subscribed and scheduling. */
  replicatorRunning: boolean;
  /** Whether the replicator's boot re-scan over the reference backlog finished. */
  backlogScanned: boolean;
  /** Distinct attachment hashes the replicator has been told about. */
  refsSeen: number;
  /** Hashes whose bytes are in the local store. */
  held: number;
  /** Bytes held locally (`storageUsed`). */
  bytesHeld: number;
  /** Hashes waiting on a concurrency slot. */
  queued: number;
  /** Hashes with a fetch in flight. */
  fetching: number;
  /** Hashes still being chased (queued or fetching). */
  pendingFetches: number;
  /** Hashes with a retry scheduled (pending upload, lagging index, or error). */
  waiting: number;
  /** Hashes a peer answered not-found for, past the lag budget. */
  notFound: number;
  /** Hashes whose transport kept erroring. */
  failed: number;
  /** The most recent transport error, when one has occurred. */
  lastError: string | undefined;
};

/** The attachment-store source a `ReactorInspector` reads, when one is wired. */
export interface IInspectableAttachmentStore {
  getAttachmentInfo(): Promise<InspectorAttachmentInfo>;
}

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
  /**
   * The drives (collections) this reactor holds, one page at a time. A reactor
   * with no reactor facade wired reports an empty page.
   */
  listDrives(cursor?: string, limit?: number): Promise<InspectorDrivePage>;
  /**
   * Walks one drive's node tree on the given branch, reporting file nodes whose
   * document is absent from the reactor and file nodes whose type no document
   * model supports. The walk runs over a single drive snapshot in one pass --
   * both the drive read and the existence checks resolve on `branch` -- so a
   * drive mutated mid-check cannot skip or double-report a node, and a non-main
   * drive is read on its own branch rather than falsely reported all-missing. A
   * reactor with no facade wired reports an empty result.
   */
  checkDriveIntegrity(
    driveId: string,
    branch: string,
  ): Promise<InspectorDriveIntegrity>;
  /**
   * This reactor's attachment store and replicator. A reactor with no store
   * wired reports a `present: false` shape rather than erroring.
   */
  getAttachmentInfo(): Promise<InspectorAttachmentInfo>;
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
