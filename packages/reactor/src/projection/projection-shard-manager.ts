import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { childLogger, type ILogger } from "document-model";
import { randomUUID } from "node:crypto";
import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
  type JobWriteReadyEvent,
  type ReadModelBatchCompletedEvent,
  type ReadModelIndexedEvent,
  type Unsubscribe,
} from "../events/types.js";
import type {
  IReadModel,
  IReadModelCoordinator,
} from "../read-models/interfaces.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type { ConsistencyCoordinate } from "../shared/types.js";
import type { ForwardingPoolInstrumentation } from "../storage/pool-instrumentation.js";
import type {
  BuiltInReadModelKind,
  ChainDepthReport,
  DbConfig,
  ModelManifestEntry,
  ProjectionDrainedMessage,
  ProjectionInitMessage,
  ProjectionParentMessage,
  ProjectionPoolAcquireSamplesMessage,
  ProjectionReadModelIndexedMessage,
  ProjectionWorkerMessage,
} from "./protocol.js";
import type { IProjectionTransport } from "./transport.js";

const DEFAULT_INIT_TIMEOUT_MS = 30_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;
const DEFAULT_CHAIN_DEPTH_REPORT_INTERVAL_MS = 250;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function bucketFor(documentId: string, numWorkers: number): number {
  if (numWorkers < 1) {
    throw new Error(`bucketFor: numWorkers must be >= 1 (got ${numWorkers})`);
  }
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < documentId.length; i++) {
    hash ^= documentId.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0) % numWorkers;
}

/**
 * Maps operations to the coordinates a consistency tracker is keyed by.
 * Same shape `BaseReadModel.updateConsistencyTracker` produces in-process.
 */
function toConsistencyCoordinates(
  operations: OperationWithContext[],
): ConsistencyCoordinate[] {
  const coordinates: ConsistencyCoordinate[] = [];
  for (let i = 0; i < operations.length; i++) {
    const item = operations[i]!;
    coordinates.push({
      documentId: item.context.documentId,
      scope: item.context.scope,
      branch: item.context.branch,
      operationIndex: item.operation.index,
    });
  }
  return coordinates;
}

/**
 * Factory that builds one projection-worker transport. Mirrors
 * `WorkerFactory` from the executor pool: lets tests inject fake
 * transports without spawning real worker threads.
 */
export type ProjectionWorkerFactory = (
  shardIndex: number,
  shardId: string,
) => IProjectionTransport;

export type ProjectionShardManagerConfig = {
  shardCount: number;
  db: DbConfig;
  models: ModelManifestEntry[];
  preReadyKinds: BuiltInReadModelKind[];
  postReadyKinds: BuiltInReadModelKind[];
  factory: ProjectionWorkerFactory;
  logger: ILogger;
  hostBus: IEventBus;
  initTimeoutMs?: number;
  shutdownGraceMs?: number;
  drainTimeoutMs?: number;
  chainDepthReportIntervalMs?: number;
  /**
   * Host-side forwarding instrumentations indexed by shard index. The
   * manager routes each shard's `pool-acquire-samples` message to the
   * matching forwarder so the host's OpenTelemetry instrumentation records
   * acquire-wait latencies as if each shard's pg.Pool were local.
   */
  poolInstrumentations?: ForwardingPoolInstrumentation[];
  /**
   * The host's consistency trackers for the built-in read models the shards
   * run, keyed by kind. The keys double as read-model names (see
   * `DOCUMENT_VIEW_READ_MODEL` / `DOCUMENT_INDEXER_READ_MODEL` in
   * `read-models/names.js`), which is how a relayed `readmodel-indexed`
   * message is matched to a tracker.
   *
   * The host's copies of these read models are never fed an operation under
   * sharding, so without this every read carrying a consistency token waits
   * on a tracker that can never advance — `ConsistencyTracker.waitFor` arms
   * no timer when `timeoutMs` is undefined, which is what every
   * `document-view` call site passes. The worker committed those rows to the
   * same tables the host reads from, so advancing here is exact, not a fudge.
   */
  consistencyTrackers?: Partial<
    Record<BuiltInReadModelKind, IConsistencyTracker>
  >;
  /**
   * Fired when a shard errors, when it exits after having been ready, and
   * for every JOB_WRITE_READY dropped because its shard is not ready.
   *
   * There is no respawn path: once a shard stops being ready it never
   * projects again, so buffering the dropped work would only grow without
   * bound. A host that cares wires this to its shutdown path, so the process
   * restarts and each read model catches up from `ViewState.lastOrdinal` in
   * `BaseReadModel.init`. May fire repeatedly — handlers must be idempotent.
   */
  onShardFatal?: (shardId: string, reason: Error) => void;
};

