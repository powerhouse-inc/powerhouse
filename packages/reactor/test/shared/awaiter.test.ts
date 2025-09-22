import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobAwaiter } from "../../src/shared/awaiter.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";

describe("JobAwaiter", () => {
  let jobAwaiter: JobAwaiter;
  let getJobStatusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    getJobStatusMock = vi.fn();
    jobAwaiter = new JobAwaiter(getJobStatusMock, 100);
  });

  afterEach(() => {
    jobAwaiter.shutdown();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("waitForJob", () => {
    it("should resolve when job completes successfully", async () => {
      const jobId = "job-1";
      const completedJob: JobInfo = {
        id: jobId,
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      };

      // First call returns pending, second returns completed
      getJobStatusMock
        .mockResolvedValueOnce({
          id: jobId,
          status: JobStatus.PENDING,
          createdAtUtcIso: new Date().toISOString(),
        })
        .mockResolvedValueOnce(completedJob);

      const promise = jobAwaiter.waitForJob(jobId);

      // Advance time to trigger first check
      await vi.advanceTimersByTimeAsync(0);
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);

      // Advance time to trigger second check
      await vi.advanceTimersByTimeAsync(100);
      expect(getJobStatusMock).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toEqual(completedJob);
    });

    it("should resolve when job fails", async () => {
      const jobId = "job-2";
      const failedJob: JobInfo = {
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        error: "Job failed",
      };

      getJobStatusMock.mockResolvedValueOnce(failedJob);

      const promise = jobAwaiter.waitForJob(jobId);

      // Advance time to trigger check
      await vi.advanceTimersByTimeAsync(0);

      const result = await promise;
      expect(result).toEqual(failedJob);
      expect(result.status).toBe(JobStatus.FAILED);
    });

    it("should handle multiple jobs concurrently", async () => {
      const job1: JobInfo = {
        id: "job-1",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      };
      const job2: JobInfo = {
        id: "job-2",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      };
      const job3: JobInfo = {
        id: "job-3",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      };

      let job2Calls = 0;
      let job3Calls = 0;

      // Mock different completion times for each job
      getJobStatusMock.mockImplementation((jobId) => {
        if (jobId === "job-1") {
          return Promise.resolve(job1);
        } else if (jobId === "job-2") {
          job2Calls++;
          // job-2: pending then completed
          if (job2Calls <= 1) {
            return Promise.resolve({
              id: "job-2",
              status: JobStatus.PENDING,
              createdAtUtcIso: new Date().toISOString(),
            });
          }
          return Promise.resolve(job2);
        } else if (jobId === "job-3") {
          job3Calls++;
          // job-3: running then completed
          if (job3Calls <= 1) {
            return Promise.resolve({
              id: "job-3",
              status: JobStatus.RUNNING,
              createdAtUtcIso: new Date().toISOString(),
            });
          }
          return Promise.resolve(job3);
        }
        return Promise.reject(new Error("Unknown job"));
      });

      const promise1 = jobAwaiter.waitForJob("job-1");
      const promise2 = jobAwaiter.waitForJob("job-2");
      const promise3 = jobAwaiter.waitForJob("job-3");

      // First check - job-1 completes
      await vi.advanceTimersByTimeAsync(0);
      expect(await promise1).toEqual(job1);

      // Second check - job-2 and job-3 complete
      await vi.advanceTimersByTimeAsync(100);

      const [result2, result3] = await Promise.all([promise2, promise3]);
      expect(result2).toEqual(job2);
      expect(result3).toEqual(job3);
    });

    it("should reject when signal is aborted", async () => {
      const jobId = "job-abort";
      const abortController = new AbortController();

      getJobStatusMock.mockResolvedValue({
        id: jobId,
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      });

      const promise = jobAwaiter.waitForJob(jobId, abortController.signal);

      // Wait a moment then abort the signal
      await vi.advanceTimersByTimeAsync(5);
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

      // We need to handle the rejection immediately
      const rejectionPromise = expect(promise).rejects.toThrow(
        "Failed to get job status",
      );

      // Advance time to trigger check
      await vi.advanceTimersByTimeAsync(0);

      await rejectionPromise;
    });

    it("should stop interval when all jobs complete", async () => {
      const job1: JobInfo = {
        id: "job-1",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      };
      const job2: JobInfo = {
        id: "job-2",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      };

      getJobStatusMock.mockImplementation((jobId) => {
        if (jobId === "job-1") {
          return Promise.resolve(job1);
        } else if (jobId === "job-2") {
          return Promise.resolve(job2);
        }
        return Promise.reject(new Error("Unknown job"));
      });

      const promise1 = jobAwaiter.waitForJob("job-1");
      const promise2 = jobAwaiter.waitForJob("job-2");

      // Initial check
      await vi.advanceTimersByTimeAsync(0);

      await Promise.all([promise1, promise2]);

      // Clear mock to track new calls
      getJobStatusMock.mockClear();

      // Advance time - no more checks should occur
      await vi.advanceTimersByTimeAsync(500);
      expect(getJobStatusMock).not.toHaveBeenCalled();
    });

    it("should continue polling while jobs are pending", async () => {
      const jobId = "job-long-running";

      getJobStatusMock
        .mockResolvedValueOnce({
          id: jobId,
          status: JobStatus.PENDING,
          createdAtUtcIso: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          id: jobId,
          status: JobStatus.RUNNING,
          createdAtUtcIso: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          id: jobId,
          status: JobStatus.RUNNING,
          createdAtUtcIso: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          id: jobId,
          status: JobStatus.COMPLETED,
          createdAtUtcIso: new Date().toISOString(),
        });

      const promise = jobAwaiter.waitForJob(jobId);

      // Advance through multiple polling cycles
      await vi.advanceTimersByTimeAsync(0);
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(getJobStatusMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(100);
      expect(getJobStatusMock).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(100);
      expect(getJobStatusMock).toHaveBeenCalledTimes(4);

      const result = await promise;
      expect(result.status).toBe(JobStatus.COMPLETED);
    });

    it("should handle the same job ID being waited on multiple times", async () => {
      const jobId = "job-duplicate";
      const completedJob: JobInfo = {
        id: jobId,
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      };

      getJobStatusMock.mockResolvedValue(completedJob);

      // Start waiting for the same job twice
      const promise1 = jobAwaiter.waitForJob(jobId);
      const promise2 = jobAwaiter.waitForJob(jobId);

      // Advance time to trigger check
      await vi.advanceTimersByTimeAsync(0);

      // Both promises should resolve with the same result
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toEqual(completedJob);
      expect(result2).toEqual(completedJob);

      // Should only check status once per interval
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("shutdown", () => {
    it("should reject all pending jobs when destroyed", async () => {
      const jobId1 = "job-destroy-1";
      const jobId2 = "job-destroy-2";

      getJobStatusMock.mockResolvedValue({
        id: "any",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      });

      const promise1 = jobAwaiter.waitForJob(jobId1);
      const promise2 = jobAwaiter.waitForJob(jobId2);

      // Shutdown the awaiter
      jobAwaiter.shutdown();

      await expect(promise1).rejects.toThrow("JobAwaiter destroyed");
      await expect(promise2).rejects.toThrow("JobAwaiter destroyed");
    });

    it("should stop interval when destroyed", async () => {
      const jobId = "job-destroy-interval";

      getJobStatusMock.mockResolvedValue({
        id: jobId,
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      });

      jobAwaiter.waitForJob(jobId).catch(() => {
        // Expected rejection
      });

      // Initial check
      await vi.advanceTimersByTimeAsync(0);
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);

      // Destroy the awaiter
      jobAwaiter.shutdown();
      getJobStatusMock.mockClear();

      // Advance time - no more checks should occur
      await vi.advanceTimersByTimeAsync(500);
      expect(getJobStatusMock).not.toHaveBeenCalled();
    });
  });

  describe("interval management", () => {
    it("should start interval only when first job is added", async () => {
      // No jobs yet, advance time
      await vi.advanceTimersByTimeAsync(200);
      expect(getJobStatusMock).not.toHaveBeenCalled();

      // Add first job
      getJobStatusMock.mockResolvedValue({
        id: "job-1",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      });

      const promise = jobAwaiter.waitForJob("job-1");

      // Should check immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);

      await promise;
    });

    it("should use custom poll interval", async () => {
      // Create awaiter with 50ms interval
      const customAwaiter = new JobAwaiter(getJobStatusMock, 50);

      const jobId = "job-custom-interval";
      getJobStatusMock
        .mockResolvedValueOnce({
          id: jobId,
          status: JobStatus.PENDING,
          createdAtUtcIso: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          id: jobId,
          status: JobStatus.PENDING,
          createdAtUtcIso: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          id: jobId,
          status: JobStatus.COMPLETED,
          createdAtUtcIso: new Date().toISOString(),
        });

      const promise = customAwaiter.waitForJob(jobId);

      // Initial check
      await vi.advanceTimersByTimeAsync(0);
      expect(getJobStatusMock).toHaveBeenCalledTimes(1);

      // After 50ms
      await vi.advanceTimersByTimeAsync(50);
      expect(getJobStatusMock).toHaveBeenCalledTimes(2);

      // After another 50ms
      await vi.advanceTimersByTimeAsync(50);
      expect(getJobStatusMock).toHaveBeenCalledTimes(3);

      await promise;
      customAwaiter.shutdown();
    });
  });
});
