import type { ILogger } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IEventBus } from "../../../src/events/interfaces.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { JobResultHandler } from "../../../src/executor/job-result-handler.js";
import type { JobResult } from "../../../src/executor/types.js";
import type { IJobTracker } from "../../../src/job-tracker/interfaces.js";
import type { IQueue } from "../../../src/queue/interfaces.js";
import type { IJobExecutionHandle, Job } from "../../../src/queue/types.js";
import { JobQueueState, RetryAccounting } from "../../../src/queue/types.js";
import type { IDocumentModelResolver } from "../../../src/registry/document-model-resolver.js";
import { ModuleNotFoundError } from "../../../src/registry/errors.js";
import {
  AuthTimestampNotMonotonicError,
  DocumentDeletedError,
  DocumentNotFoundError,
  InvalidOperationTimestampError,
} from "../../../src/shared/errors.js";
import type { ErrorInfo } from "../../../src/shared/types.js";
import { AppendConditionFailedError } from "../../../src/storage/interfaces.js";

function createTestJob(overrides: Partial<Job> = {}): Job {
  const id = overrides.id ?? "job-1";
  return {
    id,
    kind: "mutation",
    documentId: "doc-1",
    scope: "global",
    branch: "main",
    actions: [],
    operations: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    queueHint: [],
    retryCount: 0,
    maxRetries: 0,
    errorHistory: [],
    meta: { batchId: `test-${id}`, batchJobIds: [id] },
    ...overrides,
  };
}

type MockHandle = {
  job: Job;
  state: JobQueueState;
  start: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
  defer: ReturnType<typeof vi.fn>;
};

function createTestHandle(job: Job): MockHandle & IJobExecutionHandle {
  const handle = {
    job,
    state: JobQueueState.RUNNING,
    start: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    defer: vi.fn(),
  };
  return handle as unknown as MockHandle & IJobExecutionHandle;
}

function createMockLogger(): ILogger {
  return {
    level: "error",
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: vi.fn(),
  } as unknown as ILogger;
}

