import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { JobStatus } from "../../src/shared/types.js";
import type { JobInfo } from "../../src/shared/types.js";

describe("InMemoryJobTracker", () => {
  let tracker: InMemoryJobTracker;

  beforeEach(() => {
    tracker = new InMemoryJobTracker();
  });

  describe("registerJob", () => {
    it("should register a new job with PENDING status", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      tracker.registerJob(jobInfo);

      const retrieved = tracker.getJobStatus("job-1");
      expect(retrieved).toEqual(jobInfo);
    });

    it("should store a copy of the job info", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      tracker.registerJob(jobInfo);

      // Modify original
      jobInfo.status = JobStatus.COMPLETED;

      // Should not affect stored version
      const retrieved = tracker.getJobStatus("job-1");
      expect(retrieved?.status).toBe(JobStatus.PENDING);
    });
  });

  describe("markRunning", () => {
    it("should update registered job to RUNNING status", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      tracker.registerJob(jobInfo);
      tracker.markRunning("job-1");

      const retrieved = tracker.getJobStatus("job-1");
      expect(retrieved?.status).toBe(JobStatus.RUNNING);
    });

    it("should create entry if job not found", () => {
      tracker.markRunning("unknown-job");

      const retrieved = tracker.getJobStatus("unknown-job");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.status).toBe(JobStatus.RUNNING);
      expect(retrieved?.id).toBe("unknown-job");
    });
  });

  describe("markCompleted", () => {
    it("should update job to COMPLETED status", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
      };

      tracker.registerJob(jobInfo);
      tracker.markCompleted("job-1");

      const retrieved = tracker.getJobStatus("job-1");
      expect(retrieved?.status).toBe(JobStatus.COMPLETED);
      expect(retrieved?.completedAtUtcIso).toBeDefined();
    });

    it("should store result when provided", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
      };

      const result = { data: "success" };
      tracker.registerJob(jobInfo);
      tracker.markCompleted("job-1", result);

      const retrieved = tracker.getJobStatus("job-1");
      expect(retrieved?.result).toEqual(result);
    });

    it("should create entry if job not found", () => {
      tracker.markCompleted("unknown-job", { data: "test" });

      const retrieved = tracker.getJobStatus("unknown-job");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.status).toBe(JobStatus.COMPLETED);
    });
  });

  describe("markFailed", () => {
    it("should update job to FAILED status with error", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
      };

      tracker.registerJob(jobInfo);
      tracker.markFailed("job-1", {
        message: "Something went wrong",
        stack: "",
      });

      const retrieved = tracker.getJobStatus("job-1");
      expect(retrieved?.status).toBe(JobStatus.FAILED);
      expect(retrieved?.error?.message).toBe("Something went wrong");
      expect(retrieved?.completedAtUtcIso).toBeDefined();
    });

    it("should create entry if job not found", () => {
      tracker.markFailed("unknown-job", {
        message: "Error occurred",
        stack: "",
      });

      const retrieved = tracker.getJobStatus("unknown-job");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.status).toBe(JobStatus.FAILED);
      expect(retrieved?.error?.message).toBe("Error occurred");
    });
  });

  describe("getJobStatus", () => {
    it("should return null for non-existent job", () => {
      const retrieved = tracker.getJobStatus("non-existent");
      expect(retrieved).toBeNull();
    });

    it("should return a copy of job info", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      tracker.registerJob(jobInfo);
      const retrieved = tracker.getJobStatus("job-1");

      // Modify retrieved
      retrieved!.status = JobStatus.COMPLETED;

      // Should not affect stored version
      const retrievedAgain = tracker.getJobStatus("job-1");
      expect(retrievedAgain?.status).toBe(JobStatus.PENDING);
    });
  });

  describe("job lifecycle", () => {
    it("should handle PENDING → RUNNING → COMPLETED lifecycle", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      // Register as pending
      tracker.registerJob(jobInfo);
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.PENDING);

      // Mark running
      tracker.markRunning("job-1");
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.RUNNING);

      // Mark completed
      tracker.markCompleted("job-1");
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.COMPLETED);
    });

    it("should handle PENDING → RUNNING → FAILED lifecycle", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      // Register as pending
      tracker.registerJob(jobInfo);
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.PENDING);

      // Mark running
      tracker.markRunning("job-1");
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.RUNNING);

      // Mark failed
      tracker.markFailed("job-1", { message: "Test error", stack: "" });
      const finalStatus = tracker.getJobStatus("job-1");
      expect(finalStatus?.status).toBe(JobStatus.FAILED);
      expect(finalStatus?.error?.message).toBe("Test error");
    });

    it("should handle marking completed before running", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      tracker.registerJob(jobInfo);

      // Skip running and go straight to completed
      tracker.markCompleted("job-1");

      const retrieved = tracker.getJobStatus("job-1");
      expect(retrieved?.status).toBe(JobStatus.COMPLETED);
    });
  });

  describe("multiple jobs", () => {
    it("should track multiple jobs independently", () => {
      const job1: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      const job2: JobInfo = {
        id: "job-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
      };

      tracker.registerJob(job1);
      tracker.registerJob(job2);

      // Update job1
      tracker.markRunning("job-1");
      tracker.markCompleted("job-1");

      // Update job2
      tracker.markRunning("job-2");
      tracker.markFailed("job-2", { message: "Job 2 failed", stack: "" });

      // Verify independent states
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.COMPLETED);
      expect(tracker.getJobStatus("job-2")?.status).toBe(JobStatus.FAILED);
      expect(tracker.getJobStatus("job-2")?.error?.message).toBe(
        "Job 2 failed",
      );
    });
  });
});
