import type { UndoRedoTargets } from "@powerhousedao/shared/document-model";
import type {
  Action,
  DocumentModelModule,
  ISigner,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";

import type { IProcessorManager } from "@powerhousedao/shared/processors";
import type { ReactorStorageFacts } from "../inspector/types.js";
import type { ISyncInspector } from "../sync/sync-inspection.js";
import type { DocumentPurgeService } from "../admin/document-purge-service.js";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { ICatchUp, ISettledWatermark } from "../catch-up/types.js";
import type { ReactorClient } from "../client/reactor-client.js";
import type { ReactorReadClient } from "../client/read-client.js";
import type {
  IReactorClient,
  IReactorReadClient,
  IReactorWriteClient,
} from "../client/types.js";
import type { ReactorWriteClient } from "../client/write-client.js";
import type { IEventBus } from "../events/interfaces.js";
import type { IJobExecutorManager } from "../executor/interfaces.js";
import type {
  ProtocolSupport,
  ReactorFeatureFlags,
} from "../executor/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { GroupReevaluationTrigger } from "./group-reevaluation-trigger.js";
import type { IReadModelCoordinator } from "../read-models/interfaces.js";
import type { DocumentViewDatabase } from "../read-models/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type { IJobAwaiter } from "../shared/awaiter.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type {
  ConsistencyToken,
  JobInfo,
  PagedResults,
  PagingOptions,
  SearchFilter,
  ShutdownStatus,
  ViewFilter,
} from "../shared/types.js";
import type {
  DocumentRelationship,
  IDocumentIndexer,
  IDocumentView,
  IKeyframeStore,
  IOperationStore,
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncHoldStorage,
  ISyncRemoteStorage,
  IWriteIdentityStore,
  OperationFilter,
} from "../storage/interfaces.js";
import type {
  DocumentIndexerDatabase,
  Database as StorageDatabase,
} from "../storage/kysely/types.js";
import type { CatchUpPriority } from "../processors/catch-up-priority.js";
import type { PoolInstrumentation } from "../storage/pool-instrumentation.js";
import type { IGroupCommitStorage } from "../storage/kysely/group-commit-storage.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import type {
  IChannelFactory,
  ISyncAdmin,
  ISyncManager,
} from "../sync/interfaces.js";

export class AbortError extends Error {
  constructor(message?: string) {
    super(message || "Aborted");

    this.name = "AbortError";
  }
}

export const isAbortError = (error: unknown): boolean => {
  return error instanceof AbortError;
};

/**
 * A single mutation job within a batch request.
 */
export type ExecutionJobPlan = {
  key: string;
  documentId: string;
  scope: string;
  branch: string;
  actions: Action[];
  dependsOn: string[];
};

/**
 * Request for batch mutation operation.
 */
export type BatchExecutionRequest = {
  jobs: ExecutionJobPlan[];
};

/**
 * Result from batch mutation operation.
 */
export type BatchExecutionResult = {
  jobs: Record<string, JobInfo>;
};

/**
 * A single load job within a batch request.
 *
 * `dependsOn` lists intra-batch plan keys (resolved to UUIDs by `loadBatch`).
 * `externalDeps` lists pre-resolved job UUIDs from prior batches; these are
 * appended to the queue hint without going through plan-key resolution.
 */
export type LoadJobPlan = {
  key: string;
  documentId: string;
  scope: string;
  branch: string;
  operations: Operation[];
  dependsOn: string[];
  externalDeps: string[];
};

/**
 * Request for batch load operation.
 */
export type BatchLoadRequest = {
  jobs: LoadJobPlan[];
};

/**
 * Result from batch load operation.
 */
export type BatchLoadResult = {
  jobs: Record<string, JobInfo>;
};

export type { UndoRedoTargets };

/**
 * The main Reactor interface that serves as a facade for document operations.
 * This interface provides a unified API for document management, including
 * creation, retrieval, mutation, and deletion operations.
 */
