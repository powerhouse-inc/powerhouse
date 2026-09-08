import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
  type ReadModelBatchCompletedEvent,
  type ReadModelIndexedEvent,
  type ReadModelIndexingStage,
} from "../events/types.js";
import type {
  ILiveReadModelCoordinator,
  IReadModel,
  ReadModelRegistrationStage,
} from "../read-models/interfaces.js";
import type { ProjectionShardManager } from "./projection-shard-manager.js";

export type HybridProjectionCoordinatorOptions = {
  eventBus: IEventBus;
  logger: ILogger;
  manager: ProjectionShardManager;
  /** Caller and factory registered models. Never documentView/documentIndexer. */
  preReady: IReadModel[];
  /** subscriptionNotificationReadModel, processorManager. */
  postReady: IReadModel[];
  /** Included in `readModels` for getReadModel() lookup; never indexed here. */
  lookupOnly: IReadModel[];
};

/** Host-side stages on a per-queueKey chain driven by the worker's read-ready. */
export class HybridProjectionCoordinator implements ILiveReadModelCoordinator {
  /** One array, mutated in place: reactor-api captures it by reference once. */
  readonly readModels: IReadModel[];

  private readonly eventBus: IEventBus;
  private readonly logger: ILogger;
  private readonly manager: ProjectionShardManager;
  private readonly preReady: IReadModel[];
  private readonly postReady: IReadModel[];
  private readonly chains = new Map<string, Promise<void>>();

  constructor(options: HybridProjectionCoordinatorOptions) {
    this.eventBus = options.eventBus;
    this.logger = options.logger;
    this.manager = options.manager;
    this.preReady = options.preReady;
    this.postReady = options.postReady;
    this.readModels = [
      ...options.preReady,
      ...options.postReady,
      ...options.lookupOnly,
    ];
  }

  start(): void {
    this.manager.start();
  }

  stop(): void {
    this.manager.stop();
  }

  /** Wired as `onReadReady`; host trackers are already advanced (port FIFO). */
  acceptReadReady(event: JobReadReadyEvent): void {
    if (event.operations.length === 0) {
      void this.manager
        .emitReadReady(event)
        .catch((err: unknown) =>
          this.logger.error(
            "JOB_READ_READY emit failed for job @jobId: @Error",
            { jobId: event.jobId },
            err,
          ),
        );
      return;
    }

    const enqueuedAt = performance.now();
    const key = this.queueKeyFor(event);
    const previous = this.chains.get(key) ?? Promise.resolve();
    const current = previous.then(() => this.runHostChain(event, enqueuedAt));

    this.chains.set(key, current);
    void current.finally(() => {
      if (this.chains.get(key) === current) {
        this.chains.delete(key);
      }
    });
  }

  addReadModel(readModel: IReadModel, stage: ReadModelRegistrationStage): void {
    if (this.readModels.some(({ name }) => name === readModel.name)) {
      throw new Error(`Read model "${readModel.name}" is already registered`);
    }

    if (stage === "pre_ready") {
      this.preReady.push(readModel);
    } else {
      this.postReady.push(readModel);
    }
    this.readModels.push(readModel);
  }

  getChainDepth(): number {
    return this.manager.getChainDepth() + this.chains.size;
  }

  /** Worker chains flush first, so every relayed read-ready is in `chains`. */
  async drain(): Promise<void> {
    await this.manager.drain();
    while (this.chains.size > 0) {
      const pending = Array.from(this.chains.values());
      await Promise.allSettled(pending);
    }
  }

  /** Builder shutdown hook; reaches `manager.shutdown()` even when drain fails. */
  async shutdown(): Promise<void> {
    try {
      await this.drain();
    } catch (error) {
      this.logger.warn(
        "hybrid coordinator drain failed during shutdown: @Error",
        error,
      );
    }
    await this.manager.shutdown();
  }

  private async runHostChain(
    event: JobReadReadyEvent,
    enqueuedAt: number,
  ): Promise<void> {
    const chainWaitDurationMs = performance.now() - enqueuedAt;
    const preReadyStart = performance.now();
    // A failing host read model must not withhold JOB_READ_READY from awaiters.
    try {
      await Promise.all(
        this.preReady.map((readModel) =>
          this.indexWithTiming(readModel, "pre_ready", event),
        ),
      );
    } catch (error) {
      this.logger.error(
        "Host pre-ready read model indexing failed for job @jobId: @Error",
        { jobId: event.jobId },
        error,
      );
    }

    const preReadyDurationMs = performance.now() - preReadyStart;

    // Awaited: the subscription read model must run after READ_READY is emitted.
    const emitStart = performance.now();
    try {
      await this.manager.emitReadReady(event);
    } catch (error) {
      this.logger.error(
        "JOB_READ_READY emit failed for job @jobId: @Error",
        { jobId: event.jobId },
        error,
      );
    }
    const emitDurationMs = performance.now() - emitStart;

    const postReadyStart = performance.now();
    try {
      await Promise.all(
        this.postReady.map((readModel) =>
          this.indexWithTiming(readModel, "post_ready", event),
        ),
      );
    } catch (error) {
      this.logger.error(
        "Host post-ready read model indexing failed for job @jobId: @Error",
        { jobId: event.jobId },
        error,
      );
    }
    const postReadyDurationMs = performance.now() - postReadyStart;

    // The worker reports its own batch for this job, covering the built-in
    // read models only. Without this second report the host's stages — every
    // read model the hybrid coordinator exists to keep on the host — are
    // absent from the batch metrics, which is exactly what a rollout measures.
    this.emitBatchCompleted({
      jobId: event.jobId,
      batchSize: event.operations.length,
      chainWaitDurationMs,
      preReadyDurationMs,
      emitDurationMs,
      postReadyDurationMs,
    });
  }

  private async indexWithTiming(
    readModel: IReadModel,
    stage: ReadModelIndexingStage,
    event: JobReadReadyEvent,
  ): Promise<void> {
    const start = performance.now();
    let success = false;
    try {
      await readModel.indexOperations(event.operations);
      success = true;
    } finally {
      this.emitReadModelIndexed({
        jobId: event.jobId,
        readModelName: readModel.name,
        stage,
        durationMs: performance.now() - start,
        operationCount: event.operations.length,
        success,
      });
    }
  }

  private emitBatchCompleted(payload: ReadModelBatchCompletedEvent): void {
    void this.eventBus
      .emit(ReactorEventTypes.READMODEL_BATCH_COMPLETED, payload)
      .catch((err: unknown) =>
        this.logger.error(
          "READMODEL_BATCH_COMPLETED emit failed for job @jobId: @Error",
          { jobId: payload.jobId },
          err,
        ),
      );
  }

  private emitReadModelIndexed(payload: ReadModelIndexedEvent): void {
    void this.eventBus
      .emit(ReactorEventTypes.READMODEL_INDEXED, payload)
      .catch((err: unknown) =>
        this.logger.error(
          "READMODEL_INDEXED emit failed for job @jobId: @Error",
          { jobId: payload.jobId },
          err,
        ),
      );
  }

  private queueKeyFor(event: JobReadReadyEvent): string {
    const ctx = event.operations[0]!.context;
    return `${ctx.documentId}:${ctx.scope}:${ctx.branch}`;
  }
}
