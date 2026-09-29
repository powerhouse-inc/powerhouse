import type { ILogger } from "document-model";
import { DriveCollectionId } from "../cache/operation-index-types.js";
import type { JobFailedEvent, JobWriteReadyEvent } from "../events/types.js";

export type PreparedBatch = {
  /** Document ID -> Collection IDs that they are a part of */
  collectionMemberships: Record<string, string[]>;
  entries: Array<{
    event: JobWriteReadyEvent;
    jobDependencies: string[];
  }>;
};

/** Queued between write-ready events when the settled watermark advances. */
const SETTLED = Symbol("settled");

/** Batches remembered as finished, so a repeated JOB_FAILED is ignored. */
const FINISHED_BATCH_MEMORY = 1024;

type QueueItem =
  | JobWriteReadyEvent
  | typeof SETTLED
  | { failed: JobFailedEvent };

type PendingBatch = {
  expectedJobIds: Set<string>;
  /** Jobs that arrived or failed. */
  resolvedJobIds: Set<string>;
  events: JobWriteReadyEvent[];
};

export class BatchAggregator {
  private readonly logger: ILogger;
  private readonly driveContainerTypes: ReadonlySet<string>;
  private readonly onBatchReady: (batch: PreparedBatch) => Promise<void>;
  private readonly onSettled: () => Promise<void>;
  private queue: QueueItem[] = [];
  private processing: boolean = false;
  private readonly pendingBatches: Map<string, PendingBatch> = new Map();
  private readonly finishedBatches: Set<string> = new Set();

  constructor(
    logger: ILogger,
    driveContainerTypes: ReadonlySet<string>,
    onBatchReady: (batch: PreparedBatch) => Promise<void>,
    onSettled: () => Promise<void>,
  ) {
    this.logger = logger;
    this.driveContainerTypes = driveContainerTypes;
    this.onBatchReady = onBatchReady;
    this.onSettled = onSettled;
  }

  async enqueueWriteReady(event: JobWriteReadyEvent): Promise<void> {
    this.queue.push(event);
    await this.processQueue();
  }

  /** Runs onSettled on the serial queue; one queued run covers many. */
  async enqueueSettled(): Promise<void> {
    if (!this.queue.includes(SETTLED)) {
      this.queue.push(SETTLED);
    }
    await this.processQueue();
  }

  async handleJobFailed(event: JobFailedEvent): Promise<void> {
    this.queue.push({ failed: event });
    await this.processQueue();
  }

  clear(): void {
    this.queue = [];
    this.pendingBatches.clear();
    this.finishedBatches.clear();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        if (item === SETTLED) {
          try {
            await this.onSettled();
          } catch (error) {
            this.logger.error(
              "Failed to derive settled outboxes (@error)",
              error instanceof Error ? error.message : String(error),
            );
          }
          continue;
        }
        if ("failed" in item) {
          try {
            await this.handleFailed(item.failed);
          } catch (error) {
            this.logger.error(
              "Failed to process job-failed event (@jobId, @error)",
              item.failed.jobId,
              error instanceof Error ? error.message : String(error),
            );
          }
          continue;
        }
        try {
          await this.handleWriteReady(item);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            "Failed to process write-ready event (@jobId, @error)",
            item.jobId,
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

    const pending =
      batchJobIds.length > 1
        ? this.pendingFor(batchId, batchJobIds)
        : undefined;
    if (!pending) {
      await this.onBatchReady(this.prepareBatch([event]));
      return;
    }
    pending.resolvedJobIds.add(event.jobId);
    pending.events.push(event);

    if (this.finishIfResolved(batchId, pending)) {
      await this.onBatchReady(this.prepareBatch(pending.events));
    }
  }

  /** A failed job never arrives, so what its batch holds goes now. */
  private async handleFailed(event: JobFailedEvent): Promise<void> {
    const meta = event.job?.meta;
    if (!meta?.batchId || meta.batchJobIds.length <= 1) {
      return;
    }
    const pending = this.pendingFor(meta.batchId, meta.batchJobIds);
    if (!pending) {
      return;
    }
    pending.resolvedJobIds.add(event.jobId);
    this.finishIfResolved(meta.batchId, pending);

    const events = pending.events;
    pending.events = [];
    if (events.length > 0) {
      await this.onBatchReady(this.prepareBatch(events));
    }
  }

  private pendingFor(
    batchId: string,
    batchJobIds: string[],
  ): PendingBatch | undefined {
    if (this.finishedBatches.has(batchId)) {
      return undefined;
    }
    let pending = this.pendingBatches.get(batchId);
    if (!pending) {
      pending = {
        expectedJobIds: new Set(batchJobIds),
        resolvedJobIds: new Set(),
        events: [],
      };
      this.pendingBatches.set(batchId, pending);
    }
    return pending;
  }

  private finishIfResolved(batchId: string, pending: PendingBatch): boolean {
    for (const id of pending.expectedJobIds) {
      if (!pending.resolvedJobIds.has(id)) {
        return false;
      }
    }
    this.pendingBatches.delete(batchId);
    this.finishedBatches.add(batchId);
    if (this.finishedBatches.size > FINISHED_BATCH_MEMORY) {
      const oldest = this.finishedBatches.values().next().value!;
      this.finishedBatches.delete(oldest);
    }
    return true;
  }

  private prepareBatch(events: JobWriteReadyEvent[]): PreparedBatch {
    const collectionMemberships = this.mergeCollectionMemberships(events);
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

  private mergeCollectionMemberships(
    events: JobWriteReadyEvent[],
  ): Record<string, string[]> {
    const mergedMemberships: Record<string, string[]> = {};

    for (const event of events) {
      if (event.collectionMemberships) {
        for (const [docId, collections] of Object.entries(
          event.collectionMemberships,
        )) {
          if (!(docId in mergedMemberships)) {
            mergedMemberships[docId] = [];
          }
          for (const c of collections) {
            if (!mergedMemberships[docId].includes(c)) {
              mergedMemberships[docId].push(c);
            }
          }
        }
      }

      for (const op of event.operations) {
        const action = op.operation.action as {
          type: string;
          input?: { sourceId?: string; targetId?: string };
        };
        if (action.type !== "ADD_RELATIONSHIP") {
          continue;
        }
        if (!this.driveContainerTypes.has(op.context.documentType)) {
          continue;
        }
        const input = action.input;
        if (!input?.sourceId || !input.targetId) {
          continue;
        }

        const collectionId = DriveCollectionId.forDrive(
          input.sourceId,
          op.context.branch,
        ).key;
        if (!(input.targetId in mergedMemberships)) {
          mergedMemberships[input.targetId] = [];
        }
        if (!mergedMemberships[input.targetId].includes(collectionId)) {
          mergedMemberships[input.targetId].push(collectionId);
        }
      }
    }

    return mergedMemberships;
  }
}