type ShardState = {
  shardIndex: number;
  shardId: string;
  transport: IProjectionTransport;
  ready: boolean;
  lastDepth: number;
  lastDepthAt: number;
  poolInstrumentation?: ForwardingPoolInstrumentation;
  /**
   * Consistency coordinates of the jobs this shard is still projecting,
   * keyed by jobId. Relayed `readmodel-indexed` messages carry only a count,
   * so the host keeps the coordinates here to advance its trackers from
   * them; the operations themselves are not retained. Empty unless
   * `consistencyTrackers` is configured; entries live from dispatch to
   * `readmodel-batch-completed`, and are dropped when the shard exits.
   */
  pendingCoordinates: Map<string, ConsistencyCoordinate[]>;
  onMessage: (msg: ProjectionWorkerMessage) => void;
  onError: (err: Error) => void;
  onExit: (code: number) => void;
};

type PendingDrain = {
  resolve: () => void;
  reject: (err: Error) => void;
  remaining: Set<string>;
  timer: NodeJS.Timeout;
};

/**
 * Host-side coordinator for N sharded projection workers.
 *
 * Implements {@link IReadModelCoordinator} so it slots into the same
 * `readModelCoordinator` field on the reactor module as the in-process
 * {@link ReadModelCoordinator}. The host subscribes to JOB_WRITE_READY
 * exactly once; events are routed to a single shard by
 * `bucketFor(documentId, shardCount)`. Each worker maintains the
 * per-queueKey serial chain locally and forwards JOB_READ_READY and
 * READMODEL_* events back to the host for the rest of the reactor (sync
 * manager, awaiters, observers) to consume on the host bus.
 *
 * @see Sharded projection workers sub-feature brief
 *   (Powerhouse board wiki id: eb26f01f-8f68-4918-a6f6-ac7a4679b533)
 */
export class ProjectionShardManager implements IReadModelCoordinator {
  readonly readModels: IReadModel[] = [];

