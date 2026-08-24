import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/events/event-bus.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import type { IJobExecutor } from "../../../src/executor/interfaces.js";
import { SimpleJobExecutorManager } from "../../../src/executor/simple-job-executor-manager.js";
import { InMemoryJobTracker } from "../../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import { NullDocumentModelResolver } from "../../../src/registry/document-model-resolver.js";
import { DocumentNotFoundError } from "../../../src/shared/errors.js";
import { JobStatus } from "../../../src/shared/types.js";
import { createMockLogger, createTestJob } from "../../factories.js";

const DOC = "policied-doc";

/** Long enough that the timeout cannot rescue the hold under test. */
const NO_RESCUE_MS = 10_000;
/** Short enough to assert against, long enough to survive a slow runner. */
const TTL_MS = 60;

const settled = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `updateOutbox` sorts a backfill page by scope as a raw string, so a document's
 * `auth` run is served before the `document` run that creates it, and the
 * creation is emitted depending on the auth run
 * (docs/updateoutbox-scope-ordering.md). This is what the receiver then does
 * with that pair.
 *
 * The auth run is deferred because its document is missing, and a hold is
 * released by a completed CREATE_DOCUMENT for that id -- which is the job
 * waiting on it. Deferral moves no status and emits no event, so before #2918
 * bounded the hold neither side could move and nothing was reported.
 */
describe("a document's creation queued behind its own deferred auth run", () => {
  let eventBus: IEventBus;
  let queue: InMemoryQueue;
  let jobTracker: InMemoryJobTracker;
  let manager: SimpleJobExecutorManager;
  let executed: string[];

  /** Defers anything in the auth scope; every other scope succeeds. */
  const authDefersExecutor = (): IJobExecutor => ({
    executeJob: vi
      .fn()
      .mockImplementation((job: { id: string; scope: string }) => {
        executed.push(job.id);
        if (job.scope === "auth") {
          return Promise.resolve({
            success: false,
            error: new DocumentNotFoundError(DOC),
          });
        }
        return Promise.resolve({ success: true, operations: [] });
      }),
  });

  const startManager = (ttlMs: number) => {
    manager = new SimpleJobExecutorManager(
      () => authDefersExecutor(),
      eventBus,
      queue,
      jobTracker,
      createMockLogger(),
      new NullDocumentModelResolver(),
      30_000,
      ttlMs,
    );
    return manager.start(1);
  };

  const authJob = () =>
    createTestJob({
      id: "auth-job",
      kind: "load",
      documentId: DOC,
      scope: "auth",
      maxRetries: 0,
    });

  const createJob = (queueHint: string[]) =>
    createTestJob({
      id: "create-job",
      kind: "load",
      documentId: DOC,
      scope: "document",
      maxRetries: 0,
      queueHint,
    });

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus, new NullDocumentModelResolver());
    jobTracker = new InMemoryJobTracker(eventBus);
    executed = [];
  });

  afterEach(async () => {
    await manager.stop(false);
  });

  it("never dispatches the creation while the hold lasts", async () => {
    await startManager(NO_RESCUE_MS);
    await queue.enqueue(authJob());
    await queue.enqueue(createJob(["auth-job"]));

    await settled();

    // The held job's status does not move, which is why nothing surfaced this:
    // RUNNING is not terminal, so no dead letter and no failed caller.
    expect(jobTracker.getJobStatus("auth-job")?.status).toBe(JobStatus.RUNNING);
    // The creation is never even registered, let alone executed.
    expect(executed).toEqual(["auth-job"]);
    expect(jobTracker.getJobStatus("create-job")).toBeNull();
  });

  it("needs the inverted dependency -- a held job alone does not block its document", async () => {
    await startManager(NO_RESCUE_MS);
    await queue.enqueue(authJob());
    await queue.enqueue(createJob([]));

    await settled();

    // Worth pinning: per-document serialization does NOT hold the creation, so
    // the emitted dependency is what turns a deferral into a deadlock.
    expect(executed).toContain("create-job");
  });

  it("dispatches the creation once the hold times out", async () => {
    await startManager(TTL_MS);
    await queue.enqueue(authJob());
    await queue.enqueue(createJob(["auth-job"]));

    await settled();

    expect(jobTracker.getJobStatus("auth-job")?.status).toBe(JobStatus.FAILED);
    expect(executed).toContain("create-job");
  });
});
