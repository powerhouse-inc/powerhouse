import type { IEventBus } from "../../src/events/interfaces.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
  type JobWriteReadyEvent,
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
  private operationQueue: JobWriteReadyEvent[] = [];

  public readModels: IReadModel[] = [];

  constructor(private eventBus: IEventBus) {}

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.unsubscribe = this.eventBus.subscribe(
      ReactorEventTypes.JOB_WRITE_READY,
      async (type, event: JobWriteReadyEvent) => {
        await this.handleWriteReady(event);
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

      const readyEvent: JobReadReadyEvent = {
        jobId: event.jobId,
        operations: event.operations,
      };
      this.eventBus
        .emit(ReactorEventTypes.JOB_READ_READY, readyEvent)
        .catch(() => {
          // No-op: Event emission is fire-and-forget
        });
    }
  }

  getQueueLength(): number {
    return this.operationQueue.length;
  }

  private async handleWriteReady(event: JobWriteReadyEvent): Promise<void> {
    if (this.isPaused) {
      this.operationQueue.push(event);
      return;
    }

    await Promise.all(
      this.readModels.map((readModel) =>
        readModel.indexOperations(event.operations),
      ),
    );

    const readyEvent: JobReadReadyEvent = {
      jobId: event.jobId,
      operations: event.operations,
    };
    this.eventBus
      .emit(ReactorEventTypes.JOB_READ_READY, readyEvent)
      .catch(() => {
        // No-op: Event emission is fire-and-forget
      });
  }
}
