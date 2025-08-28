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
  error?: string;
};

/**
 * Job execution statuses
 */
export enum JobStatus {
  /** Job is queued but not yet started */
  PENDING = "PENDING",
  /** Job is currently being executed */
  RUNNING = "RUNNING",
  /** Job completed successfully */
  COMPLETED = "COMPLETED",
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
};
