import { type Job } from "../queue/types.js";

/**
 * Represents the result of a job execution
 */
export type JobResult = {
  /** The job that was executed */
  job: Job;

  /** Whether the job executed successfully */
  success: boolean;

  /** Error if the job failed */
  error?: Error;

  /** The operation generated from the action (if successful) */
  operation?: any;

  /** Timestamp when the job execution completed */
  completedAt?: string;

  /** Duration of job execution in milliseconds */
  duration?: number;

  /** Any additional metadata from the execution */
  metadata?: Record<string, any>;
};

/**
 * Configuration options for the job executor
 */
export type JobExecutorConfig = {
  /** Maximum number of concurrent jobs to execute */
  maxConcurrency?: number;

  /** Maximum time in milliseconds a job can run before being considered timed out */
  jobTimeoutMs?: number;

  /** Base delay in milliseconds for exponential backoff retries */
  retryBaseDelayMs?: number;

  /** Maximum delay in milliseconds for exponential backoff retries */
  retryMaxDelayMs?: number;
};

/**
 * Event types for the job executor
 */
export const JobExecutorEventTypes = {
  JOB_STARTED: 20000,
  JOB_COMPLETED: 20001,
  JOB_FAILED: 20002,
  EXECUTOR_STARTED: 20003,
  EXECUTOR_STOPPED: 20004,
} as const;

/**
 * Event data for job execution events
 */
export type JobStartedEvent = {
  job: Job;
  startedAt: string;
};

export type JobCompletedEvent = {
  job: Job;
  result: JobResult;
};

export type JobFailedEvent = {
  job: Job;
  error: string;
  willRetry: boolean;
  retryCount: number;
};

export type ExecutorStartedEvent = {
  config: JobExecutorConfig;
  startedAt: string;
};

export type ExecutorStoppedEvent = {
  stoppedAt: string;
  graceful: boolean;
};