export interface IReactor {
  /**
   * Signals that the reactor should shutdown.
   */
  kill(): ShutdownStatus;

  /**
   * Retrieves a list of document model modules.
   *
   * @param namespace - Optional namespace like "powerhouse" or "sky", defaults to ""
   * @param paging - Optional options for paging data in large queries.
   * @param signal - Optional abort signal to cancel the request
   * @returns List of document model modules
   */
  getDocumentModels(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>>;

  /**
   * Retrieves a specific PHDocument by id
   *
   * @param id - Required, this is the document id
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The up-to-date PHDocument
   */
  get<TDocument extends PHDocument>(
    id: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Retrieves a specific PHDocument by slug
   *
   * @param slug - Required, this is the document slug
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The up-to-date PHDocument with scopes and list of child document ids
   */
  getBySlug<TDocument extends PHDocument>(
    slug: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Retrieves a specific PHDocument by identifier (either id or slug).
   * Throws an error if the identifier matches both an id and a slug that refer to different documents.
   *
   * @param identifier - Required, this is the document id or slug
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The up-to-date PHDocument with scopes and list of child document ids
   * @throws {Error} If identifier matches both an ID and slug referring to different documents
   */
  getByIdOrSlug<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Retrieves outgoing relationships of a given type from a source document.
   *
   * @param sourceId - The source document id
   * @param relationshipType - The relationship type to filter by
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The list of target document ids
   */
  getOutgoingRelationships(
    sourceId: string,
    relationshipType: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Retrieves incoming relationships of a given type to a target document.
   *
   * @param targetId - The target document id
   * @param relationshipType - The relationship type to filter by
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The list of source document ids
   */
  getIncomingRelationships(
    targetId: string,
    relationshipType: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Retrieves outgoing relationship edges from a source document, carrying the
   * metadata and timestamps the document ids alone do not.
   *
   * @param sourceId - The source document id
   * @param relationshipType - Optional relationship type to filter by
   * @param paging - Optional pagination options
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The matching relationship edges
   */
  getOutgoingRelationshipEdges(
    sourceId: string,
    relationshipType?: string,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>>;

  /**
   * Retrieves incoming relationship edges to a target document, carrying the
   * metadata and timestamps the document ids alone do not.
   *
   * @param targetId - The target document id
   * @param relationshipType - Optional relationship type to filter by
   * @param paging - Optional pagination options
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The matching relationship edges
   */
  getIncomingRelationshipEdges(
    targetId: string,
    relationshipType?: string,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>>;

  /**
   * Retrieves the operations for a document
   *
   * @param documentId - The document id
   * @param view - Optional filter containing branch and scopes information
   * @param filter - Optional filter for actionTypes, timestamps, and revision
   * @param paging - Optional pagination options
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The list of operations
   */
  getOperations(
    documentId: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<Record<string, PagedResults<Operation>>>;

  /**
   * Resolves what a base-reducer 3 undo and redo of a scope would retract:
   * from every stored row, each derived with its own model version and every
   * upgrade applied at its boundary. A client submits a RETRACT of the target
   * under its author's signature; base-reducer 3 refuses a submitted UNDO or
   * REDO. A scope the retraction rule does not derive, and every scope below
   * 3, has none.
   *
   * @param documentId - The document id
   * @param scope - The scope to undo or redo in
   * @param branch - Optional branch, defaults to "main"
   * @param signal - Optional abort signal to cancel the request
   * @returns The undo and redo targets, each absent when there is none
   */
  resolveUndoRedo(
    documentId: string,
    scope: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<UndoRedoTargets>;

  /**
   * Filters documents by criteria and returns a list of them
   *
   * @param search - Search filter options (type, parentId, identifiers)
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns List of documents matching criteria and pagination cursor
   */
  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;

  /**
   * Creates a document. A header without protocolVersions takes the versions
   * this reactor selects for its type, as a client's create does.
   *
   * @param document - Document with optional id, slug, parent, model type, and initial state
   * @param signer - Optional signer to sign the actions
   * @param signal - Optional abort signal to cancel the request
   * @param meta - Optional metadata that flows through the job lifecycle
   * @returns The job status
   */
  create(
    document: PHDocument,
    signer?: ISigner,
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<JobInfo>;

  /**
   * Deletes a document
   *
   * @param id - Document id
   * @param signer - Optional signer to sign the actions
   * @param signal - Optional abort signal to cancel the request
   * @param meta - Optional metadata that flows through the job lifecycle
   * @returns The job id and status
   */
  deleteDocument(
    id: string,
    signer?: ISigner,
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<JobInfo>;

  /**
   * Applies a list of actions to a document.
   *
   * On base-reducer 3 a submitted UNDO or REDO fails the job with
   * `SubmittedUndoRefusedError`: undo there is a RETRACT of a target, which
   * `resolveUndoRedo` resolves and the author signs.
   *
   * On base-reducer 3 the actions run in canonical order (timestamp, then
   * action id), not array order. `generateActionId` ids keep one process's
   * creation order; other ids tied in a millisecond run in id order.
   *
   * @param docId - Document id
   * @param branch - Branch to apply actions to
   * @param actions - List of actions to apply
   * @param signal - Optional abort signal to cancel the request
   * @param meta - Optional metadata that flows through the job lifecycle
   * @returns The job id and status
   */
  execute(
    docId: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<JobInfo>;

  /**
   * Loads existing operations generated elsewhere into this reactor.
   *
   * @param docId - Document id
   * @param branch - Branch to load operations to
   * @param operations - List of operations to load
   * @param signal - Optional abort signal to cancel the request
   * @param meta - Optional metadata that flows through the job lifecycle
   * @returns The job id and status
   */
  load(
    docId: string,
    branch: string,
    operations: Operation[],
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<JobInfo>;

  /**
   * Applies multiple mutations across documents with dependency management.
   *
   * Ordering, and only ordering. A batch is neither atomic nor transactional:
   * it is submitted as one job per plan entry, each commits on its own, and
   * there is no batch-level rollback, status or consistency token.
   *
   * A dependency waits for the job before it to finish, not to succeed. A
   * failed job leaves the queue the same way a successful one does, so its
   * dependents still run, against whatever state the failure left behind.
   * Jobs that committed stay committed.
   *
   * Re-submitting after a partial failure re-applies the entries that already
   * succeeded, because a job plan carries no idempotency key. Compensation
   * belongs to the caller.
   *
   * @param request - Batch mutation request containing jobs with dependencies
   * @param signal - Optional abort signal to cancel the request
   * @returns A receipt, not a result: every JobInfo is a PENDING snapshot
   * carrying a placeholder consistency token. Poll getJobStatus per job id, or
   * subscribe to JOB_FAILED and correlate on meta.batchId, to find out what
   * each one did.
   */
  executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<BatchExecutionResult>;

  /**
   * Loads multiple batches of pre-existing operations across documents with dependency management.
   *
   * @param request - Batch load request containing jobs with dependencies
   * @param signal - Optional abort signal to cancel the request
   * @param meta - Optional metadata that flows through the job lifecycle
   * @returns Map of job keys to job information
   */
  loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<BatchLoadResult>;

  /**
   * Adds a relationship between two documents.
   *
   * Adding a relationship that already exists is a no-op, metadata included.
   * Use {@link IReactor.updateRelationship} to change an existing edge.
   *
   * @param sourceId - Source document id
   * @param targetId - Target document id
   * @param relationshipType - Relationship type identifier
   * @param metadata - Optional metadata to attach to the relationship
   * @param branch - Branch to add the relationship to, defaults to "main"
   * @param signer - Optional signer to sign the actions
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  addRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch?: string,
    signer?: ISigner,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Replaces the metadata of an existing relationship, preserving its createdAt.
   *
   * @param sourceId - Source document id
   * @param targetId - Target document id
   * @param relationshipType - Relationship type identifier
   * @param metadata - The metadata to store; null clears it
   * @param branch - Branch holding the relationship, defaults to "main"
   * @param signer - Optional signer to sign the actions
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  updateRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch?: string,
    signer?: ISigner,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Removes a relationship between two documents.
   *
   * @param sourceId - Source document id
   * @param targetId - Target document id
   * @param relationshipType - Relationship type identifier
   * @param branch - Branch to remove the relationship from, defaults to "main"
   * @param signer - Optional signer to sign the actions
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  removeRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: string,
    branch?: string,
    signer?: ISigner,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Retrieves the status of a job
   *
   * @param jobId - The job id
   * @returns The job status
   */
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo>;
}

/**
 * Feature flags for reactor configuration
 */
export type ReactorFeatures = { [key: string]: boolean };

/**
 * Combined database type that includes all schemas
 */
export type Database = StorageDatabase &
  DocumentViewDatabase &
  DocumentIndexerDatabase;

/**
 * Base sync-manager contract resolvable in every environment (in-process or
 * proxied over a worker boundary): just the sync manager.
 */
export interface SyncModule {
  syncManager: ISyncManager;
  /** Absent where the host cannot reach the sync manager's repair levers. */
  syncAdmin?: ISyncAdmin;
  /** Absent where the host cannot read the sync manager's channel state. */
  syncInspector?: ISyncInspector;
}

/**
 * Sync module composed in-process, with the full set of sync dependencies.
 */
export interface InProcessSyncModule extends SyncModule {
  remoteStorage: ISyncRemoteStorage;
  cursorStorage: ISyncCursorStorage;
  deadLetterStorage: ISyncDeadLetterStorage;
  holdStorage: ISyncHoldStorage;
  channelFactory: IChannelFactory;
}

/**
 * Base reactor module contract — the dependencies a client resolves regardless
 * of where the reactor graph lives. In-process hosts compose
 * {@link InProcessReactorModule}; a worker-backed tab resolves only this base
 * (the full graph lives in the worker).
 */
export interface ReactorModule {
  documentModelRegistry: IDocumentModelRegistry;
  syncModule: SyncModule | undefined;
  eventBus: IEventBus;
}

/**
 * Reactor module composed in-process: the full dependency graph. Provides
 * direct access to internal components for advanced use cases, testing, or
 * integration scenarios.
 */
/**
 * A component that failed to build or catch up, and was started anyway.
 *
 * The reactor does not take itself down for one of these: a read model that
 * cannot reach its database should not stop the writes. But it does serve
 * reads that are silently incomplete, so the failure is recorded rather than
 * only logged -- a host can refuse readiness on a non-empty list instead of
 * reporting healthy while answering from an index that stopped at boot.
 */
export interface DegradedComponent {
  /** Names the component that failed, e.g. `read model 0 (attachments)`. */
  component: string;
  error: Error;
}

export interface InProcessReactorModule extends ReactorModule {
  /**
   * The enforcement flags this reactor resolved, as plain booleans. Held on the
   * module because they select what a read enforces as well as what a write
   * does, and the read surface is composed outside the reactor.
   */
  featureFlags: ReactorFeatureFlags;
  /** The protocol versions this reactor runs, which its reads check stored documents against. */
  protocolSupport: ProtocolSupport;
  queue: IQueue;
  jobTracker: IJobTracker;
  executorManager: IJobExecutorManager;
  database: Kysely<Database>;
  operationStore: IOperationStore;
  keyframeStore: IKeyframeStore;
  /** The write side's document identity; mutations resolve targets with it. */
  writeIdentityStore: IWriteIdentityStore;
  writeCache: IWriteCache;
  operationIndex: IOperationIndex;
  documentView: IDocumentView;
  documentViewConsistencyTracker: IConsistencyTracker;
  documentIndexer: IDocumentIndexer;
  documentIndexerConsistencyTracker: IConsistencyTracker;
  readModelCoordinator: IReadModelCoordinator;
  subscriptionManager: IReactorSubscriptionManager;
  processorManager: IProcessorManager;
  processorManagerConsistencyTracker: IConsistencyTracker;
  reactor: IReactor;
  syncModule: InProcessSyncModule | undefined;
  /**
   * Present when authGroups is on: enqueues re-evaluation jobs for the
   * documents a group membership change affects. Started by the builder;
   * hosts shut it down alongside the sync manager.
   */
  groupReevaluationTrigger: GroupReevaluationTrigger | undefined;
  /**
   * Instrumented pg.Pool handles registered with the builder, either by
   * createPostgresDatabase or by withInstrumentedPool. Empty when no pg
   * pool is in use (e.g. PGlite tests). Observers iterate the array to
   * record per-pool acquire-wait and stat metrics.
   */
  pools: PoolInstrumentation[];
  /**
   * Components that failed to initialize and were started degraded. Empty on
   * a clean boot. See {@link DegradedComponent}.
   */
  degradedComponents: DegradedComponent[];
  /** Read-side catch-up: status and an on-demand sweep. */
  catchUp: ICatchUp;
  /** Paces processor backfills against requests; see `withCatchUpPriority`. */
  catchUpPriority: CatchUpPriority;
  /** The settled watermark this thread's catch-up sweeps up to. */
  settledWatermark: ISettledWatermark;
  /** Enqueues purge jobs; the erasure scheduler is its only caller. */
  documentPurgeService: DocumentPurgeService;
  /** What the builder knows about the store; see `withStorageFacts`. */
  storageFacts: ReactorStorageFacts;
  /** Set by `withGroupCommitPGlite`; the host closes the store through it. */
  groupCommitStorage?: IGroupCommitStorage;
  /**
   * Graceful teardown, in the order the `withSignalHandlers()` path uses:
   * `reactor.kill()`, then every `withShutdownHook` / `registerShutdownHook`
   * hook in order (a failing hook is logged and skipped), then
   * `database.destroy()`. Runs once: every call, concurrent or later, returns
   * the same promise, and a SIGINT/SIGTERM through `withSignalHandlers()`
   * joins it rather than tearing down again. Never exits the process; only
   * the signal path does. Rejects when the reactor fails to stop (the hooks
   * and the database are then left alone) or the database fails to close.
   */
  shutdown: () => Promise<void>;
}

/**
 * Base reactor client contract — the two client halves, the facade over them,
 * and the reactor module. Satisfied by every host; in-process hosts extend it
 * with {@link InProcessReactorClientModule}.
 *
 * Framework code takes `read` and `write`; `client` is for consumers that have
 * not moved to the halves.
 */
export interface ReactorClientModule {
  /** Answers from read models; never enqueues. */
  read: IReactorReadClient;
  /** Enqueues; every write returns a handle. */
  write: IReactorWriteClient;
  /** The facade over both; kept for consumers that have not moved. */
  client: IReactorClient;
  reactorModule: ReactorModule | undefined;
}

/**
 * Reactor client composed in-process: the concrete client plus direct refs to
 * the in-process graph internals.
 */
export interface InProcessReactorClientModule extends ReactorClientModule {
  read: ReactorReadClient;
  write: ReactorWriteClient;
  client: ReactorClient;
  reactor: IReactor;
  eventBus: IEventBus;
  documentIndexer: IDocumentIndexer;
  documentView: IDocumentView;
  signer: ISigner;
  subscriptionManager: IReactorSubscriptionManager;
  jobAwaiter: IJobAwaiter;
  reactorModule: InProcessReactorModule | undefined;
}
