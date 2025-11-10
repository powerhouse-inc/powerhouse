import type { Action, Operation } from "document-model";
import type { ErrorInfo } from "../shared/types.js";

export type JobKind = "mutation" | "load";

/**
 * State of a job in the queue
 */
export enum JobQueueState {
  UNKNOWN = -1,
  PREPROCESSING = 0,
  PENDING = 1,
  READY = 2,
  RUNNING = 3,
  RESOLVED = 4,
}

/**
 * Interface for a job execution handle
 */
export interface IJobExecutionHandle {
  readonly job: Job;
  readonly state: JobQueueState;

  start(): void;
  complete(): void;
  fail(error: ErrorInfo): void;
}

/**
 * Represents a job to be executed by the job executor
 */
export type Job = {
  /** Unique identifier for the job */
  id: string;

  /** Classification of the job so executors can switch behavior */
  kind: JobKind;

  /** The document ID this job operates on */
  documentId: string;

  /** The scope of the operations */
  scope: string;

  /** The branch of the operations */
  branch: string;

  /** The actions to be executed (processed sequentially) */
  actions: Action[];

  /** Pre-existing operations to import (used for load jobs) */
  operations: Operation[];

  /** Timestamp when the job was created */
  createdAt: string;

  /** The hint for the queue to use for ordering the job */
  queueHint: string[];

  /** Number of retry attempts */
  retryCount?: number;

  /** Maximum number of retries allowed */
  maxRetries?: number;

  /** Last error if job failed */
  lastError?: ErrorInfo;

  /** History of all errors from each attempt (ordered) */
  errorHistory: ErrorInfo[];
};

/**
 * Event types for the queue system
 */
export const QueueEventTypes = {
  JOB_AVAILABLE: 10000,
} as const;

/**
 * Event data for job available events
 */
export type JobAvailableEvent = {
  documentId: string;
  scope: string;
  branch: string;
  jobId: string;
};
