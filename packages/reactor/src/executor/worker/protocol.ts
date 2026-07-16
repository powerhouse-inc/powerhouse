/**
 * Wire protocol type definitions for parent <-> worker IPC in the executor
 * worker pool.
 *
 * All messages in this module must be JSON-clonable (structured-cloneable):
 * no functions, no class instances, no DOM nodes, no symbols. This is a
 * hard contract enforced by `worker_threads`/`child_process` IPC.
 *
 * This file is types-only. It must not emit any runtime code.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */

import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Job } from "../../queue/types.js";
import type { JobMeta } from "../../shared/types.js";
import type { JobResult } from "../types.js";

// ---------------------------------------------------------------------------
// Sanitized values & structured-error payloads
// ---------------------------------------------------------------------------

/**
 * A JSON-clonable value safe to send across the worker IPC boundary.
 *
 * The shape mirrors the structured-clone subset used by the parent's
 * sanitizer: primitives, arrays, plain objects, plus the explicit
 * {@link ErrorInfo} shape for marshalled Errors.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type SanitizedArg =
  | null
  | boolean
  | number
  | string
  | ErrorInfo
  | SanitizedArg[]
  | { [key: string]: SanitizedArg };

/**
 * Structured representation of an Error for IPC transport.
 *
 * Class instances cannot be structured-cloned across worker boundaries,
 * so Errors are flattened into this shape on the worker side and
 * reconstructed on the parent side.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ErrorInfo = {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorInfo;
};

// ---------------------------------------------------------------------------
// Module / factory specs
// ---------------------------------------------------------------------------

/**
 * Reference to a module that the worker should `import()` at runtime,
 * along with the named export to pluck out as the factory.
 *
 * Exactly one of `packageName` or `filePath` is provided.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ModuleRef =
  | {
      /** Bare-specifier package name (resolved by the worker's module loader). */
      packageName: string;
      /** Named export within the module to invoke as the factory. */
      exportName: string;
    }
  | {
      /** Absolute or worker-resolvable file path to import. */
      filePath: string;
      /** Named export within the module to invoke as the factory. */
      exportName: string;
    };

/**
 * Factory specification shared by the signature verifier and document
 * model spec channels. The worker imports `module.exportName` and invokes
 * it with `initArgs` to obtain the actual instance.
 *
 * `initArgs` must be JSON-clonable.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type FactorySpec = {
  module: ModuleRef;
  initArgs?: SanitizedArg;
};

/**
 * Factory spec for the signature verifier the worker should instantiate.
 *
 * Structurally identical to {@link FactorySpec}; the alias exists so call
 * sites read intent-fully.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type SignatureVerifierSpec = FactorySpec;

/**
 * Factory spec for a document model module the worker should instantiate.
 *
 * Structurally identical to {@link FactorySpec}; the alias exists so call
 * sites read intent-fully.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type DocumentModelSpec = FactorySpec;

/**
 * One entry in the document model manifest the worker materializes on
 * startup (or extends lazily via `load-model`).
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ModelManifestEntry = {
  /** Document type identifier (e.g. "ph/account"). */
  documentType: string;
  /** Document model version this entry registers. */
  version: string;
  /** Factory spec the worker imports and invokes to obtain the model. */
  spec: DocumentModelSpec;
};

// ---------------------------------------------------------------------------
// Database & worker-pool configuration
// ---------------------------------------------------------------------------

/**
 * JSON-clonable Postgres connection info passed to the worker so it can
 * open its own pool. Storage-specific wiring may extend this shape in
 * later phases.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type DbConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  applicationName?: string;
  poolSize?: number;
  /**
   * Maximum time (ms) a caller will wait to acquire a connection from the
   * pool before pg.Pool throws. When omitted, pg defaults to 0 (unlimited
   * wait), which hides acquire-starvation as silent latency.
   */
  connectionTimeoutMillis?: number;
  /**
   * How long (ms) an idle connection stays open before pg closes it. When
   * omitted, pg defaults to 10000.
   */
  idleTimeoutMillis?: number;
};

/**
 * Configuration for the executor worker pool.
 *
 * Mirrors the `workerPool` sub-config on {@link JobExecutorConfig};
 * a later card wires this into the executor config.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type WorkerPoolConfig = {
  /** Whether the worker pool is active; when false the executor runs in-process. */
  enabled: boolean;
  /** Number of worker instances to spawn. */
  numWorkers: number;
  /** Worker isolation mode. */
  workerType: "thread" | "process";
  /** Optional heartbeat interval in milliseconds. */
  heartbeatMs?: number;
  /** Optional per-worker Postgres pool size override. */
  workerPgPoolSize?: number;
};

// ---------------------------------------------------------------------------
// Shared payload shapes
// ---------------------------------------------------------------------------

/**
 * Payload the worker reports back when a job's write phase is complete.
 *
 * Parent fills `collectionMemberships` at emission time, so it is
 * intentionally absent from the worker -> parent message.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type JobWriteReadyPayload = {
  operations: OperationWithContext[];
  jobMeta: JobMeta;
};

// ---------------------------------------------------------------------------
// Parent -> worker messages
// ---------------------------------------------------------------------------

/**
 * Initializes a freshly spawned worker with the configuration and
 * factories it needs to start executing jobs.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type InitMessage = {
  type: "init";
  correlationId: string;
  workerId: string;
  poolConfig: WorkerPoolConfig;
  db: DbConfig;
  /** Omitted = the worker performs no executor-side signature verification. */
  signatureVerifier?: SignatureVerifierSpec;
  models: ModelManifestEntry[];
};

