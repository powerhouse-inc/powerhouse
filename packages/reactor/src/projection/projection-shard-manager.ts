import { childLogger, type ILogger } from "document-model";
import { randomUUID } from "node:crypto";
import { bucketFor } from "../executor/worker-pool-router.js";
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
  ProjectionWorkerMessage,
} from "./protocol.js";
import type { IProjectionTransport } from "./transport.js";

const DEFAULT_INIT_TIMEOUT_MS = 30_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;
const DEFAULT_CHAIN_DEPTH_REPORT_INTERVAL_MS = 250;

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
};

type ShardState = {
  shardIndex: number;
  shardId: string;
  transport: IProjectionTransport;
  ready: boolean;
  lastDepth: number;
  lastDepthAt: number;
  poolInstrumentation?: ForwardingPoolInstrumentation;
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
  private hostSubscription?: Unsubscribe;
  private isRunning = false;
  private started = false;

  constructor(config: ProjectionShardManagerConfig) {
    if (config.shardCount < 1) {
      throw new Error(
        `ProjectionShardManager: shardCount must be >= 1 (got ${config.shardCount})`,
      );
    }
    this.config = config;
    this.logger = childLogger(["reactor", "projection-shard-manager"]);
    this.hostBus = config.hostBus;
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
      return;
    }
    const documentId = event.operations[0]!.context.documentId;
    const index = bucketFor(documentId, this.shards.length);
    const shard = this.shards[index]!;
    if (!shard.ready) {
      this.logger.warn(
        "dropping JOB_WRITE_READY: shard @index not ready",
        index,
      );
      return;
    }
    shard.transport.postMessage({
      type: "write-ready",
      jobId: event.jobId,
      operations: event.operations,
      jobMeta: event.jobMeta,
      collectionMemberships: event.collectionMemberships,
    });
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
  }

  private handleTransportExit(shard: ShardState, code: number): void {
    if (shard.ready) {
      this.logger.warn(
        "projection shard exited unexpectedly @shardId code=@code",
        shard.shardId,
        code,
      );
    }
    shard.ready = false;
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
