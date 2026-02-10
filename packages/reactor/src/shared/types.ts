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

  /**
   * A promise that resolves when the shutdown process is complete.
   *
   * For server environments, await this promise to ensure all active jobs finish
   * before exiting the process.
   */
  completed: Promise<void>;
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
 * Batch-specific metadata always present on every job.
 * Single jobs get a unique batchId and batchJobIds of [jobId].
 */
export type BatchMeta = {
  batchId: string;
  batchJobIds: string[];
};

/**
 * Metadata that flows through the job lifecycle.
 * Always includes batch fields; callers may add additional properties.
 */
export type JobMeta = BatchMeta & Record<string, unknown>;

import type { Job } from "../queue/types.js";

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
   * Metadata that flows through the job lifecycle.
   */
  meta: JobMeta;

  /**
   * The full job object, populated on failure for debugging purposes.
   */
  job?: Job;
};

/**
 * Job execution statuses
 */
export enum JobStatus {
  /** Job is queued but not yet started */
  PENDING = "PENDING",
  /** Job is currently being executed */
  RUNNING = "RUNNING",
  /** Operations have been written to the operation store (JOB_WRITE_READY event) */
  WRITE_READY = "WRITE_READY",
  /** Read models have finished indexing operations (JOB_READ_READY event) */
  READ_READY = "READ_READY",
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
