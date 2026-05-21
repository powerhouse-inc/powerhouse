import { childLogger, type ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
  type JobWriteReadyEvent,
  type ReadModelBatchCompletedEvent,
  type ReadModelIndexedEvent,
  type ReadModelIndexingStage,
  type Unsubscribe,
} from "../events/types.js";
import type { IReadModel, IReadModelCoordinator } from "./interfaces.js";

/**
 * Coordinates read model synchronization by listening to operation write events
 * and updating all registered read models on per-`documentId:scope:branch`
 * serial chains. Cross-key projection runs in parallel; same-key projection is
 * serialized so the executor can return to dispatch without holding ordering
 * implicitly.
 */
export class ReadModelCoordinator implements IReadModelCoordinator {
  private unsubscribe?: Unsubscribe;
  private isRunning = false;
  private readonly chains = new Map<string, Promise<void>>();
  private readonly logger: ILogger;

  readonly readModels: IReadModel[];

  constructor(
    private eventBus: IEventBus,
    public readonly preReady: IReadModel[],
    public readonly postReady: IReadModel[],
  ) {
    this.readModels = [...preReady, ...postReady];
    this.logger = childLogger(["reactor", "read-model-coordinator"]);
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.unsubscribe = this.eventBus.subscribe(
      ReactorEventTypes.JOB_WRITE_READY,
      (type, event: JobWriteReadyEvent) => {
        return this.handleWriteReady(event);
      },
    );

    this.isRunning = true;
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    this.isRunning = false;
  }

  /**
   * Resolves when every per-queueKey projection chain has flushed. Intended
   * for test fixtures and explicit shutdown; production callers use
   * consistency tokens instead.
   */
  async drain(): Promise<void> {
    while (this.chains.size > 0) {
      const pending = Array.from(this.chains.values());
      await Promise.allSettled(pending);
    }
  }

  getChainDepth(): number {
    return this.chains.size;
  }

  private handleWriteReady(event: JobWriteReadyEvent): void {
    if (event.operations.length === 0) {
      return;
    }

    const enqueuedAt = performance.now();
    const key = this.queueKeyFor(event);
    const previous = this.chains.get(key) ?? Promise.resolve();
    const current = previous.then(() => this.runChain(event, enqueuedAt));

    this.chains.set(key, current);
    void current.finally(() => {
      if (this.chains.get(key) === current) {
        this.chains.delete(key);
      }
    });
  }

  private async runChain(
    event: JobWriteReadyEvent,
    enqueuedAt: number,
  ): Promise<void> {
    const chainStartedAt = performance.now();
    const chainWaitDurationMs = chainStartedAt - enqueuedAt;

    const preReadyStart = performance.now();
    try {
      await Promise.all(
        this.preReady.map((readModel) =>
          this.indexWithTiming(readModel, "pre_ready", event),
        ),
      );
    } catch (error) {
      this.logger.error(
        "Pre-ready read model indexing failed for job @jobId: @Error",
        { jobId: event.jobId },
        error,
      );
    }
    const preReadyDurationMs = performance.now() - preReadyStart;

    const readyEvent: JobReadReadyEvent = {
      jobId: event.jobId,
      operations: event.operations,
    };
    const emitStart = performance.now();
    try {
      await this.eventBus.emit(ReactorEventTypes.JOB_READ_READY, readyEvent);
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
        "Post-ready read model indexing failed for job @jobId: @Error",
        { jobId: event.jobId },
        error,
      );
    }
    const postReadyDurationMs = performance.now() - postReadyStart;

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
    event: JobWriteReadyEvent,
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

  private queueKeyFor(event: JobWriteReadyEvent): string {
    const ctx = event.operations[0]!.context;
    return `${ctx.documentId}:${ctx.scope}:${ctx.branch}`;
  }
}
