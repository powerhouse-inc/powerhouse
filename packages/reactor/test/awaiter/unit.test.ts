import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import { OperationEventTypes } from "../../src/events/types.js";
import { JobAwaiter } from "../../src/shared/awaiter.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createEmptyConsistencyToken } from "../factories.js";

describe("JobAwaiter", () => {
  let jobAwaiter: JobAwaiter;
  let eventBus: EventBus;
  let getJobStatusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = new EventBus();
    getJobStatusMock = vi.fn();
    jobAwaiter = new JobAwaiter(eventBus, getJobStatusMock);
  });

  afterEach(() => {
    jobAwaiter.shutdown();
    vi.clearAllMocks();
  });

  describe("waitForJob", () => {
    it("should resolve immediately when job is already completed", async () => {
      const jobId = "job-already-completed";
      const completedJob: JobInfo = {
        id: jobId,
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockResolvedValue(completedJob);

      const result = await jobAwaiter.waitForJob(jobId);
      expect(result).toEqual(completedJob);
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);
    });

    it("should resolve immediately when job has WRITE_COMPLETED status", async () => {
      const jobId = "job-write-completed";
      const writeCompletedJob: JobInfo = {
        id: jobId,
        status: JobStatus.WRITE_COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockResolvedValue(writeCompletedJob);

      const result = await jobAwaiter.waitForJob(jobId);
      expect(result).toEqual(writeCompletedJob);
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);
    });

    it("should resolve immediately when job has READ_MODELS_READY status", async () => {
      const jobId = "job-read-models-ready";
      const readModelsReadyJob: JobInfo = {
        id: jobId,
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockResolvedValue(readModelsReadyJob);

      const result = await jobAwaiter.waitForJob(jobId);
      expect(result).toEqual(readModelsReadyJob);
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);
    });

    it("should resolve when job is already failed", async () => {
      const jobId = "job-already-failed";
      const failedJob: JobInfo = {
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        error: { message: "Job failed", stack: "" },
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockResolvedValue(failedJob);

      const result = await jobAwaiter.waitForJob(jobId);
      expect(result).toEqual(failedJob);
      expect(result.status).toBe(JobStatus.FAILED);
    });

    it("should resolve when OPERATION_WRITTEN event is emitted", async () => {
      const jobId = "job-1";
      const runningJob: JobInfo = {
        id: jobId,
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const completedJob: JobInfo = {
        id: jobId,
        status: JobStatus.WRITE_COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockResolvedValue(runningJob);

      const promise = jobAwaiter.waitForJob(jobId);

      await new Promise((resolve) => setTimeout(resolve, 5));

      getJobStatusMock.mockResolvedValue(completedJob);

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        jobId,
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
      expect(result).toEqual(completedJob);
    });

    it("should resolve when OPERATIONS_READY event is emitted", async () => {
      const jobId = "job-2";
      const runningJob: JobInfo = {
        id: jobId,
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const completedJob: JobInfo = {
        id: jobId,
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockResolvedValue(runningJob);

      const promise = jobAwaiter.waitForJob(jobId);

      await new Promise((resolve) => setTimeout(resolve, 5));

      getJobStatusMock.mockResolvedValue(completedJob);

      await eventBus.emit(OperationEventTypes.OPERATIONS_READY, {
        jobId,
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
      expect(result).toEqual(completedJob);
    });

    it("should resolve when JOB_FAILED event is emitted", async () => {
      const jobId = "job-failed";
      const runningJob: JobInfo = {
        id: jobId,
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const failedJob: JobInfo = {
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        error: { message: "Job failed", stack: "" },
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockResolvedValue(runningJob);

      const promise = jobAwaiter.waitForJob(jobId);

      await new Promise((resolve) => setTimeout(resolve, 5));

      getJobStatusMock.mockResolvedValue(failedJob);

      await eventBus.emit(OperationEventTypes.JOB_FAILED, {
        jobId,
        error: new Error("Job failed"),
      });

      const result = await promise;
      expect(result).toEqual(failedJob);
      expect(result.status).toBe(JobStatus.FAILED);
    });

    it("should handle multiple jobs concurrently", async () => {
      const job1: JobInfo = {
        id: "job-1",
        status: JobStatus.WRITE_COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const job2: JobInfo = {
        id: "job-2",
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const job3: JobInfo = {
        id: "job-3",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        error: { message: "Job 3 failed", stack: "" },
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockImplementation((jobId) => {
        if (jobId === "job-1") {
          return Promise.resolve(job1);
        } else if (jobId === "job-2") {
          return Promise.resolve(job2);
        } else if (jobId === "job-3") {
          return Promise.resolve(job3);
        }
        return Promise.reject(new Error("Unknown job"));
      });

      const promise1 = jobAwaiter.waitForJob("job-1");
      const promise2 = jobAwaiter.waitForJob("job-2");
      const promise3 = jobAwaiter.waitForJob("job-3");

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);
      expect(result1).toEqual(job1);
      expect(result2).toEqual(job2);
      expect(result3).toEqual(job3);
    });

    it("should reject when signal is aborted", async () => {
      const jobId = "job-abort";
      const abortController = new AbortController();

      getJobStatusMock.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      });

      const promise = jobAwaiter.waitForJob(jobId, abortController.signal);

      await new Promise((resolve) => setTimeout(resolve, 5));
      abortController.abort();

      await expect(promise).rejects.toThrow("Operation aborted");
    });

    it("should reject if signal is already aborted", async () => {
      const jobId = "job-already-aborted";
      const abortController = new AbortController();
      abortController.abort();

      const promise = jobAwaiter.waitForJob(jobId, abortController.signal);

      await expect(promise).rejects.toThrow("Operation aborted");
      expect(getJobStatusMock).not.toHaveBeenCalled();
    });

    it("should reject when getJobStatus throws an error", async () => {
      const jobId = "job-error";
      const error = new Error("Failed to get job status");

      getJobStatusMock.mockRejectedValueOnce(error);

      const promise = jobAwaiter.waitForJob(jobId);

      await expect(promise).rejects.toThrow("Failed to get job status");
    });

    it("should handle the same job ID being waited on multiple times", async () => {
      const jobId = "job-duplicate";
      const runningJob: JobInfo = {
        id: jobId,
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };
      const completedJob: JobInfo = {
        id: jobId,
        status: JobStatus.WRITE_COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      getJobStatusMock.mockResolvedValue(runningJob);

      const promise1 = jobAwaiter.waitForJob(jobId);
      const promise2 = jobAwaiter.waitForJob(jobId);

      await new Promise((resolve) => setTimeout(resolve, 5));

      getJobStatusMock.mockResolvedValue(completedJob);

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        jobId,
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
      expect(result1).toEqual(completedJob);
      expect(result2).toEqual(completedJob);

      expect(getJobStatusMock).toHaveBeenCalledTimes(3);
    });

    it("should ignore events for unrelated jobs", async () => {
      const jobId = "job-waiting";
      const otherJobId = "job-other";

      getJobStatusMock.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      });

      jobAwaiter.waitForJob(jobId).catch(() => {});

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        jobId: otherJobId,
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

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(getJobStatusMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("shutdown", () => {
    it("should reject all pending jobs when destroyed", async () => {
      const jobId1 = "job-destroy-1";
      const jobId2 = "job-destroy-2";

      getJobStatusMock.mockResolvedValue({
        id: "any",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      });

      const promise1 = jobAwaiter.waitForJob(jobId1);
      const promise2 = jobAwaiter.waitForJob(jobId2);

      await new Promise((resolve) => setTimeout(resolve, 5));

      jobAwaiter.shutdown();

      await expect(promise1).rejects.toThrow("JobAwaiter destroyed");
      await expect(promise2).rejects.toThrow("JobAwaiter destroyed");
    });

    it("should unsubscribe from event bus when destroyed", async () => {
      const jobId = "job-destroy-subscription";

      getJobStatusMock.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      });

      jobAwaiter.waitForJob(jobId).catch(() => {});

      jobAwaiter.shutdown();
      getJobStatusMock.mockClear();

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        jobId,
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

      expect(getJobStatusMock).not.toHaveBeenCalled();
    });
  });
});
