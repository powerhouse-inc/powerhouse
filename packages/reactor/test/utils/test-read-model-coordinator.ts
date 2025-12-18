import type { IEventBus } from "../../src/events/interfaces.js";
import {
  OperationEventTypes,
  type OperationsReadyEvent,
  type OperationWrittenEvent,
  type Unsubscribe,
} from "../../src/events/types.js";
import type {
  IReadModel,
  IReadModelCoordinator,
} from "../../src/read-models/interfaces.js";

export class TestReadModelCoordinator implements IReadModelCoordinator {
  private unsubscribe?: Unsubscribe;
  private isRunning = false;
  private isPaused = false;
  private operationQueue: OperationWrittenEvent[] = [];

  public readModels: IReadModel[] = [];

  constructor(private eventBus: IEventBus) {}

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.unsubscribe = this.eventBus.subscribe(
      OperationEventTypes.OPERATION_WRITTEN,
      async (type, event: OperationWrittenEvent) => {
        await this.handleOperationWritten(event);
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

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  async flush(): Promise<void> {
    const queuedEvents = [...this.operationQueue];
    this.operationQueue = [];

    for (const event of queuedEvents) {
      await Promise.all(
        this.readModels.map((readModel) =>
          readModel.indexOperations(event.operations),
        ),
      );

      const readyEvent: OperationsReadyEvent = {
        jobId: event.jobId,
        operations: event.operations,
      };
      this.eventBus
        .emit(OperationEventTypes.OPERATIONS_READY, readyEvent)
        .catch(() => {
          // No-op: Event emission is fire-and-forget
        });
    }
  }

  getQueueLength(): number {
    return this.operationQueue.length;
  }

  private async handleOperationWritten(
    event: OperationWrittenEvent,
  ): Promise<void> {
    if (this.isPaused) {
      this.operationQueue.push(event);
      return;
    }

    await Promise.all(
      this.readModels.map((readModel) =>
        readModel.indexOperations(event.operations),
      ),
    );

    const readyEvent: OperationsReadyEvent = {
      jobId: event.jobId,
      operations: event.operations,
    };
    this.eventBus
      .emit(OperationEventTypes.OPERATIONS_READY, readyEvent)
      .catch(() => {
        // No-op: Event emission is fire-and-forget
      });
  }
}