describe("JobResultHandler", () => {
  let queue: IQueue;
  let jobTracker: IJobTracker;
  let eventBus: IEventBus;
  let resolver: IDocumentModelResolver;
  let logger: ILogger;
  let handler: JobResultHandler;
  let deferJobMock: ReturnType<typeof vi.fn>;
  let flushDeferredForMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queue = {
      retryJob: vi.fn().mockResolvedValue(undefined),
      enqueue: vi.fn().mockResolvedValue(undefined),
    } as unknown as IQueue;

    jobTracker = {
      markFailed: vi.fn(),
    } as unknown as IJobTracker;

    eventBus = {
      emit: vi.fn().mockResolvedValue(undefined),
    } as unknown as IEventBus;

    resolver = {
      ensureModelLoaded: vi.fn().mockResolvedValue(undefined),
    };

    logger = createMockLogger();

    handler = new JobResultHandler(
      queue,
      jobTracker,
      eventBus,
      resolver,
      logger,
    );

    deferJobMock = vi.fn();
    flushDeferredForMock = vi.fn().mockResolvedValue(undefined);
  });

  function callbacks() {
    return {
      deferJob: deferJobMock as unknown as (
        documentId: string,
        job: Job,
      ) => void,
      flushDeferredFor: flushDeferredForMock as unknown as (
        documentId: string,
      ) => Promise<void>,
    };
  }

  describe("success path", () => {
    it("calls handle.complete() on success", async () => {
      const job = createTestJob();
      const handle = createTestHandle(job);
      const result: JobResult = { success: true, job, duration: 10 };

      await handler.handleResult(handle, result, callbacks());

      expect(handle.complete).toHaveBeenCalledTimes(1);
    });

    it("calls flushDeferredFor when job contains CREATE_DOCUMENT action", async () => {
      const job = createTestJob({
        actions: [
          {
            id: "a1",
            type: "CREATE_DOCUMENT",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { protocolVersions: { "base-reducer": 2 } },
          },
        ],
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: true, job, duration: 10 };

      await handler.handleResult(handle, result, callbacks());

      expect(flushDeferredForMock).toHaveBeenCalledWith(job.documentId);
    });

    it("does NOT call flushDeferredFor when job has no CREATE_DOCUMENT", async () => {
      const job = createTestJob({
        actions: [
          {
            id: "a1",
            type: "UPDATE_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {},
          },
        ],
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: true, job, duration: 10 };

      await handler.handleResult(handle, result, callbacks());

      expect(flushDeferredForMock).not.toHaveBeenCalled();
    });
  });

  describe("model recovery (ModuleNotFoundError)", () => {
    it("calls resolver.ensureModelLoaded and queue.retryJob on success", async () => {
      const error = new ModuleNotFoundError("test/type");
      const job = createTestJob({ maxRetries: 3 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(resolver.ensureModelLoaded).toHaveBeenCalledWith("test/type");
      expect(queue.retryJob).toHaveBeenCalledWith(job.id, expect.any(Object));
    });

    it("falls through to terminal failure when ensureModelLoaded throws", async () => {
      vi.mocked(resolver.ensureModelLoaded).mockRejectedValue(
        new Error("load failed"),
      );
      const error = new ModuleNotFoundError("bad/type");
      const job = createTestJob({ retryCount: 0, maxRetries: 0 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(queue.retryJob).not.toHaveBeenCalled();
      expect(jobTracker.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Object),
        job,
      );
      expect(handle.fail).toHaveBeenCalledTimes(1);
    });

    it("falls through to terminal failure when retryJob throws after model load", async () => {
      vi.mocked(queue.retryJob).mockRejectedValue(new Error("retry failed"));
      const error = new ModuleNotFoundError("test/type");
      const job = createTestJob({ retryCount: 0, maxRetries: 0 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(resolver.ensureModelLoaded).toHaveBeenCalled();
      expect(jobTracker.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Object),
        job,
      );
      expect(handle.fail).toHaveBeenCalledTimes(1);
    });
  });

  describe("DocumentNotFoundError", () => {
    it("calls handle.defer() and deferJob callback without consuming a retry", async () => {
      const error = new DocumentNotFoundError("missing-doc");
      const job = createTestJob({ documentId: "missing-doc", maxRetries: 3 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(handle.defer).toHaveBeenCalledTimes(1);
      expect(deferJobMock).toHaveBeenCalledWith("missing-doc", job);
      expect(queue.retryJob).not.toHaveBeenCalled();
      expect(jobTracker.markFailed).not.toHaveBeenCalled();
    });

    it("does not emit JOB_FAILED on defer", async () => {
      const error = new DocumentNotFoundError("missing-doc");
      const job = createTestJob({ documentId: "missing-doc" });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe("DocumentDeletedError", () => {
    it("marks failed, emits JOB_FAILED, and calls handle.fail()", async () => {
      const error = new DocumentDeletedError(
        "deleted-doc",
        "2024-01-01T00:00:00Z",
      );
      const job = createTestJob({ documentId: "deleted-doc", maxRetries: 3 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(jobTracker.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Object),
        job,
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        ReactorEventTypes.JOB_FAILED,
        expect.objectContaining({ jobId: job.id, error }),
      );
      expect(handle.fail).toHaveBeenCalledTimes(1);
    });

    it("does not consume a retry for DocumentDeletedError", async () => {
      const error = new DocumentDeletedError(
        "deleted-doc",
        "2024-01-01T00:00:00Z",
      );
      const job = createTestJob({ retryCount: 0, maxRetries: 5 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(queue.retryJob).not.toHaveBeenCalled();
    });
  });

  /**
   * The rule is deterministic on every attempt, so a retry only re-runs the whole
   * load to fail identically. It has to be terminal or it burns every retry.
   */
  describe("AuthTimestampNotMonotonicError", () => {
    function violation(): AuthTimestampNotMonotonicError {
      return new AuthTimestampNotMonotonicError(
        "held-doc",
        "main",
        "2026-01-01T00:00:01.000Z",
        "2026-01-01T00:00:02.000Z",
      );
    }

    it("marks failed, emits JOB_FAILED, and calls handle.fail()", async () => {
      const error = violation();
      const job = createTestJob({ documentId: "held-doc", maxRetries: 3 });
      const handle = createTestHandle(job);

      await handler.handleResult(
        handle,
        { success: false, job, error },
        callbacks(),
      );

      expect(jobTracker.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Object),
        job,
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        ReactorEventTypes.JOB_FAILED,
        expect.objectContaining({ jobId: job.id, error }),
      );
      expect(handle.fail).toHaveBeenCalledTimes(1);
    });

    it("consumes no retry", async () => {
      const job = createTestJob({ retryCount: 0, maxRetries: 5 });
      const handle = createTestHandle(job);

      await handler.handleResult(
        handle,
        { success: false, job, error: violation() },
        callbacks(),
      );

      expect(queue.retryJob).not.toHaveBeenCalled();
    });
  });

  /**
   * A malformed timestamp is the same on every attempt, so it is terminal
   * rather than burning the retry budget.
   */
  describe("InvalidOperationTimestampError", () => {
    function malformed(): InvalidOperationTimestampError {
      return new InvalidOperationTimestampError(
        "doc-1",
        "auth",
        "not-a-timestamp",
        "auth operation",
      );
    }

    it("marks failed, emits JOB_FAILED, and calls handle.fail()", async () => {
      const error = malformed();
      const job = createTestJob({ maxRetries: 3 });
      const handle = createTestHandle(job);

      await handler.handleResult(
        handle,
        { success: false, job, error },
        callbacks(),
      );

      expect(jobTracker.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Object),
        job,
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        ReactorEventTypes.JOB_FAILED,
        expect.objectContaining({ jobId: job.id, error }),
      );
      expect(handle.fail).toHaveBeenCalledTimes(1);
    });

    it("consumes no retry", async () => {
      const job = createTestJob({ retryCount: 0, maxRetries: 5 });
      const handle = createTestHandle(job);

      await handler.handleResult(
        handle,
        { success: false, job, error: malformed() },
        callbacks(),
      );

      expect(queue.retryJob).not.toHaveBeenCalled();
    });
  });

  describe("retry path (retryCount < maxRetries)", () => {
    it("calls queue.retryJob when retries remain", async () => {
      const error = new Error("transient failure");
      const job = createTestJob({ retryCount: 1, maxRetries: 3 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(queue.retryJob).toHaveBeenCalledWith(job.id, expect.any(Object));
      expect(jobTracker.markFailed).not.toHaveBeenCalled();
    });

    it("falls through to terminal failure when queue.retryJob throws", async () => {
      vi.mocked(queue.retryJob).mockRejectedValue(new Error("queue broken"));
      const error = new Error("transient failure");
      const job = createTestJob({ retryCount: 1, maxRetries: 3 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(jobTracker.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Object),
        job,
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        ReactorEventTypes.JOB_FAILED,
        expect.objectContaining({ jobId: job.id }),
      );
      expect(handle.fail).toHaveBeenCalledTimes(1);
    });
  });

  describe("terminal failure path (retryCount >= maxRetries)", () => {
    it("marks failed and emits JOB_FAILED when retries exhausted", async () => {
      const error = new Error("permanent failure");
      const job = createTestJob({ retryCount: 3, maxRetries: 3 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(jobTracker.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Object),
        job,
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        ReactorEventTypes.JOB_FAILED,
        expect.objectContaining({ jobId: job.id, error }),
      );
      expect(handle.fail).toHaveBeenCalledTimes(1);
    });

    it("includes aggregated error history in the failure info", async () => {
      const prevError: ErrorInfo = {
        name: "Error",
        message: "attempt 1 error",
        stack: "",
      };
      const currentError = new Error("attempt 2 error");
      const job = createTestJob({
        retryCount: 1,
        maxRetries: 1,
        errorHistory: [prevError],
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error: currentError };

      const capturedErrors: ErrorInfo[] = [];
      vi.mocked(jobTracker.markFailed).mockImplementation(
        (_id: string, errorInfo: ErrorInfo) => {
          capturedErrors.push(errorInfo);
        },
      );

      await handler.handleResult(handle, result, callbacks());

      expect(capturedErrors).toHaveLength(1);
      expect(capturedErrors[0].message).toContain("2 attempts");
      expect(capturedErrors[0].message).toContain("attempt 1 error");
      expect(capturedErrors[0].message).toContain("attempt 2 error");
    });

    it("returns the single error directly when no prior error history", async () => {
      const error = new Error("sole failure");
      const job = createTestJob({
        retryCount: 0,
        maxRetries: 0,
        errorHistory: [],
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      const capturedErrors: ErrorInfo[] = [];
      vi.mocked(jobTracker.markFailed).mockImplementation(
        (_id: string, errorInfo: ErrorInfo) => {
          capturedErrors.push(errorInfo);
        },
      );

      await handler.handleResult(handle, result, callbacks());

      expect(capturedErrors[0].message).toBe("sole failure");
    });

    it("handles missing error in result by using 'Unknown error'", async () => {
      const job = createTestJob({ retryCount: 0, maxRetries: 0 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job };

      const capturedErrors: ErrorInfo[] = [];
      vi.mocked(jobTracker.markFailed).mockImplementation(
        (_id: string, errorInfo: ErrorInfo) => {
          capturedErrors.push(errorInfo);
        },
      );

      await handler.handleResult(handle, result, callbacks());

      expect(capturedErrors[0].message).toBe("Unknown error");
    });
  });

  describe("AppendConditionFailedError (uncounted retry)", () => {
    it("retries without counting toward the retry limit", async () => {
      const job = createTestJob({ retryCount: 5, maxRetries: 0 });
      const handle = createTestHandle(job);
      const result: JobResult = {
        success: false,
        job,
        error: new AppendConditionFailedError({
          streams: [
            { documentId: "doc-1", scope: "auth", branch: "main", revision: 3 },
          ],
        }),
      };

      await handler.handleResult(handle, result, callbacks());

      expect(queue.retryJob).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({
          message: expect.stringContaining("Append condition failed"),
        }),
        RetryAccounting.ExemptFromLimit,
      );
      expect(jobTracker.markFailed).not.toHaveBeenCalled();
      expect(handle.fail).not.toHaveBeenCalled();
      expect(handle.defer).not.toHaveBeenCalled();
    });

    it("stops exempting once the job has lost the race too many times", async () => {
      const conflict = new AppendConditionFailedError({
        streams: [
          { documentId: "doc-1", scope: "auth", branch: "main", revision: 3 },
        ],
      });
      const job = createTestJob({
        retryCount: 0,
        maxRetries: 0,
        errorHistory: Array.from({ length: 20 }, () => ({
          name: "Error",
          message: conflict.message,
          stack: "",
        })),
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error: conflict };

      await handler.handleResult(handle, result, callbacks());

      expect(queue.retryJob).not.toHaveBeenCalled();
      expect(jobTracker.markFailed).toHaveBeenCalled();
      expect(handle.fail).toHaveBeenCalled();
    });

    it("keeps exempting while the job is still under the bound", async () => {
      const conflict = new AppendConditionFailedError({
        streams: [
          { documentId: "doc-1", scope: "auth", branch: "main", revision: 3 },
        ],
      });
      const job = createTestJob({
        retryCount: 0,
        maxRetries: 0,
        errorHistory: Array.from({ length: 19 }, () => ({
          name: "Error",
          message: conflict.message,
          stack: "",
        })),
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error: conflict };

      await handler.handleResult(handle, result, callbacks());

      expect(queue.retryJob).toHaveBeenCalledWith(
        job.id,
        expect.anything(),
        RetryAccounting.ExemptFromLimit,
      );
    });

    it("does not count unrelated failures toward the conflict bound", async () => {
      const conflict = new AppendConditionFailedError({
        streams: [
          { documentId: "doc-1", scope: "auth", branch: "main", revision: 3 },
        ],
      });
      const job = createTestJob({
        retryCount: 0,
        maxRetries: 0,
        errorHistory: Array.from({ length: 40 }, () => ({
          name: "Error",
          message: "some unrelated reducer failure",
          stack: "",
        })),
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error: conflict };

      await handler.handleResult(handle, result, callbacks());

      expect(queue.retryJob).toHaveBeenCalledWith(
        job.id,
        expect.anything(),
        RetryAccounting.ExemptFromLimit,
      );
    });

    it("classifies by error name, surviving worker-boundary rehydration", async () => {
      const job = createTestJob({ retryCount: 5, maxRetries: 0 });
      const handle = createTestHandle(job);
      const rehydrated = new Error("Append condition failed: rehydrated");
      rehydrated.name = "AppendConditionFailedError";
      const result: JobResult = { success: false, job, error: rehydrated };

      await handler.handleResult(handle, result, callbacks());

      expect(queue.retryJob).toHaveBeenCalledWith(
        job.id,
        expect.anything(),
        RetryAccounting.ExemptFromLimit,
      );
      expect(jobTracker.markFailed).not.toHaveBeenCalled();
    });

    it("falls through to the normal failure path when the retry itself fails", async () => {
      const job = createTestJob({ retryCount: 5, maxRetries: 0 });
      const handle = createTestHandle(job);
      vi.mocked(queue.retryJob).mockRejectedValue(new Error("queue down"));
      const result: JobResult = {
        success: false,
        job,
        error: new AppendConditionFailedError({ streams: [] }),
      };

      await handler.handleResult(handle, result, callbacks());

      expect(jobTracker.markFailed).toHaveBeenCalled();
      expect(handle.fail).toHaveBeenCalled();
    });
  });
});
