import type { JobFailedEvent, JobWriteReadyEvent } from "../events/types.js";
import type { ILogger } from "../logging/types.js";

type PendingBatch = {
  expectedJobIds: Set<string>;
  arrivedJobIds: Set<string>;
  events: JobWriteReadyEvent[];
};

export class BatchAggregator {
  private readonly logger: ILogger;
  private readonly onBatchReady: (
    events: JobWriteReadyEvent[],
  ) => Promise<void>;
  private queue: JobWriteReadyEvent[] = [];
  private processing: boolean = false;
  private readonly pendingBatches: Map<string, PendingBatch> = new Map();

  constructor(
    logger: ILogger,
    onBatchReady: (events: JobWriteReadyEvent[]) => Promise<void>,
  ) {
    this.logger = logger;
    this.onBatchReady = onBatchReady;
  }

  async enqueueWriteReady(event: JobWriteReadyEvent): Promise<void> {
    this.queue.push(event);
    await this.processQueue();
  }

  async handleJobFailed(event: JobFailedEvent): Promise<void> {
    const batchId = event.job?.meta.batchId;
    if (!batchId) {
      return;
    }

    const pending = this.pendingBatches.get(batchId);
    if (!pending) {
      return;
    }

    this.pendingBatches.delete(batchId);
    if (pending.events.length > 0) {
      await this.onBatchReady(pending.events);
    }
  }

  clear(): void {
    this.queue = [];
    this.pendingBatches.clear();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift()!;
        try {
          await this.handleWriteReady(event);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            "Failed to process write-ready event (@jobId, @error)",
            event.jobId,
            err.message,
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async handleWriteReady(event: JobWriteReadyEvent): Promise<void> {
    const { batchId, batchJobIds } = event.jobMeta;

    if (batchJobIds.length <= 1) {
      await this.onBatchReady([event]);
      return;
    }

    let pending = this.pendingBatches.get(batchId);
    if (!pending) {
      pending = {
        expectedJobIds: new Set(batchJobIds),
        arrivedJobIds: new Set(),
        events: [],
      };
      this.pendingBatches.set(batchId, pending);
    }

    pending.arrivedJobIds.add(event.jobId);
    pending.events.push(event);

    if (pending.arrivedJobIds.size >= pending.expectedJobIds.size) {
      this.pendingBatches.delete(batchId);
      await this.onBatchReady(pending.events);
    }
  }
}