/**
 * Dispatches a job to the worker for execution.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ExecuteMessage = {
  type: "execute";
  correlationId: string;
  job: Job;
};

/**
 * Requests cancellation of an in-flight job.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type AbortMessage = {
  type: "abort";
  correlationId: string;
  /** correlationId of the `execute` message being aborted. */
  targetCorrelationId: string;
  reason?: string;
};

/**
 * Asks the worker to drain in-flight work and exit.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ShutdownMessage = {
  type: "shutdown";
  correlationId: string;
  /** Optional grace period before the parent force-terminates the worker. */
  graceMs?: number;
};

/**
 * Lazily registers an additional document model on a running worker.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type LoadModelMessage = {
  type: "load-model";
  correlationId: string;
  model: ModelManifestEntry;
};

/**
 * Union of all messages the parent may send to a worker.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ParentMessage =
  | InitMessage
  | ExecuteMessage
  | AbortMessage
  | ShutdownMessage
  | LoadModelMessage;

// ---------------------------------------------------------------------------
// Worker -> parent messages
// ---------------------------------------------------------------------------

/**
 * Announces that the worker has finished `init` and is ready to accept
 * `execute` messages.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ReadyMessage = {
  type: "ready";
  /** correlationId of the originating `init` message. */
  correlationId: string;
  workerId: string;
};

/**
 * Final result for an `execute` job.
 *
 * On success, `writeReady` carries the operations and job meta the
 * parent needs to emit `JOB_WRITE_READY`. On failure, `error` is set
 * and `result.success` is false.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ResultMessage = {
  type: "result";
  /** correlationId of the originating `execute` message. */
  correlationId: string;
  result: JobResult;
  writeReady?: JobWriteReadyPayload;
  error?: ErrorInfo;
};

/**
 * Acknowledges that a `load-model` request succeeded.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ModelLoadedMessage = {
  type: "model-loaded";
  /** correlationId of the originating `load-model` message. */
  correlationId: string;
  documentType: string;
  version: string;
};

/**
 * Reports that a `load-model` request failed.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type ModelLoadFailedMessage = {
  type: "model-load-failed";
  /** correlationId of the originating `load-model` message. */
  correlationId: string;
  documentType: string;
  version: string;
  error: ErrorInfo;
};

/**
 * Forwarded log line from the worker. `args` is constrained to
 * {@link SanitizedArg} so callers cannot accidentally ship non-clonable
 * values across the boundary.
 *
 * The sanitizer in `./sanitize.ts` enforces the {@link SanitizedArg}
 * invariant on the producer side before each message is posted.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type LogMessage = {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  args: SanitizedArg[];
  /** Epoch milliseconds at which the worker generated the log line. */
  timestamp: number;
};

/**
 * Periodic liveness signal. Included now to unblock Phase-3 scaffolding;
 * the wiki marks heartbeats as a Phase-5 future extension.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type HeartbeatMessage = {
  type: "heartbeat";
  workerId: string;
  /** Epoch milliseconds the worker generated the heartbeat. */
  timestamp: number;
  /** Optional snapshot of in-flight job correlation ids. */
  inFlightCorrelationIds?: string[];
};

/**
 * Periodic counters / gauges the worker reports for observability.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type MetricsMessage = {
  type: "metrics";
  workerId: string;
  /** Epoch milliseconds the worker generated the metrics snapshot. */
  timestamp: number;
  counters: { [name: string]: number };
  gauges: { [name: string]: number };
};

/**
 * Snapshot of one worker pool's acquire-wait samples and pool-stat counters,
 * forwarded periodically so the host can re-record into the shared
 * pg.Pool histogram and observable gauges. The worker owns the real
 * pg.Pool; the host's {@link PoolInstrumentation} is a forwarder driven
 * by these messages.
 */
export type PoolAcquireSamplesMessage = {
  type: "pool-acquire-samples";
  workerId: string;
  /** Stable identifier matching the host-side instrumentation name (e.g. "worker-0"). */
  poolName: string;
  /** Epoch milliseconds the worker generated the batch. */
  timestamp: number;
  /** Acquire-wait durations (ms) accumulated since the previous batch. */
  durations: number[];
  /** Most recent pg.Pool counter snapshot at batch send time. */
  size: number;
  idle: number;
  waiting: number;
};

/**
 * Union of all messages a worker may send to the parent.
 *
 * @see Wire Protocol Reference wiki page
 *   (Powerhouse board wiki id: 64c03e51-1aa4-4fa9-93d8-daa45642484d)
 */
export type WorkerMessage =
  | ReadyMessage
  | ResultMessage
  | ModelLoadedMessage
  | ModelLoadFailedMessage
  | LogMessage
  | HeartbeatMessage
  | MetricsMessage
  | PoolAcquireSamplesMessage;
