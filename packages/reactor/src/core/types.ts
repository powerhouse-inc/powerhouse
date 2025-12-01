import type {
  BaseDocumentDriveServer,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import type {
  Action,
  DocumentModelModule,
  Operation,
  PHDocument,
} from "document-model";
import type { Kysely } from "kysely";

import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IEventBus } from "../events/interfaces.js";
import type { IJobExecutorManager } from "../executor/interfaces.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { IReadModelCoordinator } from "../read-models/interfaces.js";
import type { DocumentViewDatabase } from "../read-models/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
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
  IDocumentIndexer,
  IDocumentView,
  IKeyframeStore,
  IOperationStore,
  ISyncCursorStorage,
  ISyncRemoteStorage,
} from "../storage/interfaces.js";
import type {
  DocumentIndexerDatabase,
  Database as StorageDatabase,
} from "../storage/kysely/types.js";
import type { IChannelFactory, ISyncManager } from "../sync/interfaces.js";

/**
 * A single mutation job within a batch request.
 */
export type MutationJobPlan = {
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
export type BatchMutationRequest = {
  jobs: MutationJobPlan[];
};

/**
 * Result from batch mutation operation.
 */
export type BatchMutationResult = {
  jobs: Record<string, JobInfo>;
};

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
   * @returns The up-to-date PHDocument with scopes and list of child document ids
   */
  get<TDocument extends PHDocument>(
    id: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }>;

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
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }>;

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
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }>;

  /**
   * Retrieves the operations for a document
   *
   * @param documentId - The document id
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The list of operations
   */
  getOperations(
    documentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<Record<string, PagedResults<Operation>>>;

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
   * Creates a document
   *
   * @param document - Document with optional id, slug, parent, model type, and initial state
   * @param signal - Optional abort signal to cancel the request
   * @returns The job status
   */
  create(document: PHDocument, signal?: AbortSignal): Promise<JobInfo>;

  /**
   * Deletes a document
   *
   * @param id - Document id
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  deleteDocument(id: string, signal?: AbortSignal): Promise<JobInfo>;

  /**
   * Applies a list of actions to a document.
   *
   * @param docId - Document id
   * @param branch - Branch to apply actions to
   * @param actions - List of actions to apply
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  mutate(
    docId: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Loads existing operations generated elsewhere into this reactor.
   */
  load(
    docId: string,
    branch: string,
    operations: Operation[],
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Applies multiple mutations across documents with dependency management.
   *
   * @param request - Batch mutation request containing jobs with dependencies
   * @param signal - Optional abort signal to cancel the request
   * @returns Map of job keys to job information
   */
  mutateBatch(
    request: BatchMutationRequest,
    signal?: AbortSignal,
  ): Promise<BatchMutationResult>;

  /**
   * Adds multiple documents as children to another
   *
   * @param parentId - Parent document id
   * @param documentIds - List of document ids to add as children
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  addChildren(
    parentId: string,
    documentIds: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  /**
   * Removes multiple documents as children from another
   *
   * @param parentId - Parent document id
   * @param documentIds - List of document ids to remove as children
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The job id and status
   */
  removeChildren(
    parentId: string,
    documentIds: string[],
    view?: ViewFilter,
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
export type ReactorFeatures = {
  /** Enable or disable legacy storage reads and writes. Default: true for backward compatibility */
  legacyStorageEnabled?: boolean;
};

export type ExecutorConfig = {
  count: number;
};

/**
 * Combined database type that includes all schemas
 */
export type Database = StorageDatabase &
  DocumentViewDatabase &
  DocumentIndexerDatabase;

/**
 * Container for all sync manager dependencies created during the build process.
 */
export interface SyncModule {
  remoteStorage: ISyncRemoteStorage;
  cursorStorage: ISyncCursorStorage;
  channelFactory: IChannelFactory;
  syncManager: ISyncManager;
}

/**
 * Container for all reactor dependencies created during the build process.
 * Provides direct access to internal components for advanced use cases,
 * testing, or integration scenarios.
 */
export interface ReactorModule {
  driveServer: BaseDocumentDriveServer;
  storage: IDocumentStorage & IDocumentOperationStorage;
  eventBus: IEventBus;
  documentModelRegistry: IDocumentModelRegistry;
  queue: IQueue;
  jobTracker: IJobTracker;
  executorManager: IJobExecutorManager;
  database: Kysely<Database>;
  operationStore: IOperationStore;
  keyframeStore: IKeyframeStore;
  writeCache: IWriteCache;
  operationIndex: IOperationIndex;
  documentView: IDocumentView;
  documentViewConsistencyTracker: IConsistencyTracker;
  documentIndexer: IDocumentIndexer;
  documentIndexerConsistencyTracker: IConsistencyTracker;
  readModelCoordinator: IReadModelCoordinator;
  syncModule: SyncModule | undefined;
  reactor: IReactor;
}
