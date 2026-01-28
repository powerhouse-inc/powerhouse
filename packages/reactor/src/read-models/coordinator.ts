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
 * and updating all registered read models in parallel.
 *
 * This coordinator is responsible for:
 * - Subscribing to OPERATION_WRITTEN events from the event bus
 * - Distributing operation updates to all registered read models
 * - Managing the lifecycle of read model subscriptions
 *
 * Read models are updated asynchronously and in parallel to avoid blocking
 * the write path. Errors in read model updates are propagated through the
 * event bus but do not affect the write operation success.
 */
export class ReadModelCoordinator implements IReadModelCoordinator {
  private unsubscribe?: Unsubscribe;
  private isRunning = false;

  constructor(
    private eventBus: IEventBus,
    public readonly preReady: IReadModel[],
    public readonly postReady: IReadModel[],
  ) {
    //
  }

  /**
   * Start listening for operation events and updating read models.
   * Can be called multiple times safely (subsequent calls are no-ops).
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    // Subscribe to WRITE_READY events
    this.unsubscribe = this.eventBus.subscribe(
      ReactorEventTypes.JOB_WRITE_READY,
      async (type, event: JobWriteReadyEvent) => {
        await this.handleWriteReady(event);
      },
    );

    this.isRunning = true;
  }

  /**
   * Stop listening and clean up subscriptions.
   * Can be called multiple times safely (subsequent calls are no-ops).
   */
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
   * Handle write ready events by updating all read models in parallel.
   * Errors from individual read models are collected and re-thrown as an aggregate.
   */
  private async handleWriteReady(event: JobWriteReadyEvent): Promise<void> {
    // Index into pre-ready read models in parallel
    await Promise.all(
      this.preReady.map((readModel) =>
        readModel.indexOperations(event.operations),
      ),
    );

    // Emit READ_READY event after all pre-ready read models have completed
    const readyEvent: JobReadReadyEvent = {
      jobId: event.jobId,
      operations: event.operations,
    };
    await this.eventBus.emit(ReactorEventTypes.JOB_READ_READY, readyEvent);

    // Process post-ready read models (e.g., subscription notifications)
    await Promise.all(
      this.postReady.map((readModel) =>
        readModel.indexOperations(event.operations),
      ),
    );
  }
}
