import { describe, expect, it, beforeEach } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { JobStatus } from "../../src/shared/types.js";
import type { JobInfo } from "../../src/shared/types.js";
import { createEmptyConsistencyToken } from "../factories.js";

describe("InMemoryJobTracker", () => {
  let tracker: InMemoryJobTracker;

  beforeEach(() => {
    tracker = new InMemoryJobTracker(new EventBus());
  });

  describe("registerJob", () => {
    it("should register a new job with PENDING status", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
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
        consistencyToken: createEmptyConsistencyToken(),
      };

      tracker.registerJob(jobInfo);

      // Modify original
      jobInfo.status = JobStatus.READ_MODELS_READY;

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
        consistencyToken: createEmptyConsistencyToken(),
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

  describe("markFailed", () => {
    it("should update job to FAILED status with error", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
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
        consistencyToken: createEmptyConsistencyToken(),
      };

      tracker.registerJob(jobInfo);
      const retrieved = tracker.getJobStatus("job-1");

      // Modify retrieved
      retrieved!.status = JobStatus.READ_MODELS_READY;

      // Should not affect stored version
      const retrievedAgain = tracker.getJobStatus("job-1");
      expect(retrievedAgain?.status).toBe(JobStatus.PENDING);
    });
  });

  describe("job lifecycle", () => {
    it("should handle PENDING → RUNNING lifecycle", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      // Register as pending
      tracker.registerJob(jobInfo);
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.PENDING);

      // Mark running
      tracker.markRunning("job-1");
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.RUNNING);
    });

    it("should handle PENDING → RUNNING → FAILED lifecycle", () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
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
  });

  describe("multiple jobs", () => {
    it("should track multiple jobs independently", () => {
      const job1: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const job2: JobInfo = {
        id: "job-2",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      tracker.registerJob(job1);
      tracker.registerJob(job2);

      // Update job1
      tracker.markRunning("job-1");

      // Update job2
      tracker.markRunning("job-2");
      tracker.markFailed("job-2", { message: "Job 2 failed", stack: "" });

      // Verify independent states
      expect(tracker.getJobStatus("job-1")?.status).toBe(JobStatus.RUNNING);
      expect(tracker.getJobStatus("job-2")?.status).toBe(JobStatus.FAILED);
      expect(tracker.getJobStatus("job-2")?.error?.message).toBe(
        "Job 2 failed",
      );
    });
  });
});
