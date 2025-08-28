import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import type { IEventBus } from "../src/events/interfaces.js";
import type { IQueue } from "../src/queue/interfaces.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job, JobAvailableEvent } from "../src/queue/types.js";
import { QueueEventTypes } from "../src/queue/types.js";
import type { Operation } from "../src/shared/types.js";

describe("InMemoryQueue", () => {
  let queue: IQueue;
  let eventBus: IEventBus;
  let mockEventBusEmit: ReturnType<typeof vi.fn>;

  const createTestOperation = (
    overrides: Partial<Operation> = {},
  ): Operation => ({
    index: 1,
    timestampUtcMs: new Date().toISOString(),
    hash: "test-hash",
    skip: 0,
    type: "test-operation",
    input: { test: "data" },
    id: "op-1",
    ...overrides,
  });

  const createTestJob = (overrides: Partial<Job> = {}): Job => ({
    id: "job-1",
    documentId: "doc-1",
    scope: "global",
    branch: "main",
    operation: createTestOperation(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  });

  beforeEach(() => {
    eventBus = new EventBus();
    mockEventBusEmit = vi.fn().mockResolvedValue(undefined);
    eventBus.emit = mockEventBusEmit;
    queue = new InMemoryQueue(eventBus);
  });

  describe("enqueue", () => {
    it("should add a job to the queue", async () => {
      const job = createTestJob();

      await queue.enqueue(job);

      const size = await queue.size(job.documentId, job.scope, job.branch);
      expect(size).toBe(1);
    });

    it("should emit a jobAvailable event when a job is enqueued", async () => {
      const job = createTestJob();

      await queue.enqueue(job);

      expect(mockEventBusEmit).toHaveBeenCalledWith(
        QueueEventTypes.JOB_AVAILABLE,
        {
          documentId: job.documentId,
          scope: job.scope,
          branch: job.branch,
          jobId: job.id,
        } as JobAvailableEvent,
      );
    });

    it("should organize jobs by documentId, scope, and branch", async () => {
      const job1 = createTestJob({ id: "job-1", documentId: "doc-1" });
      const job2 = createTestJob({ id: "job-2", documentId: "doc-2" });
      const job3 = createTestJob({
        id: "job-3",
        documentId: "doc-1",
        scope: "local",
      });

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);

      expect(await queue.size("doc-1", "global", "main")).toBe(1);
      expect(await queue.size("doc-2", "global", "main")).toBe(1);
      expect(await queue.size("doc-1", "local", "main")).toBe(1);
    });

    it("should maintain FIFO order within the same queue", async () => {
      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });
      const job3 = createTestJob({ id: "job-3" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);

      const dequeuedJob1 = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      const dequeuedJob2 = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      const dequeuedJob3 = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );

      expect(dequeuedJob1?.id).toBe("job-1");
      expect(dequeuedJob2?.id).toBe("job-2");
      expect(dequeuedJob3?.id).toBe("job-3");
    });
  });

  describe("dequeue", () => {
    it("should return null when queue is empty", async () => {
      const job = await queue.dequeue("doc-1", "global", "main");
      expect(job).toBeNull();
    });

    it("should return and remove the first job from the queue", async () => {
      const testJob = createTestJob();
      await queue.enqueue(testJob);

      const dequeuedJob = await queue.dequeue(
        testJob.documentId,
        testJob.scope,
        testJob.branch,
      );

      expect(dequeuedJob).toEqual(testJob);
      expect(
        await queue.size(testJob.documentId, testJob.scope, testJob.branch),
      ).toBe(0);
    });

    it("should only dequeue from the specified document/scope/branch", async () => {
      const job1 = createTestJob({ id: "job-1", documentId: "doc-1" });
      const job2 = createTestJob({ id: "job-2", documentId: "doc-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      const dequeuedJob = await queue.dequeue("doc-1", "global", "main");

      expect(dequeuedJob?.id).toBe("job-1");
      expect(await queue.size("doc-2", "global", "main")).toBe(1);
    });

    it("should clean up empty queues after dequeuing", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      await queue.dequeue(job.documentId, job.scope, job.branch);

      // Verify queue is cleaned up by checking total size
      expect(await queue.totalSize()).toBe(0);
    });
  });

  describe("dequeueNext", () => {
    it("should return null when no jobs are available", async () => {
      const job = await queue.dequeueNext();
      expect(job).toBeNull();
    });

    it("should return a job from any available queue", async () => {
      const job1 = createTestJob({ id: "job-1", documentId: "doc-1" });
      const job2 = createTestJob({ id: "job-2", documentId: "doc-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      const dequeuedJob = await queue.dequeueNext();

      expect(dequeuedJob).toBeDefined();
      expect([job1.id, job2.id]).toContain(dequeuedJob?.id);
      expect(await queue.totalSize()).toBe(1);
    });

    it("should clean up empty queues after dequeuing", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      await queue.dequeueNext();

      expect(await queue.totalSize()).toBe(0);
    });
  });

  describe("size", () => {
    it("should return 0 for non-existent queue", async () => {
      const size = await queue.size("doc-1", "global", "main");
      expect(size).toBe(0);
    });

    it("should return correct size for existing queue", async () => {
      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      const size = await queue.size(job1.documentId, job1.scope, job1.branch);
      expect(size).toBe(2);
    });

    it("should return size for specific queue only", async () => {
      const job1 = createTestJob({ id: "job-1", documentId: "doc-1" });
      const job2 = createTestJob({ id: "job-2", documentId: "doc-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      expect(await queue.size("doc-1", "global", "main")).toBe(1);
      expect(await queue.size("doc-2", "global", "main")).toBe(1);
    });
  });

  describe("totalSize", () => {
    it("should return 0 when no jobs are queued", async () => {
      const totalSize = await queue.totalSize();
      expect(totalSize).toBe(0);
    });

    it("should return total count across all queues", async () => {
      const job1 = createTestJob({ id: "job-1", documentId: "doc-1" });
      const job2 = createTestJob({ id: "job-2", documentId: "doc-2" });
      const job3 = createTestJob({
        id: "job-3",
        documentId: "doc-1",
        scope: "local",
      });

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);

      const totalSize = await queue.totalSize();
      expect(totalSize).toBe(3);
    });
  });

  describe("remove", () => {
    it("should return false when job does not exist", async () => {
      const removed = await queue.remove("non-existent-job");
      expect(removed).toBe(false);
    });

    it("should remove and return true when job exists", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      const removed = await queue.remove(job.id);

      expect(removed).toBe(true);
      expect(await queue.size(job.documentId, job.scope, job.branch)).toBe(0);
    });

    it("should remove job from middle of queue", async () => {
      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });
      const job3 = createTestJob({ id: "job-3" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);

      const removed = await queue.remove(job2.id);

      expect(removed).toBe(true);
      expect(await queue.size(job1.documentId, job1.scope, job1.branch)).toBe(
        2,
      );

      // Verify correct jobs remain
      const dequeuedJob1 = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      const dequeuedJob2 = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );

      expect(dequeuedJob1?.id).toBe("job-1");
      expect(dequeuedJob2?.id).toBe("job-3");
    });

    it("should clean up empty queue after removing last job", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      await queue.remove(job.id);

      expect(await queue.totalSize()).toBe(0);
    });

    it("should handle orphaned job index entries gracefully", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      // Manually corrupt the state to simulate orphaned index
      const queueInstance = queue as InMemoryQueue;
      // @ts-expect-error - accessing private property for testing
      queueInstance.queues.clear();

      const removed = await queue.remove(job.id);

      expect(removed).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear specific queue", async () => {
      const job1 = createTestJob({ id: "job-1", documentId: "doc-1" });
      const job2 = createTestJob({ id: "job-2", documentId: "doc-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      await queue.clear("doc-1", "global", "main");

      expect(await queue.size("doc-1", "global", "main")).toBe(0);
      expect(await queue.size("doc-2", "global", "main")).toBe(1);
    });

    it("should handle clearing non-existent queue", async () => {
      await expect(
        queue.clear("non-existent", "global", "main"),
      ).resolves.not.toThrow();
    });

    it("should clean up job indices when clearing", async () => {
      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      await queue.clear(job1.documentId, job1.scope, job1.branch);

      // Verify jobs can't be removed (they're no longer indexed)
      expect(await queue.remove(job1.id)).toBe(false);
      expect(await queue.remove(job2.id)).toBe(false);
    });
  });

  describe("clearAll", () => {
    it("should clear all queues", async () => {
      const job1 = createTestJob({ id: "job-1", documentId: "doc-1" });
      const job2 = createTestJob({ id: "job-2", documentId: "doc-2" });
      const job3 = createTestJob({
        id: "job-3",
        documentId: "doc-1",
        scope: "local",
      });

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);

      await queue.clearAll();

      expect(await queue.totalSize()).toBe(0);
      expect(await queue.size("doc-1", "global", "main")).toBe(0);
      expect(await queue.size("doc-2", "global", "main")).toBe(0);
      expect(await queue.size("doc-1", "local", "main")).toBe(0);
    });

    it("should clean up all job indices", async () => {
      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      await queue.clearAll();

      // Verify jobs can't be removed (they're no longer indexed)
      expect(await queue.remove(job1.id)).toBe(false);
      expect(await queue.remove(job2.id)).toBe(false);
    });

    it("should handle clearing when already empty", async () => {
      await expect(queue.clearAll()).resolves.not.toThrow();
      expect(await queue.totalSize()).toBe(0);
    });
  });

  describe("event bus integration", () => {
    it("should emit events with correct data structure", async () => {
      const job = createTestJob({
        id: "test-job-id",
        documentId: "test-doc-id",
        scope: "test-scope",
        branch: "test-branch",
      });

      await queue.enqueue(job);

      expect(mockEventBusEmit).toHaveBeenCalledWith(
        QueueEventTypes.JOB_AVAILABLE,
        {
          documentId: "test-doc-id",
          scope: "test-scope",
          branch: "test-branch",
          jobId: "test-job-id",
        },
      );
    });

    it("should handle event bus errors gracefully", async () => {
      mockEventBusEmit.mockRejectedValue(new Error("Event bus error"));
      const job = createTestJob();

      await expect(queue.enqueue(job)).rejects.toThrow("Event bus error");
    });

    it("should emit event for each job enqueued", async () => {
      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      expect(mockEventBusEmit).toHaveBeenCalledTimes(2);
    });
  });

  describe("queue key generation", () => {
    it("should create unique keys for different document/scope/branch combinations", async () => {
      const job1 = createTestJob({
        id: "job-1",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
      });
      const job2 = createTestJob({
        id: "job-2",
        documentId: "doc-1",
        scope: "global",
        branch: "feature",
      });
      const job3 = createTestJob({
        id: "job-3",
        documentId: "doc-1",
        scope: "local",
        branch: "main",
      });
      const job4 = createTestJob({
        id: "job-4",
        documentId: "doc-2",
        scope: "global",
        branch: "main",
      });

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);
      await queue.enqueue(job4);

      expect(await queue.size("doc-1", "global", "main")).toBe(1);
      expect(await queue.size("doc-1", "global", "feature")).toBe(1);
      expect(await queue.size("doc-1", "local", "main")).toBe(1);
      expect(await queue.size("doc-2", "global", "main")).toBe(1);
    });

    it("should handle special characters in identifiers", async () => {
      const job = createTestJob({
        documentId: "doc:with:colons",
        scope: "scope-with-dashes",
        branch: "branch_with_underscores",
      });

      await queue.enqueue(job);

      expect(
        await queue.size(
          "doc:with:colons",
          "scope-with-dashes",
          "branch_with_underscores",
        ),
      ).toBe(1);
    });
  });

  describe("job properties", () => {
    it("should preserve all job properties", async () => {
      const operation = createTestOperation({
        index: 42,
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        hash: "custom-hash",
        skip: 5,
        type: "custom-operation",
        input: { custom: "input" },
        error: "test error",
        id: "custom-op-id",
      });

      const job = createTestJob({
        id: "custom-job-id",
        documentId: "custom-doc-id",
        scope: "custom-scope",
        branch: "custom-branch",
        operation,
        createdAt: "2023-01-01T00:00:00.000Z",
        retryCount: 2,
        maxRetries: 5,
      });

      await queue.enqueue(job);
      const dequeuedJob = await queue.dequeue(
        job.documentId,
        job.scope,
        job.branch,
      );

      expect(dequeuedJob).toEqual(job);
    });

    it("should handle jobs with optional properties", async () => {
      const job: Job = {
        id: "minimal-job",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        operation: createTestOperation(),
        createdAt: new Date().toISOString(),
        // retryCount and maxRetries are optional
      };

      await queue.enqueue(job);
      const dequeuedJob = await queue.dequeue(
        job.documentId,
        job.scope,
        job.branch,
      );

      expect(dequeuedJob).toEqual(job);
      expect(dequeuedJob?.retryCount).toBeUndefined();
      expect(dequeuedJob?.maxRetries).toBeUndefined();
    });
  });
});
