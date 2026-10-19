import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { JobResultHandler } from "../../../src/executor/job-result-handler.js";
import { InMemoryJobTracker } from "../../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import type { Job, JobKind } from "../../../src/queue/types.js";
import { NullDocumentModelResolver } from "../../../src/registry/document-model-resolver.js";
import {
  DocumentNotDeletedError,
  DocumentNotFoundError,
  DocumentPurgedError,
  GroupInUseError,
  PurgeTooLargeError,
  ReservedActionError,
} from "../../../src/shared/errors.js";
import { JobStatus } from "../../../src/shared/types.js";

const ERRORS: [string, () => Error][] = [
  ["DocumentPurgedError", () => new DocumentPurgedError("doc-1")],
  ["DocumentNotDeletedError", () => new DocumentNotDeletedError("doc-1")],
  ["GroupInUseError", () => new GroupInUseError("doc-1", ["doc-2"])],
  ["PurgeTooLargeError", () => new PurgeTooLargeError("doc-1", 10, 5)],
  [
    "ReservedActionError",
    () => new ReservedActionError("doc-1", "PURGE_DOCUMENT"),
  ],
];

function rehydrated(make: () => Error): Error {
  const original = make();
  const error = new Error(original.message);
  error.name = original.name;
  return error;
}

function logger(): ILogger {
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

function job(id: string, kind: JobKind): Job {
  return {
    id,
    kind,
    documentId: "doc-1",
    scope: "document",
    branch: "main",
    actions: [],
    operations: [],
    createdAt: new Date().toISOString(),
    queueHint: [],
    retryCount: 0,
    maxRetries: 5,
    errorHistory: [],
    meta: { batchId: `batch-${id}`, batchJobIds: [id] },
  };
}

describe("purge errors are terminal", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;
  let tracker: InMemoryJobTracker;
  let handler: JobResultHandler;
  let retry: ReturnType<typeof vi.spyOn>;
  let counter = 0;

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus, new NullDocumentModelResolver());
    tracker = new InMemoryJobTracker(eventBus);
    handler = new JobResultHandler(
      queue,
      tracker,
      new NullDocumentModelResolver(),
      logger(),
    );
    retry = vi.spyOn(queue, "retryJob");
  });

  afterEach(() => {
    tracker.shutdown();
  });

  async function fail(kind: JobKind, error: Error) {
    const queued = job(`job-${++counter}`, kind);
    await queue.enqueue(queued);
    const handle = await queue.dequeueNext();
    expect(handle?.job.id).toBe(queued.id);
    handle!.start();
    const failed = new Promise<void>((resolve) => {
      const off = eventBus.subscribe(ReactorEventTypes.JOB_FAILED, () => {
        off();
        resolve();
      });
    });
    const deferJob = vi.fn();
    await handler.handleResult(
      handle!,
      { success: false, job: queued, error },
      { deferJob, flushDeferredFor: () => Promise.resolve() },
    );
    await failed;
    return { info: tracker.getJobStatus(queued.id), deferJob };
  }

  describe.each(ERRORS)("%s", (name, make) => {
    it.each<JobKind>(["mutation", "load", "reevaluation", "purge"])(
      "fails a %s job without retry, name intact on JobInfo.error",
      async (kind) => {
        const { info, deferJob } = await fail(kind, make());
        expect(retry).not.toHaveBeenCalled();
        expect(deferJob).not.toHaveBeenCalled();
        expect(info?.status).toBe(JobStatus.FAILED);
        expect(info?.error?.name).toBe(name);
      },
    );

    it("is classified by name after the worker boundary", async () => {
      const { info } = await fail("load", rehydrated(make));
      expect(retry).not.toHaveBeenCalled();
      expect(info?.error?.name).toBe(name);
    });
  });

  it("still defers a load whose document is merely not found", async () => {
    const queued = job(`job-${++counter}`, "load");
    await queue.enqueue(queued);
    const handle = (await queue.dequeueNext())!;
    handle.start();
    const deferJob = vi.fn();
    const defer = vi.spyOn(handle, "defer");
    await handler.handleResult(
      handle,
      { success: false, job: queued, error: new DocumentNotFoundError("x") },
      { deferJob, flushDeferredFor: () => Promise.resolve() },
    );
    expect(defer).toHaveBeenCalledTimes(1);
    expect(deferJob).toHaveBeenCalledWith("x", queued);
  });
});

describe("DocumentPurgedError", () => {
  it("is a DocumentNotFoundError by class and by name", () => {
    const error = new DocumentPurgedError("doc-1");
    expect(error).toBeInstanceOf(DocumentNotFoundError);
    expect(error.documentId).toBe("doc-1");
    expect(DocumentNotFoundError.isError(error)).toBe(true);
    expect(DocumentNotFoundError.isError(rehydrated(() => error))).toBe(true);
    expect(DocumentPurgedError.isError(error)).toBe(true);
    expect(DocumentPurgedError.isError(new DocumentNotFoundError("x"))).toBe(
      false,
    );
  });
});
