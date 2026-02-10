import { describe, expect, it, vi } from "vitest";
import { JobExecutionHandle } from "../../src/queue/job-execution-handle.js";
import type { Job } from "../../src/queue/types.js";
import { JobQueueState } from "../../src/queue/types.js";
import { createTestJob } from "../factories.js";

describe("JobExecutionHandle", () => {
  describe("constructor", () => {
    it("should initialize with job and state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(handle.job).toBe(job);
      expect(handle.state).toBe(JobQueueState.READY);
    });

    it("should initialize with callbacks", () => {
      const job = createTestJob();
      const onStart = vi.fn();
      const onComplete = vi.fn();
      const onFail = vi.fn();

      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
        onComplete,
        onFail,
      });

      expect(handle.job).toBe(job);
      expect(handle.state).toBe(JobQueueState.READY);
    });

    it("should initialize without callbacks", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(handle.job).toBe(job);
    });

    it("should initialize with PREPROCESSING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.PREPROCESSING);

      expect(handle.state).toBe(JobQueueState.PREPROCESSING);
    });

    it("should initialize with PENDING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.PENDING);

      expect(handle.state).toBe(JobQueueState.PENDING);
    });

    it("should initialize with RUNNING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RUNNING);

      expect(handle.state).toBe(JobQueueState.RUNNING);
    });

    it("should initialize with RESOLVED state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RESOLVED);

      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });
  });

  describe("start", () => {
    it("should transition from READY to RUNNING", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      handle.start();

      expect(handle.state).toBe(JobQueueState.RUNNING);
    });

    it("should call onStart callback", () => {
      const job = createTestJob();
      const onStart = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
      });

      handle.start();

      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("should throw when starting from PREPROCESSING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.PREPROCESSING);

      expect(() => handle.start()).toThrow(
        "Cannot start job in state PREPROCESSING",
      );
    });

    it("should throw when starting from PENDING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.PENDING);

      expect(() => handle.start()).toThrow("Cannot start job in state PENDING");
    });

    it("should throw when starting from RUNNING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RUNNING);

      expect(() => handle.start()).toThrow("Cannot start job in state RUNNING");
    });

    it("should throw when starting from RESOLVED state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RESOLVED);

      expect(() => handle.start()).toThrow(
        "Cannot start job in state RESOLVED",
      );
    });

    it("should allow callback to throw without preventing state change", () => {
      const job = createTestJob();
      const onStart = vi.fn().mockImplementation(() => {
        throw new Error("onStart error");
      });
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
      });

      expect(() => handle.start()).toThrow("onStart error");
      expect(handle.state).toBe(JobQueueState.RUNNING);
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

    it("should call onComplete callback", () => {
      const job = createTestJob();
      const onComplete = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onComplete,
      });
      handle.start();

      handle.complete();

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("should throw when completing from PREPROCESSING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.PREPROCESSING);

      expect(() => handle.complete()).toThrow(
        "Cannot complete job in state PREPROCESSING",
      );
    });

    it("should throw when completing from PENDING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.PENDING);

      expect(() => handle.complete()).toThrow(
        "Cannot complete job in state PENDING",
      );
    });

    it("should throw when completing from READY state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(() => handle.complete()).toThrow(
        "Cannot complete job in state READY",
      );
    });

    it("should throw when completing from RESOLVED state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RESOLVED);

      expect(() => handle.complete()).toThrow(
        "Cannot complete job in state RESOLVED",
      );
    });

    it("should allow callback to throw without preventing state change", () => {
      const job = createTestJob();
      const onComplete = vi.fn().mockImplementation(() => {
        throw new Error("onComplete error");
      });
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onComplete,
      });
      handle.start();

      expect(() => handle.complete()).toThrow("onComplete error");
      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });
  });

  describe("fail", () => {
    it("should transition from RUNNING to RESOLVED", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);
      handle.start();

      handle.fail({ message: "Test error", stack: "" });

      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });

    it("should call onFail callback with error info", () => {
      const job = createTestJob();
      const onFail = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onFail,
      });
      handle.start();

      const errorInfo = { message: "Test error", stack: "test stack" };
      handle.fail(errorInfo);

      expect(onFail).toHaveBeenCalledTimes(1);
      expect(onFail).toHaveBeenCalledWith(errorInfo);
    });

    it("should throw when failing from PREPROCESSING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.PREPROCESSING);

      expect(() => handle.fail({ message: "error", stack: "" })).toThrow(
        "Cannot fail job in state PREPROCESSING",
      );
    });

    it("should throw when failing from PENDING state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.PENDING);

      expect(() => handle.fail({ message: "error", stack: "" })).toThrow(
        "Cannot fail job in state PENDING",
      );
    });

    it("should throw when failing from READY state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY);

      expect(() => handle.fail({ message: "error", stack: "" })).toThrow(
        "Cannot fail job in state READY",
      );
    });

    it("should throw when failing from RESOLVED state", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.RESOLVED);

      expect(() => handle.fail({ message: "error", stack: "" })).toThrow(
        "Cannot fail job in state RESOLVED",
      );
    });

    it("should allow callback to throw without preventing state change", () => {
      const job = createTestJob();
      const onFail = vi.fn().mockImplementation(() => {
        throw new Error("onFail error");
      });
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onFail,
      });
      handle.start();

      expect(() => handle.fail({ message: "error", stack: "" })).toThrow(
        "onFail error",
      );
      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });
  });

  describe("getStateName", () => {
    it("should return UNKNOWN for invalid state values", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(
        job,
        999 as unknown as JobQueueState,
      );

      expect(() => handle.start()).toThrow("Cannot start job in state UNKNOWN");
    });
  });

  describe("edge cases", () => {
    it("should handle job with all properties", () => {
      const job: Job = {
        id: "test-job-id",
        kind: "mutation",
        documentId: "test-doc-id",
        scope: "global",
        branch: "main",
        actions: [],
        operations: [],
        createdAt: "2023-01-01T00:00:00Z",
        queueHint: ["dep-1", "dep-2"],
        retryCount: 2,
        maxRetries: 5,
        errorHistory: [{ message: "previous error", stack: "" }],
        meta: { batchId: "test", batchJobIds: ["test-job-id"] },
      };

      const handle = new JobExecutionHandle(job, JobQueueState.READY);
      expect(handle.job).toBe(job);
      expect(handle.job.retryCount).toBe(2);
      expect(handle.job.errorHistory).toHaveLength(1);
    });

    it("should work without any callbacks", () => {
      const job = createTestJob();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {});

      handle.start();
      expect(handle.state).toBe(JobQueueState.RUNNING);

      handle.complete();
      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });

    it("should work with only onStart callback", () => {
      const job = createTestJob();
      const onStart = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onStart,
      });

      handle.start();
      expect(onStart).toHaveBeenCalled();

      handle.complete();
      expect(handle.state).toBe(JobQueueState.RESOLVED);
    });

    it("should work with only onComplete callback", () => {
      const job = createTestJob();
      const onComplete = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onComplete,
      });

      handle.start();
      handle.complete();

      expect(onComplete).toHaveBeenCalled();
    });

    it("should work with only onFail callback", () => {
      const job = createTestJob();
      const onFail = vi.fn();
      const handle = new JobExecutionHandle(job, JobQueueState.READY, {
        onFail,
      });

      handle.start();
      handle.fail({ message: "test", stack: "" });

      expect(onFail).toHaveBeenCalled();
    });
  });
});