  private readonly config: ProjectionShardManagerConfig;
  private readonly logger: ILogger;
  private readonly hostBus: IEventBus;
  private readonly shards: ShardState[] = [];
  private readonly initPromises = new Map<
    string,
    { resolve: () => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private readonly pendingDrains = new Map<string, PendingDrain>();
  private readonly trackersByReadModelName = new Map<
    string,
    IConsistencyTracker
  >();
  private hostSubscription?: Unsubscribe;
  private isRunning = false;
  private started = false;
  private isShuttingDown = false;

  constructor(config: ProjectionShardManagerConfig) {
    if (config.shardCount < 1) {
      throw new Error(
        `ProjectionShardManager: shardCount must be >= 1 (got ${config.shardCount})`,
      );
    }
    this.config = config;
    this.logger = childLogger(["reactor", "projection-shard-manager"]);
    this.hostBus = config.hostBus;
    const trackers = config.consistencyTrackers ?? {};
    for (const kind of Object.keys(trackers) as BuiltInReadModelKind[]) {
      const tracker = trackers[kind];
      if (tracker) {
        this.trackersByReadModelName.set(kind, tracker);
      }
    }
  }

  async startup(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    const initTimeoutMs = this.config.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
    const reportIntervalMs =
      this.config.chainDepthReportIntervalMs ??
      DEFAULT_CHAIN_DEPTH_REPORT_INTERVAL_MS;

    const initPromises: Promise<void>[] = [];
    for (let i = 0; i < this.config.shardCount; i++) {
      const shardId = `projection-shard-${i}`;
      const transport = this.config.factory(i, shardId);
      const state: ShardState = {
        shardIndex: i,
        shardId,
        transport,
        ready: false,
        lastDepth: 0,
        lastDepthAt: 0,
        poolInstrumentation: this.config.poolInstrumentations?.[i],
        pendingCoordinates: new Map(),
        onMessage: (msg) => this.handleWorkerMessage(state, msg),
        onError: (err) => this.handleTransportError(state, err),
        onExit: (code) => this.handleTransportExit(state, code),
      };
      transport.on("message", state.onMessage);
      transport.on("error", state.onError);
      transport.on("exit", state.onExit);
      this.shards.push(state);

      const correlationId = randomUUID();
      const initPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.initPromises.delete(correlationId);
          reject(
            new Error(
              `projection shard ${shardId} did not become ready within ${initTimeoutMs}ms`,
            ),
          );
        }, initTimeoutMs);
        this.initPromises.set(correlationId, { resolve, reject, timer });
      });

      const init: ProjectionInitMessage = {
        type: "init",
        correlationId,
        shardId,
        shardIndex: i,
        shardCount: this.config.shardCount,
        db: this.config.db,
        models: this.config.models,
        preReadyKinds: this.config.preReadyKinds,
        postReadyKinds: this.config.postReadyKinds,
        chainDepthReportIntervalMs: reportIntervalMs,
      };
      transport.postMessage(init);
      initPromises.push(initPromise);
    }

    await Promise.all(initPromises);
    this.logger.info(
      "projection shard manager ready: @count shards",
      this.shards.length,
    );
  }

  start(): void {
    if (this.isRunning) {
      return;
    }
    this.hostSubscription = this.hostBus.subscribe(
      ReactorEventTypes.JOB_WRITE_READY,
      (_t: number, event: JobWriteReadyEvent) => {
        this.routeWriteReady(event);
      },
    );
    this.isRunning = true;
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }
    if (this.hostSubscription) {
      this.hostSubscription();
      this.hostSubscription = undefined;
    }
    this.isRunning = false;
  }

  async drain(): Promise<void> {
    if (this.shards.length === 0) {
      return;
    }
    const drainTimeoutMs =
      this.config.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
    const correlationId = randomUUID();
    const remaining = new Set(this.shards.map((s) => s.shardId));
    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingDrains.delete(correlationId);
        reject(
          new Error(
            `projection shards did not drain within ${drainTimeoutMs}ms (remaining: ${[
              ...remaining,
            ].join(", ")})`,
          ),
        );
      }, drainTimeoutMs);
      this.pendingDrains.set(correlationId, {
        resolve,
        reject,
        remaining,
        timer,
      });
    });
    for (const shard of this.shards) {
      shard.transport.postMessage({ type: "drain", correlationId });
    }
    await promise;
  }

  getChainDepth(): number {
    let total = 0;
    for (const shard of this.shards) {
      total += shard.lastDepth;
    }
    return total;
  }

  getShardDepths(): ChainDepthReport[] {
    return this.shards.map((shard) => ({
      shardId: shard.shardId,
      depth: shard.lastDepth,
      timestamp: shard.lastDepthAt,
    }));
  }

  async shutdown(): Promise<void> {
    // Workers exit as a consequence of this call, so their `exit` events are
    // expected from here on and must not be reported as fatal.
    this.isShuttingDown = true;
    this.stop();
    const graceMs = this.config.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;
    const correlationId = randomUUID();
    for (const shard of this.shards) {
      try {
        const msg: ProjectionParentMessage = {
          type: "shutdown",
          correlationId,
          graceMs,
        };
        shard.transport.postMessage(msg);
      } catch (err) {
        this.logger.warn(
          "projection shard postMessage(shutdown) failed for @shardId: @error",
          shard.shardId,
          err,
        );
      }
    }
    const terminationDeadline = Date.now() + graceMs;
    while (
      this.shards.some((s) => s.ready) &&
      Date.now() < terminationDeadline
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    for (const shard of this.shards) {
      try {
        await shard.transport.terminate();
      } catch (err) {
        this.logger.warn(
          "projection shard terminate failed for @shardId: @error",
          shard.shardId,
          err,
        );
      }
      shard.transport.off("message", shard.onMessage);
      shard.transport.off("error", shard.onError);
      shard.transport.off("exit", shard.onExit);
    }
    this.shards.length = 0;
  }

  private routeWriteReady(event: JobWriteReadyEvent): void {
    if (event.operations.length === 0) {
      // No shard can be selected (there is no documentId) and no read model
      // has work to do, but JOB_READ_READY is the job's terminal signal:
      // InMemoryJobTracker and every JobAwaiter hang without it. Mirrors
      // ReadModelCoordinator.emitEmptyReadReady.
      this.relayReadReady({ jobId: event.jobId, operations: [] });
      this.relayBatchCompleted({
        jobId: event.jobId,
        batchSize: 0,
        chainWaitDurationMs: 0,
        preReadyDurationMs: 0,
        emitDurationMs: 0,
        postReadyDurationMs: 0,
      });
      return;
    }
    const documentId = event.operations[0]!.context.documentId;
    const index = bucketFor(documentId, this.shards.length);
    const shard = this.shards[index]!;
    if (!shard.ready) {
      this.dropWriteReady(shard, event, documentId);
      return;
    }
    if (this.trackersByReadModelName.size > 0) {
      shard.pendingCoordinates.set(
        event.jobId,
        toConsistencyCoordinates(event.operations),
      );
    }
    shard.transport.postMessage({
      type: "write-ready",
      jobId: event.jobId,
      operations: event.operations,
      jobMeta: event.jobMeta,
      collectionMemberships: event.collectionMemberships,
    });
  }

  /**
   * A shard stops being ready only when it dies, and nothing respawns it, so
   * this job's projection is genuinely lost. Buffering would grow without
   * bound behind a shard that never comes back, so the batch is dropped —
   * loudly, naming the job and document, and through `onShardFatal` so a host
   * can restart rather than serve stale read models.
   *
   * JOB_FAILED is deliberately not emitted: every other emitter uses it for a
   * job whose operations were *not* written (see
   * `executor/job-result-handler.ts`), and these were written and are
   * durable. Marking the job FAILED would invite the caller to re-submit a
   * write that already landed.
   */
  private dropWriteReady(
    shard: ShardState,
    event: JobWriteReadyEvent,
    documentId: string,
  ): void {
    const reason = new Error(
      `projection shard ${shard.shardId} is not ready: JOB_WRITE_READY for job ${event.jobId} ` +
        `(document ${documentId}, ${event.operations.length} operation(s)) was dropped and will ` +
        `never be projected; the operations are written and durable, but this shard's read models ` +
        `are now behind`,
    );
    this.logger.error(
      "dropping JOB_WRITE_READY for job @jobId on shard @shardId: @error",
      event.jobId,
      shard.shardId,
      reason,
    );
    this.config.onShardFatal?.(shard.shardId, reason);
  }

  private handleWorkerMessage(
    shard: ShardState,
    msg: ProjectionWorkerMessage,
  ): void {
    switch (msg.type) {
      case "ready":
        this.handleReady(shard, msg.correlationId);
        return;
      case "read-ready":
        this.relayReadReady({
          jobId: msg.jobId,
          operations: msg.operations,
        });
        return;
      case "readmodel-indexed":
        this.advanceConsistencyTrackers(shard, msg);
        this.relayReadModelIndexed({
          jobId: msg.jobId,
          readModelName: msg.readModelName,
          stage: msg.stage,
          durationMs: msg.durationMs,
          operationCount: msg.operationCount,
          success: msg.success,
        });
        return;
      case "readmodel-batch-completed":
        shard.pendingCoordinates.delete(msg.jobId);
        this.relayBatchCompleted({
          jobId: msg.jobId,
          batchSize: msg.batchSize,
          chainWaitDurationMs: msg.chainWaitDurationMs,
          preReadyDurationMs: msg.preReadyDurationMs,
          emitDurationMs: msg.emitDurationMs,
          postReadyDurationMs: msg.postReadyDurationMs,
        });
        return;
      case "chain-depth":
        shard.lastDepth = msg.depth;
        shard.lastDepthAt = msg.timestamp;
        return;
      case "pool-acquire-samples":
        this.handlePoolAcquireSamples(shard, msg);
        return;
      case "drained":
        this.handleDrained(msg);
        return;
      case "log":
        this.handleLog(shard, msg);
        return;
      default: {
        const exhaustive: never = msg;
        void exhaustive;
        return;
      }
    }
  }

  /**
   * Advances the host's tracker for the read model the shard just indexed.
   *
   * The shard writes to the same tables the host reads, so once it reports a
   * successful index the host's read path really is consistent to those
   * coordinates. Gated on `success` for parity with
   * `BaseReadModel.indexOperations`, which updates its tracker only after
   * `commitOperations` returns. The worker posts this before its
   * JOB_READ_READY, matching the in-process ordering.
   */
  private advanceConsistencyTrackers(
    shard: ShardState,
    msg: ProjectionReadModelIndexedMessage,
  ): void {
    if (!msg.success) {
      return;
    }
    const tracker = this.trackersByReadModelName.get(msg.readModelName);
    if (!tracker) {
      return;
    }
    const coordinates = shard.pendingCoordinates.get(msg.jobId);
    if (!coordinates || coordinates.length === 0) {
      return;
    }
    tracker.update(coordinates);
  }

  private handlePoolAcquireSamples(
    shard: ShardState,
    msg: ProjectionPoolAcquireSamplesMessage,
  ): void {
    if (!shard.poolInstrumentation) {
      return;
    }
    shard.poolInstrumentation.updateStats({
      size: msg.size,
      idle: msg.idle,
      waiting: msg.waiting,
    });
    shard.poolInstrumentation.pushSamples(msg.durations);
  }

  private handleReady(shard: ShardState, correlationId: string): void {
    shard.ready = true;
    const pending = this.initPromises.get(correlationId);
    if (!pending) {
      return;
    }
    this.initPromises.delete(correlationId);
    clearTimeout(pending.timer);
    pending.resolve();
  }

  private handleDrained(msg: ProjectionDrainedMessage): void {
    const pending = this.pendingDrains.get(msg.correlationId);
    if (!pending) {
      return;
    }
    pending.remaining.delete(msg.shardId);
    if (pending.remaining.size === 0) {
      this.pendingDrains.delete(msg.correlationId);
      clearTimeout(pending.timer);
      pending.resolve();
    }
  }

  private handleLog(
    shard: ShardState,
    msg: Extract<ProjectionWorkerMessage, { type: "log" }>,
  ): void {
    switch (msg.level) {
      case "debug":
        this.logger.debug(msg.message, ...msg.args);
        return;
      case "info":
        this.logger.info(msg.message, ...msg.args);
        return;
      case "warn":
        this.logger.warn(msg.message, ...msg.args);
        return;
      case "error":
        this.logger.error(msg.message, ...msg.args);
        return;
      default: {
        const exhaustive: never = msg.level;
        void exhaustive;
      }
    }
    void shard;
  }

  private handleTransportError(shard: ShardState, err: Error): void {
    this.logger.error(
      "projection shard transport error @shardId: @error",
      shard.shardId,
      err,
    );
    if (!this.isShuttingDown) {
      this.config.onShardFatal?.(shard.shardId, err);
    }
  }

  private handleTransportExit(shard: ShardState, code: number): void {
    const wasReady = shard.ready;
    shard.ready = false;
    // Nothing respawns the shard, so every job it had in flight is lost with
    // it. Release them rather than pin their operations for the process's
    // remaining life.
    const abandoned = [...shard.pendingCoordinates.keys()];
    shard.pendingCoordinates.clear();
    if (!wasReady || this.isShuttingDown) {
      return;
    }
    this.logger.error(
      "projection shard exited unexpectedly @shardId code=@code, abandoning @count in-flight job(s): @jobIds",
      shard.shardId,
      code,
      abandoned.length,
      abandoned.join(", "),
    );
    this.config.onShardFatal?.(
      shard.shardId,
      new Error(
        `projection shard ${shard.shardId} exited with code ${code}; ` +
          `${abandoned.length} in-flight job(s) will never be projected` +
          (abandoned.length > 0 ? `: ${abandoned.join(", ")}` : ""),
      ),
    );
  }

  private relayReadReady(event: JobReadReadyEvent): void {
    void this.hostBus
      .emit(ReactorEventTypes.JOB_READ_READY, event)
      .catch((err: unknown) =>
        this.logger.error(
          "host JOB_READ_READY emit failed for job @jobId: @error",
          event.jobId,
          err,
        ),
      );
  }

  private relayReadModelIndexed(event: ReadModelIndexedEvent): void {
    void this.hostBus
      .emit(ReactorEventTypes.READMODEL_INDEXED, event)
      .catch((err: unknown) =>
        this.logger.error(
          "host READMODEL_INDEXED emit failed for job @jobId: @error",
          event.jobId,
          err,
        ),
      );
  }

  private relayBatchCompleted(event: ReadModelBatchCompletedEvent): void {
    void this.hostBus
      .emit(ReactorEventTypes.READMODEL_BATCH_COMPLETED, event)
      .catch((err: unknown) =>
        this.logger.error(
          "host READMODEL_BATCH_COMPLETED emit failed for job @jobId: @error",
          event.jobId,
          err,
        ),
      );
  }
}
