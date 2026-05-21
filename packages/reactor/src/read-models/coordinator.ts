import { childLogger, type ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
  type JobWriteReadyEvent,
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

    const key = this.queueKeyFor(event);
    const previous = this.chains.get(key) ?? Promise.resolve();
    const current = previous.then(() => this.runChain(event));

    this.chains.set(key, current);
    void current.finally(() => {
      if (this.chains.get(key) === current) {
        this.chains.delete(key);
      }
    });
  }

  private async runChain(event: JobWriteReadyEvent): Promise<void> {
    try {
      await Promise.all(
        this.preReady.map((readModel) =>
          readModel.indexOperations(event.operations),
        ),
      );
    } catch (error) {
      this.logger.error(
        "Pre-ready read model indexing failed for job @jobId: @Error",
        { jobId: event.jobId },
        error,
      );
    }

    const readyEvent: JobReadReadyEvent = {
      jobId: event.jobId,
      operations: event.operations,
    };
    try {
      await this.eventBus.emit(ReactorEventTypes.JOB_READ_READY, readyEvent);
    } catch (error) {
      this.logger.error(
        "JOB_READ_READY emit failed for job @jobId: @Error",
        { jobId: event.jobId },
        error,
      );
    }

    try {
      await Promise.all(
        this.postReady.map((readModel) =>
          readModel.indexOperations(event.operations),
        ),
      );
    } catch (error) {
      this.logger.error(
        "Post-ready read model indexing failed for job @jobId: @Error",
        { jobId: event.jobId },
        error,
      );
    }
  }

  private queueKeyFor(event: JobWriteReadyEvent): string {
    const ctx = event.operations[0]!.context;
    return `${ctx.documentId}:${ctx.scope}:${ctx.branch}`;
  }
}
