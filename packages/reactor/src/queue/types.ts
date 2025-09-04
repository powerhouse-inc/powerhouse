import type { Operation } from "document-model";

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
  fail(reason: string): void;
}

/**
 * Represents a job to be executed by the job executor
 */
export type Job = {
  /** Unique identifier for the job */
  id: string;

  /** The document ID this job operates on */
  documentId: string;

  /** The scope of the operation */
  scope: string;

  /** The branch of the operation */
  branch: string;

  /** The operation to be executed */
  operation: Operation;

  /** Timestamp when the job was created */
  createdAt: string;

  /** The hint for the queue to use for ordering the job */
  queueHint: string[];

  /** Number of retry attempts */
  retryCount?: number;

  /** Maximum number of retries allowed */
  maxRetries?: number;

  /** Last error message if job failed */
  lastError?: string;
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
