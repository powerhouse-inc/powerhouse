import { describe, expect, it, vi } from "vitest";
import { JobExecutionHandle } from "../../src/queue/job-execution-handle.js";
import { JobQueueState } from "../../src/queue/types.js";
import { createTestJob } from "../factories.js";

describe("JobExecutionHandle", () => {
  describe("constructor", () => {
    it("should initialize with provided job and state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(handle.job).toEqual(job);
      expect(handle.state).toBe(JobQueueState.READY);
    });

    it("should accept callbacks", () => {
      const job = createTestJob();
      const onStart = vi.fn();
      const onComplete = vi.fn();
      const onFail = vi.fn();

      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
        onComplete,
        onFail,
      });

      expect(handle.job).toEqual(job);
      expect(handle.state).toBe(JobQueueState.READY);
    });
  });

  describe("start", () => {
    it("should transition from READY to RUNNING", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      handle.start();

      expect(handle.state).toBe(JobQueueState.RUNNING);
    });

    it("should call onStart callback when starting", () => {
      const job = createTestJob();
      const onStart = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
      });

      handle.start();

      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("should throw error if not in READY state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RUNNING);

      expect(() => handle.start()).toThrow("Cannot start job in state RUNNING");
    });

    it("should throw error if already RESOLVED", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RESOLVED);

      expect(() => handle.start()).toThrow(
        "Cannot start job in state RESOLVED",
      );
    });
  });

  describe("complete", () => {
    it("should transition from RUNNING to RESOLVED", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      handle.start();
      handle.complete();

      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });

    it("should call onComplete callback when completing", () => {
      const job = createTestJob();
      const onComplete = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onComplete,
      });

      handle.start();
      handle.complete();

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("should throw error if not in RUNNING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(() => handle.complete()).toThrow(
        "Cannot complete job in state READY",
      );
    });

    it("should throw error if already RESOLVED", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RESOLVED);

      expect(() => handle.complete()).toThrow(
        "Cannot complete job in state RESOLVED",
      );
    });
  });

  describe("fail", () => {
    it("should transition from RUNNING to RESOLVED", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      handle.start();
      handle.fail("Test error");

      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });

    it("should call onFail callback with reason when failing", () => {
      const job = createTestJob();
      const onFail = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onFail,
      });

      handle.start();
      handle.fail("Test error");

      expect(onFail).toHaveBeenCalledTimes(1);
      expect(onFail).toHaveBeenCalledWith("Test error");
    });

    it("should throw error if not in RUNNING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(() => handle.fail("Test error")).toThrow(
        "Cannot fail job in state READY",
      );
    });

    it("should throw error if already RESOLVED", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RESOLVED);

      expect(() => handle.fail("Test error")).toThrow(
        "Cannot fail job in state RESOLVED",
      );
    });
  });

  describe("state transitions", () => {
    it("should follow complete lifecycle: READY -> RUNNING -> RESOLVED (complete)", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(handle.state).toBe(JobQueueState.READY);

      handle.start();
      expect(handle.state).toBe(JobQueueState.RUNNING);

      handle.complete();
      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });

    it("should follow failure lifecycle: READY -> RUNNING -> RESOLVED (fail)", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(handle.state).toBe(JobQueueState.READY);

      handle.start();
      expect(handle.state).toBe(JobQueueState.RUNNING);

      handle.fail("Test error");
      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });

    it("should not allow transitions after RESOLVED", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      handle.start();
      handle.complete();

      expect(() => handle.start()).toThrow();
      expect(() => handle.complete()).toThrow();
      expect(() => handle.fail("error")).toThrow();
    });
  });

  describe("callbacks", () => {
    it("should handle missing callbacks gracefully", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(() => {
        handle.start();
        handle.complete();
      }).not.toThrow();
    });

    it("should call callbacks in order for complete flow", () => {
      const job = createTestJob();
      const order: string[] = [];

      const onStart = vi.fn(() => order.push("start"));
      const onComplete = vi.fn(() => order.push("complete"));

      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
        onComplete,
      });

      handle.start();
      handle.complete();

      expect(order).toEqual(["start", "complete"]);
    });

    it("should call callbacks in order for failure flow", () => {
      const job = createTestJob();
      const order: string[] = [];

      const onStart = vi.fn(() => order.push("start"));
      const onFail = vi.fn(() => order.push("fail"));

      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
        onFail,
      });

      handle.start();
      handle.fail("Test error");

      expect(order).toEqual(["start", "fail"]);
    });

    it("should not call onComplete when failing", () => {
      const job = createTestJob();
      const onComplete = vi.fn();
      const onFail = vi.fn();

      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onComplete,
        onFail,
      });

      handle.start();
      handle.fail("Test error");

      expect(onComplete).not.toHaveBeenCalled();
      expect(onFail).toHaveBeenCalledTimes(1);
    });

    it("should not call onFail when completing", () => {
      const job = createTestJob();
      const onComplete = vi.fn();
      const onFail = vi.fn();

      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onComplete,
        onFail,
      });

      handle.start();
      handle.complete();

      expect(onFail).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe("job property", () => {
    it("should be readonly and return the same job", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      const job1 = handle.job;
      const job2 = handle.job;

      expect(job1).toBe(job);
      expect(job2).toBe(job);
      expect(job1).toBe(job2);
    });

    it("should preserve all job properties", () => {
      const job = createTestJob({
        id: "test-job-id",
        documentId: "test-doc",
        scope: "test-scope",
        branch: "test-branch",
        retryCount: 2,
        maxRetries: 5,
        lastError: "previous error",
      });

      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(handle.job.id).toBe("test-job-id");
      expect(handle.job.documentId).toBe("test-doc");
      expect(handle.job.scope).toBe("test-scope");
      expect(handle.job.branch).toBe("test-branch");
      expect(handle.job.retryCount).toBe(2);
      expect(handle.job.maxRetries).toBe(5);
      expect(handle.job.lastError).toBe("previous error");
    });
  });

  describe("edge cases", () => {
    it("should handle rapid state transitions", () => {
      const job = createTestJob();
      const onStart = vi.fn();
      const onComplete = vi.fn();

      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
        onComplete,
      });

      handle.start();
      handle.complete();

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });

    it("should handle callbacks that throw errors", () => {
      const job = createTestJob();
      const onStart = vi.fn(() => {
        throw new Error("Callback error");
      });

      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
      });

      expect(() => handle.start()).toThrow("Callback error");
      // State should still transition despite callback error
      expect(handle.state).toBe(JobQueueState.RUNNING);
    });

    it("should initialize with different starting states", () => {
      const job = createTestJob();

      const handle1 = new JobExecutionHandle(job, JobQueueState.PREPROCESSING);
      expect(handle1.state).toBe(JobQueueState.PREPROCESSING);

      const handle2 = new JobExecutionHandle(job, JobQueueState.PENDING);
      expect(handle2.state).toBe(JobQueueState.PENDING);

      const handle3 = new JobExecutionHandle(job, JobQueueState.UNKNOWN);
      expect(handle3.state).toBe(JobQueueState.UNKNOWN);
    });
  });
});
