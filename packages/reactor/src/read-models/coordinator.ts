import type { IEventBus } from "../events/interfaces.js";
import {
  OperationEventTypes,
  type OperationWrittenEvent,
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
    private readModels: IReadModel[],
  ) {}

  /**
   * Start listening for operation events and updating read models.
   * Can be called multiple times safely (subsequent calls are no-ops).
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    // Subscribe to OPERATION_WRITTEN events
    this.unsubscribe = this.eventBus.subscribe(
      OperationEventTypes.OPERATION_WRITTEN,
      async (type, event: OperationWrittenEvent) => {
        await this.handleOperationWritten(event);
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
   * Handle operation written events by updating all read models in parallel.
   * Errors from individual read models are collected and re-thrown as an aggregate.
   */
  private async handleOperationWritten(
    event: OperationWrittenEvent,
  ): Promise<void> {
    // Index into all read models in parallel
    // If any read model fails, the error will be collected by the event bus
    await Promise.all(
      this.readModels.map((readModel) =>
        readModel.indexOperations(event.operations),
      ),
    );
  }
}
