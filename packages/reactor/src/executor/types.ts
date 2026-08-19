import type {
  Action,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { Operation } from "@powerhousedao/shared/document-model";
import type { Job } from "../queue/types.js";
import type { IOperationIndexTxn } from "../cache/operation-index-types.js";
import type { ExecutionStores } from "./execution-scope.js";

/**
 * One action to write, and everything known about it before it is written.
 */
export type PendingWrite = {
  action: Action;

  /** How many preceding operations this one supersedes. */
  skip: number;

  /** The operation being replayed, when this write came from a load. */
  sourceOperation?: Operation;

  /** The remote the write arrived from, or empty for a local write. */
  sourceRemote: string;

  /** Why the write was refused, when the evaluation is already decided. */
  deniedReason?: string;
};

/**
 * The job in flight, and what a write is committed through.
 */
export type ExecutingJob = {
  job: Job;
  startTime: number;
  indexTxn: IOperationIndexTxn;
  stores: ExecutionStores;
  signal?: AbortSignal;

  /**
   * Whether these writes were accepted at their own positions already, which a
   * load and a re-evaluation pass both are. Admission does not decide again,
   * because re-deciding accepted history would drop operations.
   */
  replayingAcceptedHistory: boolean;

  /**
   * Whether every write already carries the verdict computed at its own position.
   * Deciding again at the stream heads would overwrite a verdict the rest of the
   * fleet computes differently.
   */
  evaluatedByPosition: boolean;

  /**
   * Cache entries to invalidate only after the execution transaction commits.
   * An UPGRADE_DOCUMENT reshapes sibling scopes it writes no operation to;
   * invalidating them mid-transaction lets a concurrent read repopulate the
   * cache with pre-upgrade state that then survives the commit.
   */
  postCommitInvalidations: Array<{
    documentId: string;
    scope: string;
    branch: string;
  }>;
};

export type PositionedWrites = {
  writes: PendingWrite[];
  evaluatedByPosition: boolean;
  /** Set when a submitted action was refused at its position. */
  error?: Error;
};

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

  /** The operations generated from the actions (if successful) */
  operations?: Operation[];

  /**
   * Operations with context (includes ephemeral resultingState).
   * Used for emitting to IDocumentView via event bus.
   */
  operationsWithContext?: OperationWithContext[];

  /** Timestamp when the job execution completed */
  completedAt?: string;

  /** Duration of job execution in milliseconds */
  duration?: number;

  /** Any additional metadata from the execution */
  metadata?: Record<string, any>;
};

/**
 * Enforcement the reactor performs, each off by default.
 *
 * An evaluation made while replaying is part of the document's history, so two
 * reactors that share documents and disagree on these diverge. A flag is turned
 * on for a set of reactors that sync with each other, not for one node.
 */
export type ReactorFeatureFlags = {
  /**
   * Decide whether an operation may be admitted by building a decision model
   * over the document stream, rather than reading the deleted flag from the
   * document meta cache. Deletion then takes effect from the deleting
   * operation's position rather than for the whole document.
   */
  documentDecisions: boolean;

  /**
   * Evaluate the auth policy by reading the auth scope as a second projection.
   * Requires documentDecisions.
   */
  authEnforcement: boolean;

  /**
   * Match { group } principals by folding the referenced PHGroup documents as
   * derived projections. Requires authEnforcement.
   */
  authGroups: boolean;

  /**
   * Evaluate `where` clauses and { match } principals against the executing
   * scope's state, the subject, and the action input. Requires authGroups.
   */
  authConditions: boolean;
};

/** How long a deferred job waits for its document before it fails. */
export const DEFAULT_DEFERRED_JOB_TTL_MS = 30_000;

/**
 * Configuration options for the job executor
 */
export type JobExecutorConfig = {
  /** Feature flags; anything unset is off. */
  featureFlags?: Partial<ReactorFeatureFlags>;

  /** Maximum number of conflicting operations to skip when reshuffling. */
  maxSkipThreshold?: number;

  /** Maximum number of concurrent jobs to execute */
  maxConcurrency?: number;

  /** Maximum time in milliseconds a job can run before being considered timed out */
  jobTimeoutMs?: number;

  /** How long a job whose document is missing waits for it before failing.
   *  Unbounded deferral never resolves the caller awaiting the job. */
  deferredJobTtlMs?: number;

  /** Base delay in milliseconds for exponential backoff retries */
  retryBaseDelayMs?: number;

  /** Maximum delay in milliseconds for exponential backoff retries */
  retryMaxDelayMs?: number;

  /** Maximum elapsed milliseconds before yielding to the main thread between actions.
   *  Keeps the UI responsive when processing large batches. */
  yieldDeadlineMs?: number;
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
  /**
   * Identifier of the executor that took the job. For the worker pool this is
   * the thread-worker id (e.g. "reactor-worker-3"); for the in-process simple
   * manager it is "in-process-<index>". Optional for backwards compatibility
   * with consumers built before the field was added.
   */
  workerId?: string;
};

export type JobCompletedEvent = {
  job: Job;
  result: JobResult;
  /** See {@link JobStartedEvent.workerId}. */
  workerId?: string;
};

export type JobFailedEvent = {
  job: Job;
  error: string;
  willRetry: boolean;
  retryCount: number;
  /** See {@link JobStartedEvent.workerId}. */
  workerId?: string;
};

export type ExecutorStartedEvent = {
  config: JobExecutorConfig;
  startedAt: string;
};

export type ExecutorStoppedEvent = {
  stoppedAt: string;
  graceful: boolean;
};

/**
 * Status information for the job executor manager
 */
export type ExecutorManagerStatus = {
  /** Whether the manager is currently running */
  isRunning: boolean;

  /** Number of executor instances managed */
  numExecutors: number;

  /** Number of jobs currently being processed */
  activeJobs: number;

  /** Total number of jobs processed since start */
  totalJobsProcessed: number;
};
