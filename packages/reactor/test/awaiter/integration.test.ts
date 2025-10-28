import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import type { IJobTracker } from "../../src/job-tracker/interfaces.js";
import { JobAwaiter } from "../../src/shared/awaiter.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";

describe("JobAwaiter Integration Tests", () => {
  let jobAwaiter: JobAwaiter;
  let jobTracker: IJobTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    jobTracker = new InMemoryJobTracker();
    jobAwaiter = new JobAwaiter((jobId) => {
      const status = jobTracker.getJobStatus(jobId);
      if (!status) {
        return Promise.reject(new Error(`Job not found: ${jobId}`));
      }
      return Promise.resolve(status);
    }, 100);
  });

  afterEach(() => {
    jobAwaiter.shutdown();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("Integration with Real JobTracker", () => {
    it("should wait for job completion using real job tracker", async () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-1");

      await vi.advanceTimersByTimeAsync(0);
      expect(jobTracker.getJobStatus("job-1")?.status).toBe(JobStatus.PENDING);

      jobTracker.markRunning("job-1");

      await vi.advanceTimersByTimeAsync(100);

      jobTracker.markCompleted("job-1", { data: "success" });

      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.result).toEqual({ data: "success" });
    });

    it("should handle job failure through real job tracker", async () => {
      const jobInfo: JobInfo = {
        id: "job-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-2");

      await vi.advanceTimersByTimeAsync(0);

      jobTracker.markRunning("job-2");
      await vi.advanceTimersByTimeAsync(100);

      jobTracker.markFailed("job-2", {
        message: "Job execution failed",
        stack: "",
      });
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error?.message).toBe("Job execution failed");
    });

    it("should handle complete job lifecycle PENDING → RUNNING → COMPLETED", async () => {
      const jobInfo: JobInfo = {
        id: "job-3",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-3");

      await vi.advanceTimersByTimeAsync(0);
      expect(jobTracker.getJobStatus("job-3")?.status).toBe(JobStatus.PENDING);

      jobTracker.markRunning("job-3");
      await vi.advanceTimersByTimeAsync(100);
      expect(jobTracker.getJobStatus("job-3")?.status).toBe(JobStatus.RUNNING);

      jobTracker.markCompleted("job-3", { result: "completed" });
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.result).toEqual({ result: "completed" });
    });

    it("should handle multiple concurrent jobs with real job tracker", async () => {
      const job1: JobInfo = {
        id: "job-concurrent-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };
      const job2: JobInfo = {
        id: "job-concurrent-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };
      const job3: JobInfo = {
        id: "job-concurrent-3",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(job1);
      jobTracker.registerJob(job2);
      jobTracker.registerJob(job3);

      const promise1 = jobAwaiter.waitForJob("job-concurrent-1");
      const promise2 = jobAwaiter.waitForJob("job-concurrent-2");
      const promise3 = jobAwaiter.waitForJob("job-concurrent-3");

      await vi.advanceTimersByTimeAsync(0);

      jobTracker.markCompleted("job-concurrent-1");
      await vi.advanceTimersByTimeAsync(100);

      const result1 = await promise1;
      expect(result1.status).toBe(JobStatus.COMPLETED);

      jobTracker.markRunning("job-concurrent-2");
      await vi.advanceTimersByTimeAsync(100);

      jobTracker.markFailed("job-concurrent-2", {
        message: "Job 2 failed",
        stack: "",
      });
      jobTracker.markCompleted("job-concurrent-3");
      await vi.advanceTimersByTimeAsync(100);

      const [result2, result3] = await Promise.all([promise2, promise3]);
      expect(result2.status).toBe(JobStatus.FAILED);
      expect(result3.status).toBe(JobStatus.COMPLETED);
    });

    it("should reject when job is not found in tracker", async () => {
      const promise = jobAwaiter.waitForJob("non-existent-job");

      const rejectionPromise = expect(promise).rejects.toThrow(
        "Job not found: non-existent-job",
      );

      await vi.advanceTimersByTimeAsync(0);

      await rejectionPromise;
    });

    it("should handle same job being waited on multiple times", async () => {
      const jobInfo: JobInfo = {
        id: "job-duplicate",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);

      const promise1 = jobAwaiter.waitForJob("job-duplicate");
      const promise2 = jobAwaiter.waitForJob("job-duplicate");

      await vi.advanceTimersByTimeAsync(0);

      jobTracker.markCompleted("job-duplicate", { data: "shared result" });
      await vi.advanceTimersByTimeAsync(100);

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
      };

      jobTracker.registerJob(jobInfo);

      const controller = new AbortController();
      const promise = jobAwaiter.waitForJob("job-abort", controller.signal);

      await vi.advanceTimersByTimeAsync(50);

      controller.abort();

      await expect(promise).rejects.toThrow("Operation aborted");
    });

    it("should handle long-running jobs with multiple status checks", async () => {
      const jobInfo: JobInfo = {
        id: "job-long-running",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-long-running");

      await vi.advanceTimersByTimeAsync(0);
      expect(jobTracker.getJobStatus("job-long-running")?.status).toBe(
        JobStatus.PENDING,
      );

      await vi.advanceTimersByTimeAsync(100);
      expect(jobTracker.getJobStatus("job-long-running")?.status).toBe(
        JobStatus.PENDING,
      );

      jobTracker.markRunning("job-long-running");
      await vi.advanceTimersByTimeAsync(100);
      expect(jobTracker.getJobStatus("job-long-running")?.status).toBe(
        JobStatus.RUNNING,
      );

      await vi.advanceTimersByTimeAsync(100);
      expect(jobTracker.getJobStatus("job-long-running")?.status).toBe(
        JobStatus.RUNNING,
      );

      jobTracker.markCompleted("job-long-running");
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result.status).toBe(JobStatus.COMPLETED);
    });

    it("should reject when job is not found after registration", async () => {
      const promise = jobAwaiter.waitForJob("job-not-registered");

      const rejectionPromise = expect(promise).rejects.toThrow(
        "Job not found: job-not-registered",
      );

      await vi.advanceTimersByTimeAsync(0);

      await rejectionPromise;
    });

    it("should properly clean up when jobs complete", async () => {
      const job1: JobInfo = {
        id: "job-cleanup-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };
      const job2: JobInfo = {
        id: "job-cleanup-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(job1);
      jobTracker.registerJob(job2);

      const promise1 = jobAwaiter.waitForJob("job-cleanup-1");
      const promise2 = jobAwaiter.waitForJob("job-cleanup-2");

      await vi.advanceTimersByTimeAsync(0);

      jobTracker.markCompleted("job-cleanup-1");
      jobTracker.markCompleted("job-cleanup-2");
      await vi.advanceTimersByTimeAsync(100);

      await Promise.all([promise1, promise2]);

      await vi.advanceTimersByTimeAsync(500);
    });

    it("should handle immediate job completion", async () => {
      const jobInfo: JobInfo = {
        id: "job-immediate",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        completedAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-immediate");

      await vi.advanceTimersByTimeAsync(0);

      const result = await promise;
      expect(result.status).toBe(JobStatus.COMPLETED);
    });

    it("should handle job completion with result data", async () => {
      const jobInfo: JobInfo = {
        id: "job-with-result",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);

      const promise = jobAwaiter.waitForJob("job-with-result");

      await vi.advanceTimersByTimeAsync(0);

      const resultData = {
        documentId: "doc-123",
        operationCount: 5,
        metadata: { processed: true },
      };

      jobTracker.markCompleted("job-with-result", resultData);
      await vi.advanceTimersByTimeAsync(100);

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
      };
      const job2: JobInfo = {
        id: "job-shutdown-2",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(job1);
      jobTracker.registerJob(job2);

      const promise1 = jobAwaiter.waitForJob("job-shutdown-1");
      const promise2 = jobAwaiter.waitForJob("job-shutdown-2");

      jobAwaiter.shutdown();

      await expect(promise1).rejects.toThrow("JobAwaiter destroyed");
      await expect(promise2).rejects.toThrow("JobAwaiter destroyed");
    });

    it("should work correctly after multiple start-stop cycles", async () => {
      let jobInfo: JobInfo = {
        id: "job-cycle-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);
      const promise1 = jobAwaiter.waitForJob("job-cycle-1");

      await vi.advanceTimersByTimeAsync(0);

      jobTracker.markCompleted("job-cycle-1");
      await vi.advanceTimersByTimeAsync(100);

      await promise1;

      jobInfo = {
        id: "job-cycle-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      jobTracker.registerJob(jobInfo);
      const promise2 = jobAwaiter.waitForJob("job-cycle-2");

      await vi.advanceTimersByTimeAsync(0);

      jobTracker.markCompleted("job-cycle-2");
      await vi.advanceTimersByTimeAsync(100);

      await promise2;
    });
  });
});
