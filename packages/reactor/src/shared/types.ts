/**
 * The document ID used for system operations (CREATE_DOCUMENT, DELETE_DOCUMENT, etc.)
 * System operations use this special ID along with the "system" scope.
 */
export const SYSTEM_DOCUMENT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Information about an error including message and stack trace.
 */
export type ErrorInfo = {
  message: string;
  stack: string;
};

/**
 * Describes the status of a shutdown operation.
 */
export type ShutdownStatus = {
  /**
   * True if and only if the system has been shutdown.
   *
   * This value is meant to be polled to determine if the system has been shutdown.
   *
   * In the case of a browser process, the `kill` method should be able to synchronously set this to true.
   *
   * In the case of a server process, a graceful shutdown period should be allowed for the system to finish its work.
   */
  get isShutdown(): boolean;
};

/**
 * Enum that determines deletion propagation.
 */
export enum PropagationMode {
  None = "none",
  Cascade = "cascade",
}

/**
 * Enum that describes the type of relationship change.
 */
export enum RelationshipChangeType {
  Added = "added",
  Removed = "removed",
}

/**
 * Describes the current state of a job.
 */
export type JobInfo = {
  id: string;
  status: JobStatus;
  createdAtUtcIso: string;
  completedAtUtcIso?: string;
  error?: ErrorInfo;
  errorHistory?: ErrorInfo[];
  result?: any;

  /**
   * A token for coordinating reads, only valid once a job reaches COMPLETED.
   */
  consistencyToken: ConsistencyToken;

  /**
   * Optional metadata that flows through the job lifecycle.
   */
  meta?: Record<string, unknown>;
};

/**
 * Job execution statuses
 */
export enum JobStatus {
  /** Job is queued but not yet started */
  PENDING = "PENDING",
  /** Job is currently being executed */
  RUNNING = "RUNNING",
  /** Operations have been written to the operation store (OPERATION_WRITTEN event) */
  WRITE_COMPLETED = "WRITE_COMPLETED",
  /** Read models have finished indexing operations (OPERATIONS_READY event) */
  READ_MODELS_READY = "READ_MODELS_READY",
  /** Job failed (may be retried) */
  FAILED = "FAILED",
}

/**
 * Describe the view of a set of documents. That is, what pieces of the
 * documents are populated.
 */
export type ViewFilter = {
  branch?: string;
  scopes?: string[];
  revision?: number;
};

/**
 * Describes filter options for searching documents.
 *
 * Each parameter is treated as an AND condition.
 */
export type SearchFilter = {
  type?: string;
  parentId?: string;
  ids?: string[];
  slugs?: string[];
};

/**
 * Describes the options for paging.
 */
export type PagingOptions = {
  cursor: string;
  limit: number;
};

/**
 * The paged result.
 */
export type PagedResults<T> = {
  results: T[];
  options: PagingOptions;

  next?: () => Promise<PagedResults<T>>;
  nextCursor?: string;
  /**
   * Count of items for pagination purposes.
   *
   * **⚠️ Inconsistent semantics**: The meaning of `totalCount` varies by method:
   * - `findByType` (new storage): Actual total count from storage (accurate)
   * - `findByType` (legacy storage): Current page size (fallback, not total)
   * - `findByIds`: Input IDs array size (not successfully fetched count)
   * - `findBySlugs`: Input slugs array size (not successfully fetched count)
   * - `findByParentId`: Relationships array size (not successfully fetched count)
   * - `filterByType`: `undefined` (cannot determine total after filtering)
   *
   * For lookup methods, this represents the input array size, not the count of
   * successfully fetched documents. This is a performance trade-off to avoid
   * fetching all documents. Only use `totalCount` for accurate pagination UI
   * with `findByType` (new storage). For other methods, use `nextCursor`/`next`
   * for pagination logic.
   *
   * Optional because it may not always be available or efficient to calculate.
   */
  totalCount?: number;
};

/**
 * A string key in the format `documentId:scope:branch` used to identify a consistency checkpoint.
 */
export type ConsistencyKey = `${string}:${string}:${string}`;

/**
 * Describes a specific point in a document's operation history.
 */
export type ConsistencyCoordinate = {
  documentId: string;
  scope: string;
  branch: string;
  operationIndex: number;
};

/**
 * A token that captures the state of write operations at a point in time.
 * Can be used to ensure read-after-write consistency.
 */
export type ConsistencyToken = {
  version: 1;
  createdAtUtcIso: string;
  coordinates: ConsistencyCoordinate[];
};
