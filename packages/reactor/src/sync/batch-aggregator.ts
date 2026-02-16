import type { JobFailedEvent, JobWriteReadyEvent } from "../events/types.js";
import type { ILogger } from "../logging/types.js";
import { mergeCollectionMemberships } from "./utils.js";

export type PreparedBatch = {
  /** Document ID -> Collection IDs that they are a part of */
  collectionMemberships: Record<string, string[]>;
  entries: Array<{
    event: JobWriteReadyEvent;
    jobDependencies: string[];
  }>;
};

type PendingBatch = {
  expectedJobIds: Set<string>;
  arrivedJobIds: Set<string>;
  events: JobWriteReadyEvent[];
};

export class BatchAggregator {
  private readonly logger: ILogger;
  private readonly onBatchReady: (batch: PreparedBatch) => Promise<void>;
  private queue: JobWriteReadyEvent[] = [];
  private processing: boolean = false;
  private readonly pendingBatches: Map<string, PendingBatch> = new Map();

  constructor(
    logger: ILogger,
    onBatchReady: (batch: PreparedBatch) => Promise<void>,
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
      await this.onBatchReady(this.prepareBatch(pending.events));
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
      await this.onBatchReady(this.prepareBatch([event]));
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
      await this.onBatchReady(this.prepareBatch(pending.events));
    }
  }

  private prepareBatch(events: JobWriteReadyEvent[]): PreparedBatch {
    const collectionMemberships = mergeCollectionMemberships(events);
    const isBatch = events.length > 1;
    const priorJobIds: string[] = [];
    const entries: PreparedBatch["entries"] = [];

    for (const event of events) {
      entries.push({
        event,
        jobDependencies: isBatch ? [...priorJobIds] : [],
      });

      if (isBatch && event.jobId) {
        priorJobIds.push(event.jobId);
      }
    }

    return { collectionMemberships, entries };
  }
}
