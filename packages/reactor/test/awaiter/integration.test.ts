import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import type { IJobTracker } from "../../src/job-tracker/interfaces.js";
import { JobAwaiter } from "../../src/shared/awaiter.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createEmptyConsistencyToken } from "../factories.js";

describe("JobAwaiter Integration Tests", () => {
  let jobAwaiter: JobAwaiter;
  let jobTracker: IJobTracker;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    jobTracker = new InMemoryJobTracker(eventBus);
    jobAwaiter = new JobAwaiter(eventBus, (jobId) => {
      const status = jobTracker.getJobStatus(jobId);
      if (!status) {
        return Promise.reject(new Error(`Job not found: ${jobId}`));
      }
      return Promise.resolve(status);
    });
  });

  afterEach(() => {
    jobAwaiter.shutdown();
    jobTracker.shutdown();
  });

  describe("Integration with Real JobTracker", () => {
    it("should wait for job completion using real job tracker and event bus", async () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      jobTracker.registerJob(jobInfo);
      jobTracker.markRunning("job-1");

      const promise = jobAwaiter.waitForJob("job-1");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-1",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      expect(jobTracker.getJobStatus("job-1")?.status).toBe(
        JobStatus.WRITE_READY,
      );

      await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
        jobId: "job-1",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      const result = await promise;
      expect(result.status).toBe(JobStatus.READ_READY);
    });

    it("should handle job with WRITE_COMPLETED status via OPERATION_WRITTEN event", async () => {
      const jobInfo: JobInfo = {
        id: "job-write",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-write"] },
      };

      jobTracker.registerJob(jobInfo);
      jobTracker.markRunning("job-write");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-write",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      const status = jobTracker.getJobStatus("job-write");
      expect(status?.status).toBe(JobStatus.WRITE_READY);
    });

    it("should handle job with READ_MODELS_READY status via OPERATIONS_READY event", async () => {
      const jobInfo: JobInfo = {
        id: "job-read",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-read"] },
      };

      jobTracker.registerJob(jobInfo);
      jobTracker.markRunning("job-read");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-read",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      expect(jobTracker.getJobStatus("job-read")?.status).toBe(
        JobStatus.WRITE_READY,
      );

      await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
        jobId: "job-read",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      expect(jobTracker.getJobStatus("job-read")?.status).toBe(
        JobStatus.READ_READY,
      );
    });

    it("should handle job failure through real job tracker via JOB_FAILED event", async () => {
      const jobInfo: JobInfo = {
        id: "job-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-2"] },
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-2");

      jobTracker.markRunning("job-2");

      await eventBus.emit(ReactorEventTypes.JOB_FAILED, {
        jobId: "job-2",
        error: new Error("Job execution failed"),
      });

      const result = await promise;
      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error?.message).toBe("Job execution failed");
    });

    it("should handle complete job lifecycle PENDING → RUNNING → WRITE_COMPLETED → READ_MODELS_READY", async () => {
      const jobInfo: JobInfo = {
        id: "job-3",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-3"] },
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-3");

      expect(jobTracker.getJobStatus("job-3")?.status).toBe(JobStatus.PENDING);

      jobTracker.markRunning("job-3");
      expect(jobTracker.getJobStatus("job-3")?.status).toBe(JobStatus.RUNNING);

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-3",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      expect(jobTracker.getJobStatus("job-3")?.status).toBe(
        JobStatus.WRITE_READY,
      );

      await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
        jobId: "job-3",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      const result = await promise;
      expect(result.status).toBe(JobStatus.READ_READY);

      expect(jobTracker.getJobStatus("job-3")?.status).toBe(
        JobStatus.READ_READY,
      );
    });

    it("should handle multiple concurrent jobs with real job tracker", async () => {
      const job1: JobInfo = {
        id: "job-concurrent-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-concurrent-1"] },
      };
      const job2: JobInfo = {
        id: "job-concurrent-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-concurrent-2"] },
      };
      const job3: JobInfo = {
        id: "job-concurrent-3",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-concurrent-3"] },
      };

      jobTracker.registerJob(job1);
      jobTracker.registerJob(job2);
      jobTracker.registerJob(job3);

      const promise1 = jobAwaiter.waitForJob("job-concurrent-1");
      const promise2 = jobAwaiter.waitForJob("job-concurrent-2");
      const promise3 = jobAwaiter.waitForJob("job-concurrent-3");

      jobTracker.markRunning("job-concurrent-1");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-concurrent-1",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
        jobId: "job-concurrent-1",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      const result1 = await promise1;
      expect(result1.status).toBe(JobStatus.READ_READY);

      jobTracker.markRunning("job-concurrent-2");

      await eventBus.emit(ReactorEventTypes.JOB_FAILED, {
        jobId: "job-concurrent-2",
        error: new Error("Job 2 failed"),
      });

      jobTracker.markRunning("job-concurrent-3");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-concurrent-3",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
        jobId: "job-concurrent-3",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      const [result2, result3] = await Promise.all([promise2, promise3]);
      expect(result2.status).toBe(JobStatus.FAILED);
      expect(result3.status).toBe(JobStatus.READ_READY);
    });

    it("should reject when job is not found in tracker", async () => {
      const promise = jobAwaiter.waitForJob("non-existent-job");

      await expect(promise).rejects.toThrow("Job not found: non-existent-job");
    });

    it("should handle same job being waited on multiple times", async () => {
      const jobInfo: JobInfo = {
        id: "job-duplicate",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-duplicate"] },
      };

      jobTracker.registerJob(jobInfo);

      const promise1 = jobAwaiter.waitForJob("job-duplicate");
      const promise2 = jobAwaiter.waitForJob("job-duplicate");

      jobTracker.markRunning("job-duplicate");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-duplicate",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
        jobId: "job-duplicate",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toEqual(result2);
      expect(result1.status).toBe(JobStatus.READ_READY);
    });

    it("should handle abort signals with real job tracker", async () => {
      const jobInfo: JobInfo = {
        id: "job-abort",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-abort"] },
      };

      jobTracker.registerJob(jobInfo);

      const controller = new AbortController();
      const promise = jobAwaiter.waitForJob("job-abort", controller.signal);

      await new Promise((resolve) => setTimeout(resolve, 5));

      controller.abort();

      await expect(promise).rejects.toThrow("Operation aborted");
    });

    it("should reject when job is not found after registration", async () => {
      const promise = jobAwaiter.waitForJob("job-not-registered");

      await expect(promise).rejects.toThrow(
        "Job not found: job-not-registered",
      );
    });

    it("should handle immediate job completion", async () => {
      const jobInfo: JobInfo = {
        id: "job-immediate",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        completedAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-immediate"] },
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-immediate");

      const result = await promise;
      expect(result.status).toBe(JobStatus.READ_READY);
    });

    it("should handle job completion with result data", async () => {
      const jobInfo: JobInfo = {
        id: "job-with-result",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-with-result"] },
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-with-result");

      jobTracker.markRunning("job-with-result");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-with-result",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
        jobId: "job-with-result",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      const result = await promise;
      expect(result.status).toBe(JobStatus.READ_READY);
    });
  });

  describe("Integration Lifecycle", () => {
    it("should handle shutdown with pending jobs tracked by real tracker", async () => {
      const job1: JobInfo = {
        id: "job-shutdown-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-shutdown-1"] },
      };
      const job2: JobInfo = {
        id: "job-shutdown-2",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-shutdown-2"] },
      };

      jobTracker.registerJob(job1);
      jobTracker.registerJob(job2);

      const promise1 = jobAwaiter.waitForJob("job-shutdown-1");
      const promise2 = jobAwaiter.waitForJob("job-shutdown-2");

      await new Promise((resolve) => setTimeout(resolve, 5));

      jobAwaiter.shutdown();

      await Promise.all([
        expect(promise1).rejects.toThrow("JobAwaiter destroyed"),
        expect(promise2).rejects.toThrow("JobAwaiter destroyed"),
      ]);
    });

    it("should work correctly with event-driven updates", async () => {
      let jobInfo: JobInfo = {
        id: "job-cycle-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-cycle-1"] },
      };

      jobTracker.registerJob(jobInfo);
      jobTracker.markRunning("job-cycle-1");
      const promise1 = jobAwaiter.waitForJob("job-cycle-1");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-cycle-1",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
        jobId: "job-cycle-1",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      await promise1;

      jobInfo = {
        id: "job-cycle-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-cycle-2"] },
      };

      jobTracker.registerJob(jobInfo);
      jobTracker.markRunning("job-cycle-2");

      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
        jobId: "job-cycle-2",
        operations: [
          {
            operation: {} as any,
            context: {
              documentId: "doc-1",
              documentType: "type-1",
              scope: "scope",
              branch: "main",
            },
          },
        ],
      });

      expect(jobTracker.getJobStatus("job-cycle-2")?.status).toBe(
        JobStatus.WRITE_READY,
      );
    });
  });
});
