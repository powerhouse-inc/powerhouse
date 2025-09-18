import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import type { Job, JobAvailableEvent } from "../../src/queue/types.js";
import { QueueEventTypes } from "../../src/queue/types.js";
import {
  createJobDependencyChain,
  createJobWithDependencies,
  createTestJob,
  createTestOperation,
} from "../factories.js";

describe("InMemoryQueue", () => {
  let queue: IQueue;
  let eventBus: IEventBus;
  let mockEventBusEmit: ReturnType<typeof vi.fn>;

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

      expect(dequeuedJob1?.job.id).toBe("job-1");
      expect(dequeuedJob2?.job.id).toBe("job-2");
      expect(dequeuedJob3?.job.id).toBe("job-3");
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

      expect(dequeuedJob?.job).toEqual(testJob);
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

      expect(dequeuedJob?.job.id).toBe("job-1");
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
      expect([job1.id, job2.id]).toContain(dequeuedJob?.job.id);
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

      expect(dequeuedJob1?.job.id).toBe("job-1");
      expect(dequeuedJob2?.job.id).toBe("job-3");
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
      // @ts-ignore - accessing private property for testing
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

  describe("dependency management", () => {
    it("should dequeue job with no dependencies immediately", async () => {
      const job = createTestJob({ id: "job-1", queueHint: [] });
      await queue.enqueue(job);

      const dequeuedJob = await queue.dequeue(
        job.documentId,
        job.scope,
        job.branch,
      );

      expect(dequeuedJob?.job.id).toBe("job-1");
    });

    it("should block job with unmet dependencies", async () => {
      const job1 = createTestJob({ id: "job-1", queueHint: ["job-0"] });
      await queue.enqueue(job1);

      const dequeuedJob = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );

      expect(dequeuedJob).toBeNull();
      expect(await queue.size(job1.documentId, job1.scope, job1.branch)).toBe(
        1,
      );
    });

    it("should dequeue job after dependencies are completed", async () => {
      const job1 = createTestJob({ id: "job-1", queueHint: [] });
      const job2 = createTestJob({ id: "job-2", queueHint: ["job-1"] });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      // First job should be dequeued
      const dequeuedJob1 = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      expect(dequeuedJob1?.job.id).toBe("job-1");

      // Second job should be blocked
      const blockedJob = await queue.dequeue(
        job2.documentId,
        job2.scope,
        job2.branch,
      );
      expect(blockedJob).toBeNull();

      // Complete first job
      await queue.completeJob("job-1");

      // Now second job should be available
      const dequeuedJob2 = await queue.dequeue(
        job2.documentId,
        job2.scope,
        job2.branch,
      );
      expect(dequeuedJob2?.job.id).toBe("job-2");
    });

    it("should handle multiple dependencies", async () => {
      const job1 = createTestJob({ id: "job-1", queueHint: [] });
      const job2 = createTestJob({ id: "job-2", queueHint: [] });
      const job3 = createTestJob({
        id: "job-3",
        queueHint: ["job-1", "job-2"],
      });

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);

      // Dequeue and complete first job
      const dequeuedJob1 = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      expect(dequeuedJob1?.job.id).toBe("job-1");
      await queue.completeJob("job-1");

      // Next dequeue should return job-2 (not blocked), not job-3 (still blocked)
      const nextJob = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      expect(nextJob?.job.id).toBe("job-2");
      await queue.completeJob("job-2");

      // Now job 3 should be available
      const dequeuedJob3 = await queue.dequeue(
        job3.documentId,
        job3.scope,
        job3.branch,
      );
      expect(dequeuedJob3?.job.id).toBe("job-3");
    });

    it("should handle dependency chains", async () => {
      const jobs = createJobDependencyChain(4);

      for (const job of jobs) {
        await queue.enqueue(job);
      }

      // Process in order
      const d1 = await queue.dequeue(
        jobs[0].documentId,
        jobs[0].scope,
        jobs[0].branch,
      );
      expect(d1?.job.id).toBe("job-1");

      // Others should be blocked
      expect(
        await queue.dequeue(jobs[1].documentId, jobs[1].scope, jobs[1].branch),
      ).toBeNull();
      expect(
        await queue.dequeue(jobs[2].documentId, jobs[2].scope, jobs[2].branch),
      ).toBeNull();
      expect(
        await queue.dequeue(jobs[3].documentId, jobs[3].scope, jobs[3].branch),
      ).toBeNull();

      await queue.completeJob("job-1");

      const d2 = await queue.dequeue(
        jobs[1].documentId,
        jobs[1].scope,
        jobs[1].branch,
      );
      expect(d2?.job.id).toBe("job-2");

      // job-3 and job-4 still blocked
      expect(
        await queue.dequeue(jobs[2].documentId, jobs[2].scope, jobs[2].branch),
      ).toBeNull();
      expect(
        await queue.dequeue(jobs[3].documentId, jobs[3].scope, jobs[3].branch),
      ).toBeNull();

      await queue.completeJob("job-2");

      const d3 = await queue.dequeue(
        jobs[2].documentId,
        jobs[2].scope,
        jobs[2].branch,
      );
      expect(d3?.job.id).toBe("job-3");

      // job-4 still blocked
      expect(
        await queue.dequeue(jobs[3].documentId, jobs[3].scope, jobs[3].branch),
      ).toBeNull();

      await queue.completeJob("job-3");

      const d4 = await queue.dequeue(
        jobs[3].documentId,
        jobs[3].scope,
        jobs[3].branch,
      );
      expect(d4?.job.id).toBe("job-4");
    });

    it("should dequeue jobs out of order based on dependencies", async () => {
      const job1 = createTestJob({ id: "job-1", queueHint: ["job-0"] });
      const job2 = createTestJob({ id: "job-2", queueHint: [] });
      const job3 = createTestJob({ id: "job-3", queueHint: [] });

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);

      // Job 1 is blocked, so job 2 should be dequeued
      const dequeuedJob = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      expect(dequeuedJob?.job.id).toBe("job-2");
    });

    it("should handle dependencies across different queues", async () => {
      const job1 = createTestJob({
        id: "job-1",
        documentId: "doc-1",
        queueHint: [],
      });
      const job2 = createTestJob({
        id: "job-2",
        documentId: "doc-2",
        queueHint: ["job-1"],
      });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      // Job 2 should be blocked even though it's in a different queue
      const blockedJob = await queue.dequeue("doc-2", "global", "main");
      expect(blockedJob).toBeNull();

      // Dequeue and complete job 1
      const dequeuedJob1 = await queue.dequeue("doc-1", "global", "main");
      expect(dequeuedJob1?.job.id).toBe("job-1");
      await queue.completeJob("job-1");

      // Now job 2 should be available
      const dequeuedJob2 = await queue.dequeue("doc-2", "global", "main");
      expect(dequeuedJob2?.job.id).toBe("job-2");
    });

    it("should work with dequeueNext respecting dependencies", async () => {
      const job1 = createTestJob({
        id: "job-1",
        documentId: "doc-1",
        queueHint: ["job-0"],
      });
      const job2 = createTestJob({
        id: "job-2",
        documentId: "doc-2",
        queueHint: [],
      });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      // Should dequeue job-2 since job-1 is blocked
      const dequeuedJob = await queue.dequeueNext();
      expect(dequeuedJob?.job.id).toBe("job-2");
    });

    it("should handle circular dependencies by blocking all involved jobs", async () => {
      const job1 = createJobWithDependencies("job-1", ["job-2"]);
      const job2 = createJobWithDependencies("job-2", ["job-1"]);

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      // Both jobs should be blocked
      const dequeuedJob1 = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      expect(dequeuedJob1).toBeNull();

      const dequeuedJob2 = await queue.dequeue(
        job2.documentId,
        job2.scope,
        job2.branch,
      );
      expect(dequeuedJob2).toBeNull();
    });

    it("should handle self-dependencies by blocking the job", async () => {
      const job = createJobWithDependencies("job-1", ["job-1"]);
      await queue.enqueue(job);

      const dequeuedJob = await queue.dequeue(
        job.documentId,
        job.scope,
        job.branch,
      );
      expect(dequeuedJob).toBeNull();
    });

    it("should clear completed jobs tracking when clearAll is called", async () => {
      const job1 = createTestJob({ id: "job-1", queueHint: [] });
      const job2 = createTestJob({ id: "job-2", queueHint: ["job-1"] });

      await queue.enqueue(job1);

      // Complete job-1
      await queue.dequeue(job1.documentId, job1.scope, job1.branch);
      await queue.completeJob("job-1");

      // Clear all
      await queue.clearAll();

      // Re-enqueue job-2 - it should be blocked again since completed jobs were cleared
      await queue.enqueue(job2);

      const dequeuedJob = await queue.dequeue(
        job2.documentId,
        job2.scope,
        job2.branch,
      );
      expect(dequeuedJob).toBeNull();
    });

    it("should handle already completed dependencies", async () => {
      // Complete a job that doesn't exist in queue
      await queue.completeJob("job-0");

      // Enqueue a job that depends on it
      const job1 = createJobWithDependencies("job-1", ["job-0"]);
      await queue.enqueue(job1);

      // Should be able to dequeue since dependency is already complete
      const dequeuedJob = await queue.dequeue(
        job1.documentId,
        job1.scope,
        job1.branch,
      );
      expect(dequeuedJob?.job.id).toBe("job-1");
    });

    it("should handle mixed dependencies (some met, some unmet)", async () => {
      // Complete one dependency
      await queue.completeJob("job-0");

      // Enqueue a job with mixed dependencies
      const job = createTestJob({
        id: "job-3",
        queueHint: ["job-0", "job-1", "job-2"],
      });
      await queue.enqueue(job);

      // Should be blocked (job-1 and job-2 not complete)
      let dequeuedJob = await queue.dequeue(
        job.documentId,
        job.scope,
        job.branch,
      );
      expect(dequeuedJob).toBeNull();

      // Complete remaining dependencies
      await queue.completeJob("job-1");
      await queue.completeJob("job-2");

      // Now should be available
      dequeuedJob = await queue.dequeue(job.documentId, job.scope, job.branch);
      expect(dequeuedJob?.job.id).toBe("job-3");
    });

    it("should handle failJob without marking as completed", async () => {
      const job1 = createTestJob({ id: "job-1", queueHint: [] });
      const job2 = createTestJob({ id: "job-2", queueHint: ["job-1"] });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      // Dequeue and fail job 1
      const d1 = await queue.dequeue(job1.documentId, job1.scope, job1.branch);
      expect(d1?.job.id).toBe("job-1");
      await queue.failJob("job-1", "Test error");

      // Job 2 should still be blocked since job 1 wasn't completed
      const dequeuedJob = await queue.dequeue(
        job2.documentId,
        job2.scope,
        job2.branch,
      );
      expect(dequeuedJob).toBeNull();
    });
  });

  describe("isDrained", () => {
    it("should return true when queue is empty", () => {
      expect(queue.isDrained).toBe(true);
    });

    it("should return false when jobs are pending", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      expect(queue.isDrained).toBe(false);
    });

    it("should return false when jobs are executing", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      // Dequeue the job (marks it as executing)
      await queue.dequeueNext();

      expect(queue.isDrained).toBe(false);
    });

    it("should return true after all jobs are completed", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      const dequeuedJob = await queue.dequeueNext();
      expect(queue.isDrained).toBe(false);

      await queue.completeJob(dequeuedJob!.job.id);
      expect(queue.isDrained).toBe(true);
    });

    it("should return true after all jobs are failed", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      const dequeuedJob = await queue.dequeueNext();
      expect(queue.isDrained).toBe(false);

      await queue.failJob(dequeuedJob!.job.id, "Test failure");
      expect(queue.isDrained).toBe(true);
    });

    it("should handle multiple queues", async () => {
      const job1 = createTestJob({ id: "job-1", documentId: "doc-1" });
      const job2 = createTestJob({ id: "job-2", documentId: "doc-2" });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      expect(queue.isDrained).toBe(false);

      const dequeued1 = await queue.dequeueNext();
      await queue.completeJob(dequeued1!.job.id);
      expect(queue.isDrained).toBe(false);

      const dequeued2 = await queue.dequeueNext();
      await queue.completeJob(dequeued2!.job.id);
      expect(queue.isDrained).toBe(true);
    });
  });

  describe("block", () => {
    it("should prevent new jobs from being enqueued", async () => {
      queue.block();

      const job = createTestJob();
      await expect(queue.enqueue(job)).rejects.toThrow("Queue is blocked");
    });

    it("should allow existing jobs to be processed", async () => {
      const job = createTestJob();
      await queue.enqueue(job);

      queue.block();

      const dequeuedJob = await queue.dequeueNext();
      expect(dequeuedJob).toBeDefined();
      expect(dequeuedJob?.job.id).toBe(job.id);
    });

    it("should call onDrained callback when queue becomes drained", async () => {
      const onDrained = vi.fn();
      const job = createTestJob();
      await queue.enqueue(job);

      queue.block(onDrained);
      expect(onDrained).not.toHaveBeenCalled();

      const dequeuedJob = await queue.dequeueNext();
      await queue.completeJob(dequeuedJob!.job.id);

      expect(onDrained).toHaveBeenCalledTimes(1);
    });

    it("should call onDrained immediately if already drained", () => {
      const onDrained = vi.fn();

      queue.block(onDrained);

      expect(onDrained).toHaveBeenCalledTimes(1);
    });

    it("should not call onDrained if unblocked before draining", async () => {
      const onDrained = vi.fn();
      const job = createTestJob();
      await queue.enqueue(job);

      queue.block(onDrained);
      queue.unblock();

      const dequeuedJob = await queue.dequeueNext();
      await queue.completeJob(dequeuedJob!.job.id);

      expect(onDrained).not.toHaveBeenCalled();
    });

    it("should handle multiple block calls", () => {
      const onDrained1 = vi.fn();
      const onDrained2 = vi.fn();

      queue.block(onDrained1);
      queue.block(onDrained2);

      // Only the second callback should be registered
      expect(onDrained1).toHaveBeenCalledTimes(1);
      expect(onDrained2).toHaveBeenCalledTimes(1);
    });

    it("should handle block without callback", async () => {
      queue.block();

      const job = createTestJob();
      await expect(queue.enqueue(job)).rejects.toThrow("Queue is blocked");
    });
  });

  describe("unblock", () => {
    it("should allow new jobs to be enqueued after unblocking", async () => {
      queue.block();

      const job1 = createTestJob({ id: "job-1" });
      await expect(queue.enqueue(job1)).rejects.toThrow("Queue is blocked");

      queue.unblock();

      const job2 = createTestJob({ id: "job-2" });
      await expect(queue.enqueue(job2)).resolves.not.toThrow();

      const dequeuedJob = await queue.dequeueNext();
      expect(dequeuedJob?.job.id).toBe("job-2");
    });

    it("should clear onDrained callback", async () => {
      const onDrained = vi.fn();
      const job = createTestJob();
      await queue.enqueue(job);

      queue.block(onDrained);
      queue.unblock();

      // Complete the job after unblocking
      const dequeuedJob = await queue.dequeueNext();
      await queue.completeJob(dequeuedJob!.job.id);

      // Callback should not be called since we unblocked
      expect(onDrained).not.toHaveBeenCalled();
    });

    it("should handle unblock when not blocked", async () => {
      expect(() => queue.unblock()).not.toThrow();

      const job = createTestJob();
      await expect(queue.enqueue(job)).resolves.not.toThrow();
    });
  });

  describe("block/unblock integration", () => {
    it("should handle complex block/unblock scenarios", async () => {
      const onDrained1 = vi.fn();
      const onDrained2 = vi.fn();

      // Add some jobs
      const job1 = createTestJob({ id: "job-1" });
      const job2 = createTestJob({ id: "job-2" });
      await queue.enqueue(job1);
      await queue.enqueue(job2);

      // Block with callback
      queue.block(onDrained1);

      // Process one job
      const dequeued1 = await queue.dequeueNext();
      await queue.completeJob(dequeued1!.job.id);
      expect(onDrained1).not.toHaveBeenCalled();

      // Unblock and re-block with new callback
      queue.unblock();
      queue.block(onDrained2);

      // Process last job
      const dequeued2 = await queue.dequeueNext();
      await queue.completeJob(dequeued2!.job.id);

      // Only second callback should be called
      expect(onDrained1).not.toHaveBeenCalled();
      expect(onDrained2).toHaveBeenCalledTimes(1);
    });

    it("should handle retry while blocked", async () => {
      const job = createTestJob({ id: "job-1", maxRetries: 3 });
      await queue.enqueue(job);

      queue.block();

      const dequeuedJob = await queue.dequeueNext();

      // Retry should fail because queue is blocked
      await expect(
        queue.retryJob(dequeuedJob!.job.id, "Test error"),
      ).rejects.toThrow("Queue is blocked");
    });

    it("should track drain state correctly with dependencies", async () => {
      const job1 = createTestJob({ id: "job-1", queueHint: [] });
      const job2 = createTestJob({ id: "job-2", queueHint: ["job-1"] });

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      expect(queue.isDrained).toBe(false);

      // Process first job
      const dequeued1 = await queue.dequeueNext();
      expect(dequeued1?.job.id).toBe("job-1");
      expect(queue.isDrained).toBe(false);

      await queue.completeJob("job-1");
      expect(queue.isDrained).toBe(false); // job-2 still pending

      // Process second job
      const dequeued2 = await queue.dequeueNext();
      expect(dequeued2?.job.id).toBe("job-2");
      expect(queue.isDrained).toBe(false);

      await queue.completeJob("job-2");
      expect(queue.isDrained).toBe(true);
    });
  });

  describe("job properties", () => {
    it("should preserve all job properties", async () => {
      const operation = createTestOperation({
        index: 42,
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        hash: "custom-hash",
        skip: 5,
        action: {
          id: "action-1",
          type: "custom-operation",
          timestampUtcMs: "2023-01-01T00:00:00.000Z",
          input: { custom: "input" },
          scope: "global",
        },
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

      expect(dequeuedJob?.job).toEqual(job);
    });

    it("should handle jobs with optional properties", async () => {
      const job = {
        id: "minimal-job",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        operation: createTestOperation(),
        createdAt: new Date().toISOString(),
        queueHint: [],
        // retryCount and maxRetries are optional
      } satisfies Job;

      await queue.enqueue(job);
      const dequeuedJob = await queue.dequeue(
        job.documentId,
        job.scope,
        job.branch,
      );

      expect(dequeuedJob?.job).toEqual(job);
      expect(dequeuedJob?.job.retryCount).toBeUndefined();
      expect(dequeuedJob?.job.maxRetries).toBeUndefined();
    });
  });
});
