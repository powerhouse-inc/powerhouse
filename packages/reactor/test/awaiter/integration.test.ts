import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import { OperationEventTypes } from "../../src/events/types.js";
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
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-1");

      expect(jobTracker.getJobStatus("job-1")?.status).toBe(JobStatus.PENDING);

      jobTracker.markRunning("job-1");

      jobTracker.markCompleted("job-1", createEmptyConsistencyToken(), {
        data: "success",
      });

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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
      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.result).toEqual({ data: "success" });
    });

    it("should handle job with WRITE_COMPLETED status via OPERATION_WRITTEN event", async () => {
      const jobInfo: JobInfo = {
        id: "job-write",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      jobTracker.registerJob(jobInfo);
      jobTracker.markRunning("job-write");

      const promise = jobAwaiter.waitForJob("job-write");

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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

      const result = await promise;
      expect(result.status).toBe(JobStatus.WRITE_COMPLETED);
    });

    it("should handle job with READ_MODELS_READY status via OPERATIONS_READY event", async () => {
      const jobInfo: JobInfo = {
        id: "job-read",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      jobTracker.registerJob(jobInfo);
      jobTracker.markRunning("job-read");

      const promise = jobAwaiter.waitForJob("job-read");

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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

      const result = await promise;
      expect(result.status).toBe(JobStatus.WRITE_COMPLETED);

      await eventBus.emit(OperationEventTypes.OPERATIONS_READY, {
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
        JobStatus.READ_MODELS_READY,
      );
    });

    it("should handle job failure through real job tracker via JOB_FAILED event", async () => {
      const jobInfo: JobInfo = {
        id: "job-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-2");

      jobTracker.markRunning("job-2");

      await eventBus.emit(OperationEventTypes.JOB_FAILED, {
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
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-3");

      expect(jobTracker.getJobStatus("job-3")?.status).toBe(JobStatus.PENDING);

      jobTracker.markRunning("job-3");
      expect(jobTracker.getJobStatus("job-3")?.status).toBe(JobStatus.RUNNING);

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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
      expect(result.status).toBe(JobStatus.WRITE_COMPLETED);

      expect(jobTracker.getJobStatus("job-3")?.status).toBe(
        JobStatus.WRITE_COMPLETED,
      );

      await eventBus.emit(OperationEventTypes.OPERATIONS_READY, {
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
        JobStatus.READ_MODELS_READY,
      );
    });

    it("should handle multiple concurrent jobs with real job tracker", async () => {
      const job1: JobInfo = {
        id: "job-concurrent-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const job2: JobInfo = {
        id: "job-concurrent-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const job3: JobInfo = {
        id: "job-concurrent-3",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      jobTracker.registerJob(job1);
      jobTracker.registerJob(job2);
      jobTracker.registerJob(job3);

      const promise1 = jobAwaiter.waitForJob("job-concurrent-1");
      const promise2 = jobAwaiter.waitForJob("job-concurrent-2");
      const promise3 = jobAwaiter.waitForJob("job-concurrent-3");

      jobTracker.markCompleted(
        "job-concurrent-1",
        createEmptyConsistencyToken(),
      );

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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
      expect(result1.status).toBe(JobStatus.COMPLETED);

      jobTracker.markRunning("job-concurrent-2");

      await eventBus.emit(OperationEventTypes.JOB_FAILED, {
        jobId: "job-concurrent-2",
        error: new Error("Job 2 failed"),
      });

      jobTracker.markCompleted(
        "job-concurrent-3",
        createEmptyConsistencyToken(),
      );

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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
      expect(result3.status).toBe(JobStatus.COMPLETED);
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
      };

      jobTracker.registerJob(jobInfo);

      const promise1 = jobAwaiter.waitForJob("job-duplicate");
      const promise2 = jobAwaiter.waitForJob("job-duplicate");

      jobTracker.markCompleted("job-duplicate", createEmptyConsistencyToken(), {
        data: "shared result",
      });

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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
      expect(result1.status).toBe(JobStatus.COMPLETED);
      expect(result1.result).toEqual({ data: "shared result" });
    });

    it("should handle abort signals with real job tracker", async () => {
      const jobInfo: JobInfo = {
        id: "job-abort",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
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
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        completedAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-immediate");

      const result = await promise;
      expect(result.status).toBe(JobStatus.COMPLETED);
    });

    it("should handle job completion with result data", async () => {
      const jobInfo: JobInfo = {
        id: "job-with-result",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-with-result");

      const resultData = {
        documentId: "doc-123",
        operationCount: 5,
        metadata: { processed: true },
      };

      jobTracker.markCompleted(
        "job-with-result",
        createEmptyConsistencyToken(),
        resultData,
      );

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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
      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.result).toEqual(resultData);
    });
  });

  describe("Integration Lifecycle", () => {
    it("should handle shutdown with pending jobs tracked by real tracker", async () => {
      const job1: JobInfo = {
        id: "job-shutdown-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const job2: JobInfo = {
        id: "job-shutdown-2",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
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
      };

      jobTracker.registerJob(jobInfo);
      const promise1 = jobAwaiter.waitForJob("job-cycle-1");

      jobTracker.markCompleted("job-cycle-1", createEmptyConsistencyToken());

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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
      };

      jobTracker.registerJob(jobInfo);
      jobTracker.markRunning("job-cycle-2");

      const promise2 = jobAwaiter.waitForJob("job-cycle-2");

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
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

      const result2 = await promise2;
      expect(result2.status).toBe(JobStatus.WRITE_COMPLETED);
    });
  });
});
