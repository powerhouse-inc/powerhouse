/**
 * Wire protocol type definitions for parent <-> projection-worker IPC.
 *
 * All messages in this module must be JSON-clonable (structured-cloneable):
 * no functions, no class instances, no DOM nodes, no symbols.
 *
 * This file is types-only. It must not emit any runtime code.
 *
 * @see Sharded projection workers sub-feature brief
 *   (Powerhouse board wiki id: eb26f01f-8f68-4918-a6f6-ac7a4679b533)
 */

import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  DbConfig,
  ModelManifestEntry,
  SanitizedArg,
} from "../executor/worker/protocol.js";
import type {
  ReadModelIndexingStage,
  ReadModelStage,
} from "../events/types.js";
import type { JobMeta } from "../shared/types.js";

export type { DbConfig, ModelManifestEntry };

/**
 * Identifier for a built-in read model the projection worker materializes
 * on init. The host names which models each shard should run; the worker
 * constructs them itself against its local Kysely instance.
 */
export type BuiltInReadModelKind = "document-view" | "document-indexer";

/**
 * Snapshot of one shard's in-flight chain depth. Reported periodically by
 * each worker so the host {@link ProjectionShardManager} can aggregate
 * `IReadModelCoordinator.getChainDepth()`.
 */
export type ChainDepthReport = {
  shardId: string;
  depth: number;
  timestamp: number;
};

/**
 * Initializes a freshly spawned projection worker. The worker uses
 * `db` to open its own pg.Pool + Kysely, loads `models` into a local
 * `DocumentModelRegistry`, materializes each `readModelKinds` entry as a
 * concrete read model bound to the local DB, and starts a local
 * `ReadModelCoordinator` that consumes the JOB_WRITE_READY relays.
 */
export type ProjectionInitMessage = {
  type: "init";
  correlationId: string;
  shardId: string;
  shardIndex: number;
  shardCount: number;
  db: DbConfig;
  models: ModelManifestEntry[];
  preReadyKinds: BuiltInReadModelKind[];
  postReadyKinds: BuiltInReadModelKind[];
  chainDepthReportIntervalMs: number;
};

/**
 * Relays a JOB_WRITE_READY event from the host bus into the worker's
 * local bus, where the in-worker `ReadModelCoordinator` picks it up.
 *
 * The host fans messages to shards via `bucketFor(documentId, shardCount)`
 * — the worker does not re-hash and assumes the message landed on it
 * because the host already chose this shard.
 */
export type ProjectionWriteReadyMessage = {
  type: "write-ready";
  jobId: string;
  operations: OperationWithContext[];
  jobMeta: JobMeta;
  collectionMemberships?: Record<string, string[]>;
};

/**
 * Asks the worker to drain its in-flight chains and respond with
 * {@link ProjectionDrainedMessage}.
 */
export type ProjectionDrainMessage = {
  type: "drain";
  correlationId: string;
};

/**
 * Asks the worker to drain in-flight work, close its DB pool, and exit.
 */
export type ProjectionShutdownMessage = {
  type: "shutdown";
  correlationId: string;
  graceMs?: number;
};

export type ProjectionParentMessage =
  | ProjectionInitMessage
  | ProjectionWriteReadyMessage
  | ProjectionDrainMessage
  | ProjectionShutdownMessage;

/**
 * Announces that the worker has finished `init` and is ready to accept
 * `write-ready` relays.
 */
export type ProjectionReadyMessage = {
  type: "ready";
  correlationId: string;
  shardId: string;
};

/**
 * Forwarded JOB_READ_READY event from the worker's local bus. The host
 * re-emits this on the host bus so observers (sync manager, awaiters,
 * tests) see it exactly once per job.
 */
export type ProjectionReadReadyMessage = {
  type: "read-ready";
  shardId: string;
  jobId: string;
  operations: OperationWithContext[];
};

/**
 * Forwarded READMODEL_INDEXED event from the worker's local bus.
 */
export type ProjectionReadModelIndexedMessage = {
  type: "readmodel-indexed";
  shardId: string;
  jobId: string;
  readModelName: string;
  stage: ReadModelIndexingStage;
  durationMs: number;
  operationCount: number;
  success: boolean;
};

/**
 * Forwarded READMODEL_BATCH_COMPLETED event from the worker's local bus.
 */
export type ProjectionBatchCompletedMessage = {
  type: "readmodel-batch-completed";
  shardId: string;
  jobId: string;
  batchSize: number;
  chainWaitDurationMs: number;
  preReadyDurationMs: number;
  emitDurationMs: number;
  postReadyDurationMs: number;
};

/**
 * Periodic chain-depth report. Workers post this on a fixed cadence so
 * the host can aggregate per-shard depths without polling.
 */
export type ProjectionChainDepthMessage = {
  type: "chain-depth";
  shardId: string;
  depth: number;
  timestamp: number;
};

/**
 * Snapshot of one shard's pg.Pool acquire-wait samples and pool-stat
 * counters. The shard owns its real pg.Pool; the host's
 * {@link PoolInstrumentation} is a forwarder driven by these messages.
 */
export type ProjectionPoolAcquireSamplesMessage = {
  type: "pool-acquire-samples";
  shardId: string;
  /** Stable identifier matching the host-side instrumentation name. */
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
 * Acknowledges that a `drain` request has flushed all in-flight chains.
 */
export type ProjectionDrainedMessage = {
  type: "drained";
  correlationId: string;
  shardId: string;
};

/**
 * Forwarded log line from the worker. Mirrors the executor worker's
 * sanitized log envelope so callers can route both through the same
 * host-side logger.
 */
export type ProjectionLogMessage = {
  type: "log";
  shardId: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  args: SanitizedArg[];
  timestamp: number;
};

export type ProjectionWorkerMessage =
  | ProjectionReadyMessage
  | ProjectionReadReadyMessage
  | ProjectionReadModelIndexedMessage
  | ProjectionBatchCompletedMessage
  | ProjectionChainDepthMessage
  | ProjectionPoolAcquireSamplesMessage
  | ProjectionDrainedMessage
  | ProjectionLogMessage;

/**
 * Stage tag carried on a few host-side metrics so an operator can attribute
 * a long batch to a specific shard. Mirrors {@link ReadModelStage} to keep
 * dashboard joins straightforward.
 */
export type ProjectionStage = ReadModelStage;
