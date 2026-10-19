import type { ILogger } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/events/event-bus.js";
import type { JobFailedEvent } from "../../../src/events/types.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { JobResultHandler } from "../../../src/executor/job-result-handler.js";
import type { JobResult } from "../../../src/executor/types.js";
import { InMemoryJobTracker } from "../../../src/job-tracker/in-memory-job-tracker.js";
import type { IJobTracker } from "../../../src/job-tracker/interfaces.js";
import type { IQueue } from "../../../src/queue/interfaces.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import type { IJobExecutionHandle, Job } from "../../../src/queue/types.js";
import { JobQueueState, RetryAccounting } from "../../../src/queue/types.js";
import type { IDocumentModelResolver } from "../../../src/registry/document-model-resolver.js";
import { NullDocumentModelResolver } from "../../../src/registry/document-model-resolver.js";
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

    resolver = {
      ensureModelLoaded: vi.fn().mockResolvedValue(undefined),
      recoverMissingModel: vi.fn().mockResolvedValue(undefined),
    };

    logger = createMockLogger();

    handler = new JobResultHandler(queue, jobTracker, resolver, logger);

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
    it("calls resolver.recoverMissingModel and queue.retryJob on success", async () => {
      const error = new ModuleNotFoundError("test/type");
      const job = createTestJob({ maxRetries: 3 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(resolver.recoverMissingModel).toHaveBeenCalledWith(
        "test/type",
        undefined,
      );
      expect(queue.retryJob).toHaveBeenCalledWith(job.id, expect.any(Object));
    });

    it("falls through to terminal failure when recoverMissingModel throws", async () => {
      vi.mocked(resolver.recoverMissingModel).mockRejectedValue(
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

    it("fails the job once retries are spent though the model loads", async () => {
      const realEventBus = new EventBus();
      const realQueue = new InMemoryQueue(
        realEventBus,
        new NullDocumentModelResolver(),
      );
      const realHandler = new JobResultHandler(
        realQueue,
        jobTracker,
        resolver,
        createMockLogger(),
      );
      const failed: JobFailedEvent[] = [];
      realEventBus.subscribe(
        ReactorEventTypes.JOB_FAILED,
        (_type: number, data: JobFailedEvent) => {
          failed.push(data);
        },
      );

      await realQueue.enqueue(createTestJob({ id: "P", maxRetries: 3 }));
      await realQueue.enqueue(createTestJob({ id: "L", maxRetries: 3 }));

      const dispatched: string[] = [];
      for (let i = 0; i < 10; i++) {
        const handle = await realQueue.dequeueNext();
        if (!handle) {
          break;
        }
        handle.start();
        dispatched.push(handle.job.id);
        if (handle.job.id === "L") {
          handle.complete();
          continue;
        }
        await realHandler.handleResult(
          handle,
          {
            success: false,
            job: handle.job,
            error: new ModuleNotFoundError("test/type", 2),
          },
          callbacks(),
        );
      }

      expect(dispatched).toEqual(["P", "P", "P", "P", "L"]);
      await vi.waitFor(() => {
        expect(failed.map((e) => e.jobId)).toEqual(["P"]);
      });
      expect(failed[0].error.name).toBe("ModuleNotFoundError");
    });

    it("falls through to terminal failure when retryJob throws after model load", async () => {
      vi.mocked(queue.retryJob).mockRejectedValue(new Error("retry failed"));
      const error = new ModuleNotFoundError("test/type");
      const job = createTestJob({ retryCount: 0, maxRetries: 1 });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(resolver.recoverMissingModel).toHaveBeenCalled();
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
      const job = createTestJob({
        kind: "load",
        documentId: "missing-doc",
        maxRetries: 3,
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(handle.defer).toHaveBeenCalledTimes(1);
      expect(deferJobMock).toHaveBeenCalledWith("missing-doc", job);
      expect(queue.retryJob).not.toHaveBeenCalled();
      expect(jobTracker.markFailed).not.toHaveBeenCalled();
    });

    it("does not fail the job on defer, so nothing emits JOB_FAILED", async () => {
      const error = new DocumentNotFoundError("missing-doc");
      const job = createTestJob({ kind: "load", documentId: "missing-doc" });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(handle.fail).not.toHaveBeenCalled();
      expect(jobTracker.markFailed).not.toHaveBeenCalled();
    });

    it("holds the job against the document the error names", async () => {
      // A relationship reads its source, so the document a flush has to create
      // is not always the one the job is keyed by.
      const error = new DocumentNotFoundError("missing-source");
      const job = createTestJob({ kind: "load", documentId: "other-doc" });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(deferJobMock).toHaveBeenCalledWith("missing-source", job);
    });

    it("fails a mutation at once rather than holding it", async () => {
      // Nothing in flight creates a document the caller named wrong, so holding
      // it would only delay the refusal until the deferral deadline.
      const error = new DocumentNotFoundError("missing-doc");
      const job = createTestJob({
        kind: "mutation",
        documentId: "missing-doc",
        maxRetries: 3,
      });
      const handle = createTestHandle(job);
      const result: JobResult = { success: false, job, error };

      await handler.handleResult(handle, result, callbacks());

      expect(handle.defer).not.toHaveBeenCalled();
      expect(deferJobMock).not.toHaveBeenCalled();
      expect(queue.retryJob).not.toHaveBeenCalled();
      expect(jobTracker.markFailed).toHaveBeenCalledWith(
        job.id,
        expect.any(Object),
        job,
      );
      expect(handle.fail).toHaveBeenCalledTimes(1);
      expect(handle.fail).toHaveBeenCalledWith(
        expect.objectContaining({ name: error.name, source: error }),
      );
    });
  });

  describe("DocumentDeletedError", () => {
    it("marks failed and fails the handle with the typed error as source", async () => {
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
      expect(handle.fail).toHaveBeenCalledTimes(1);
      expect(handle.fail).toHaveBeenCalledWith(
        expect.objectContaining({ name: error.name, source: error }),
      );
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

    it("marks failed and fails the handle with the typed error as source", async () => {
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
      expect(handle.fail).toHaveBeenCalledTimes(1);
      expect(handle.fail).toHaveBeenCalledWith(
        expect.objectContaining({ name: error.name, source: error }),
      );
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

    it("marks failed and fails the handle with the typed error as source", async () => {
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
      expect(handle.fail).toHaveBeenCalledTimes(1);
      expect(handle.fail).toHaveBeenCalledWith(
        expect.objectContaining({ name: error.name, source: error }),
      );
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
      expect(handle.fail).toHaveBeenCalledTimes(1);
      // The record names the retry failure; the job's own error rides along
      // as source so the queue's JOB_FAILED still carries the typed instance.
      expect(handle.fail).toHaveBeenCalledWith(
        expect.objectContaining({ message: "queue broken", source: error }),
      );
    });
  });

  describe("terminal failure path (retryCount >= maxRetries)", () => {
    it("marks failed and fails the handle with the typed error as source when retries exhausted", async () => {
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
      expect(handle.fail).toHaveBeenCalledTimes(1);
      expect(handle.fail).toHaveBeenCalledWith(
        expect.objectContaining({ source: error }),
      );
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
      // The attempt that ended the job is the one a consumer classifies by,
      // so the aggregate record keeps its typed instance.
      expect(capturedErrors[0].source).toBe(currentError);
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

  describe("terminal failures emit exactly one JOB_FAILED, carrying the typed error", () => {
    let realEventBus: EventBus;
    let realQueue: InMemoryQueue;
    let realTracker: InMemoryJobTracker;
    let realHandler: JobResultHandler;
    let failedEvents: JobFailedEvent[];

    beforeEach(() => {
      realEventBus = new EventBus();
      realQueue = new InMemoryQueue(
        realEventBus,
        new NullDocumentModelResolver(),
      );
      realTracker = new InMemoryJobTracker(realEventBus);
      realHandler = new JobResultHandler(
        realQueue,
        realTracker,
        {
          ensureModelLoaded: vi.fn().mockResolvedValue(undefined),
          recoverMissingModel: vi.fn().mockResolvedValue(undefined),
        },
        createMockLogger(),
      );
      failedEvents = [];
      realEventBus.subscribe(
        ReactorEventTypes.JOB_FAILED,
        (_type: number, data: JobFailedEvent) => {
          failedEvents.push(data);
        },
      );
    });

    /** Enqueues the job and runs it to a live handle the queue resolves. */
    async function dequeueStarted(job: Job): Promise<IJobExecutionHandle> {
      await realQueue.enqueue(job);
      const handle = await realQueue.dequeueNext();
      expect(handle?.job.id).toBe(job.id);
      handle!.start();
      return handle!;
    }

    /** Waits for the first event, then long enough for a duplicate to land. */
    async function settle(): Promise<void> {
      await vi.waitFor(() => {
        expect(failedEvents.length).toBeGreaterThanOrEqual(1);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    it("deterministic error: one event, error is the typed instance", async () => {
      // The handler used to emit directly and handle.fail re-emitted through
      // queue.failJob, so every deterministic failure reached subscribers
      // twice - once typed, once as a reconstructed plain Error.
      const error = new DocumentNotFoundError("missing-doc");
      const job = createTestJob({ id: "deterministic-job" });
      const handle = await dequeueStarted(job);

      await realHandler.handleResult(
        handle,
        { success: false, job, error },
        callbacks(),
      );
      await settle();

      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].jobId).toBe("deterministic-job");
      expect(failedEvents[0].error).toBe(error);
      expect(failedEvents[0].error).toBeInstanceOf(DocumentNotFoundError);
      expect(failedEvents[0].error.message).toBe(error.message);
      expect(failedEvents[0].job?.id).toBe("deterministic-job");
    });

    it("retry-infrastructure failure: one event, error is the job's typed error", async () => {
      vi.spyOn(realQueue, "retryJob").mockRejectedValue(
        new Error("queue broken"),
      );
      const transient = new Error("transient failure");
      const job = createTestJob({
        id: "retry-broken-job",
        retryCount: 0,
        maxRetries: 3,
      });
      const handle = await dequeueStarted(job);

      await realHandler.handleResult(
        handle,
        { success: false, job, error: transient },
        callbacks(),
      );
      await settle();

      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].jobId).toBe("retry-broken-job");
      expect(failedEvents[0].error).toBe(transient);
      expect(failedEvents[0].error.message).toBe("transient failure");
      expect(failedEvents[0].job?.id).toBe("retry-broken-job");
    });

    it("retries exhausted: one event, error is the final attempt's typed instance", async () => {
      const error = new Error("final attempt failed");
      error.name = "ReducerExplodedError";
      const job = createTestJob({
        id: "exhausted-job",
        retryCount: 3,
        maxRetries: 3,
        errorHistory: [
          { name: "Error", message: "attempt 1 failed", stack: "" },
        ],
      });
      const handle = await dequeueStarted(job);

      await realHandler.handleResult(
        handle,
        { success: false, job, error },
        callbacks(),
      );
      await settle();

      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].jobId).toBe("exhausted-job");
      expect(failedEvents[0].error).toBe(error);
      expect(failedEvents[0].error.name).toBe("ReducerExplodedError");
      expect(failedEvents[0].error.message).toBe("final attempt failed");
      expect(failedEvents[0].job?.id).toBe("exhausted-job");
      // The aggregate attempt history still reaches consumers on the job the
      // event carries, even though the event's error is the final attempt.
      expect(failedEvents[0].job?.lastError?.message).toContain(
        "attempt 1 failed",
      );
      expect(failedEvents[0].job?.lastError?.message).toContain(
        "final attempt failed",
      );
    });
  });
});
