import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  JobFailedEvent,
  JobWriteReadyEvent,
} from "../../../src/events/types.js";
import type { ILogger } from "../../../src/logging/types.js";
import {
  BatchAggregator,
  type PreparedBatch,
} from "../../../src/sync/batch-aggregator.js";

describe("BatchAggregator", () => {
  let logger: ILogger;
  let onBatchReady: ReturnType<typeof vi.fn>;
  let aggregator: BatchAggregator;

  const makeWriteReadyEvent = (
    jobId: string,
    batchId: string,
    batchJobIds: string[],
  ): JobWriteReadyEvent => ({
    jobId,
    operations: [],
    jobMeta: { batchId, batchJobIds },
  });

  beforeEach(() => {
    logger = {
      level: "error",
      verbose: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      errorHandler: vi.fn(),
      child: vi.fn(),
    } as unknown as ILogger;

    onBatchReady = vi.fn().mockResolvedValue(undefined);
    aggregator = new BatchAggregator(logger, onBatchReady);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("single-job batches", () => {
    it("calls onBatchReady immediately for a single-job batch", async () => {
      const event = makeWriteReadyEvent("job-1", "batch-1", ["job-1"]);

      await aggregator.enqueueWriteReady(event);

      expect(onBatchReady).toHaveBeenCalledTimes(1);
      expect(onBatchReady).toHaveBeenCalledWith({
        collectionMemberships: {},
        entries: [{ event, jobDependencies: [] }],
      });
    });
  });

  describe("multi-job batches", () => {
    it("accumulates events until all jobs arrive", async () => {
      const event1 = makeWriteReadyEvent("job-1", "batch-1", [
        "job-1",
        "job-2",
        "job-3",
      ]);
      const event2 = makeWriteReadyEvent("job-2", "batch-1", [
        "job-1",
        "job-2",
        "job-3",
      ]);
      const event3 = makeWriteReadyEvent("job-3", "batch-1", [
        "job-1",
        "job-2",
        "job-3",
      ]);

      await aggregator.enqueueWriteReady(event1);
      expect(onBatchReady).not.toHaveBeenCalled();

      await aggregator.enqueueWriteReady(event2);
      expect(onBatchReady).not.toHaveBeenCalled();

      await aggregator.enqueueWriteReady(event3);
      expect(onBatchReady).toHaveBeenCalledTimes(1);
      expect(onBatchReady).toHaveBeenCalledWith({
        collectionMemberships: {},
        entries: [
          { event: event1, jobDependencies: [] },
          { event: event2, jobDependencies: ["job-1"] },
          { event: event3, jobDependencies: ["job-1", "job-2"] },
        ],
      });
    });

    it("handles two-job batch correctly", async () => {
      const event1 = makeWriteReadyEvent("job-1", "batch-1", [
        "job-1",
        "job-2",
      ]);
      const event2 = makeWriteReadyEvent("job-2", "batch-1", [
        "job-1",
        "job-2",
      ]);

      await aggregator.enqueueWriteReady(event1);
      await aggregator.enqueueWriteReady(event2);

      expect(onBatchReady).toHaveBeenCalledTimes(1);
      expect(onBatchReady).toHaveBeenCalledWith({
        collectionMemberships: {},
        entries: [
          { event: event1, jobDependencies: [] },
          { event: event2, jobDependencies: ["job-1"] },
        ],
      });
    });
  });

  describe("job failure", () => {
    it("flushes partial batch when a job fails", async () => {
      const event1 = makeWriteReadyEvent("job-1", "batch-1", [
        "job-1",
        "job-2",
      ]);

      await aggregator.enqueueWriteReady(event1);
      expect(onBatchReady).not.toHaveBeenCalled();

      const failedEvent: JobFailedEvent = {
        jobId: "job-2",
        error: new Error("something broke"),
        job: {
          meta: { batchId: "batch-1", batchJobIds: ["job-1", "job-2"] },
        } as JobFailedEvent["job"],
      };

      await aggregator.handleJobFailed(failedEvent);

      expect(onBatchReady).toHaveBeenCalledTimes(1);
      expect(onBatchReady).toHaveBeenCalledWith({
        collectionMemberships: {},
        entries: [{ event: event1, jobDependencies: [] }],
      });
    });

    it("is a no-op when no pending batch exists for the failed job's batchId", async () => {
      const failedEvent: JobFailedEvent = {
        jobId: "job-99",
        error: new Error("something broke"),
        job: {
          meta: { batchId: "nonexistent-batch", batchJobIds: ["job-99"] },
        } as JobFailedEvent["job"],
      };

      await aggregator.handleJobFailed(failedEvent);

      expect(onBatchReady).not.toHaveBeenCalled();
    });

    it("is a no-op when the failed event has no batchId", async () => {
      const failedEvent: JobFailedEvent = {
        jobId: "job-99",
        error: new Error("something broke"),
      };

      await aggregator.handleJobFailed(failedEvent);

      expect(onBatchReady).not.toHaveBeenCalled();
    });

    it("does not call onBatchReady when failed batch has no arrived events", async () => {
      const event1 = makeWriteReadyEvent("job-1", "batch-1", [
        "job-1",
        "job-2",
      ]);

      await aggregator.enqueueWriteReady(event1);

      const failedEvent: JobFailedEvent = {
        jobId: "job-2",
        error: new Error("something broke"),
        job: {
          meta: { batchId: "batch-1", batchJobIds: ["job-1", "job-2"] },
        } as JobFailedEvent["job"],
      };

      await aggregator.handleJobFailed(failedEvent);
      expect(onBatchReady).toHaveBeenCalledTimes(1);

      // Second failure for same batch should be a no-op (batch already flushed)
      await aggregator.handleJobFailed(failedEvent);
      expect(onBatchReady).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear", () => {
    it("discards pending batch state", async () => {
      const event1 = makeWriteReadyEvent("job-1", "batch-1", [
        "job-1",
        "job-2",
      ]);

      await aggregator.enqueueWriteReady(event1);
      expect(onBatchReady).not.toHaveBeenCalled();

      aggregator.clear();

      // The second event of the batch arrives after clear -- should start fresh
      const event2 = makeWriteReadyEvent("job-2", "batch-1", [
        "job-1",
        "job-2",
      ]);
      await aggregator.enqueueWriteReady(event2);

      // Should NOT call onBatchReady because clear reset state, and job-2 alone
      // doesn't complete the batch (job-1 never arrived in this new context)
      expect(onBatchReady).not.toHaveBeenCalled();
    });

    it("discards queued events", async () => {
      // Simulate a slow onBatchReady so events queue up
      let resolveFirst: () => void;
      const firstCallPromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      onBatchReady.mockImplementationOnce(async () => {
        await firstCallPromise;
      });

      const event1 = makeWriteReadyEvent("job-1", "batch-1", ["job-1"]);
      const event2 = makeWriteReadyEvent("job-2", "batch-2", ["job-2"]);

      // Start processing event1 (will block on firstCallPromise)
      const enqueuePromise1 = aggregator.enqueueWriteReady(event1);

      // event2 should be queued behind event1
      const enqueuePromise2 = aggregator.enqueueWriteReady(event2);

      // Clear while event1 is still processing
      aggregator.clear();

      // Unblock event1 processing
      resolveFirst!();
      await enqueuePromise1;
      await enqueuePromise2;

      // onBatchReady was called for event1 (already in-progress), but not for event2 (cleared)
      expect(onBatchReady).toHaveBeenCalledTimes(1);
      expect(onBatchReady).toHaveBeenCalledWith({
        collectionMemberships: {},
        entries: [{ event: event1, jobDependencies: [] }],
      });
    });
  });

  describe("error handling", () => {
    it("logs errors from onBatchReady and continues processing the queue", async () => {
      onBatchReady
        .mockRejectedValueOnce(new Error("callback failed"))
        .mockResolvedValueOnce(undefined);

      const event1 = makeWriteReadyEvent("job-1", "batch-1", ["job-1"]);
      const event2 = makeWriteReadyEvent("job-2", "batch-2", ["job-2"]);

      await aggregator.enqueueWriteReady(event1);
      await aggregator.enqueueWriteReady(event2);

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(onBatchReady).toHaveBeenCalledTimes(2);
      expect(onBatchReady).toHaveBeenNthCalledWith(1, {
        collectionMemberships: {},
        entries: [{ event: event1, jobDependencies: [] }],
      });
      expect(onBatchReady).toHaveBeenNthCalledWith(2, {
        collectionMemberships: {},
        entries: [{ event: event2, jobDependencies: [] }],
      });
    });
  });

  describe("sequential processing", () => {
    it("processes events in order even when enqueued concurrently", async () => {
      const callOrder: string[] = [];

      onBatchReady.mockImplementation((batch: PreparedBatch) => {
        callOrder.push(batch.entries[0].event.jobId);
        return Promise.resolve();
      });

      const event1 = makeWriteReadyEvent("job-1", "batch-1", ["job-1"]);
      const event2 = makeWriteReadyEvent("job-2", "batch-2", ["job-2"]);
      const event3 = makeWriteReadyEvent("job-3", "batch-3", ["job-3"]);

      await Promise.all([
        aggregator.enqueueWriteReady(event1),
        aggregator.enqueueWriteReady(event2),
        aggregator.enqueueWriteReady(event3),
      ]);

      expect(callOrder).toEqual(["job-1", "job-2", "job-3"]);
    });
  });
});
