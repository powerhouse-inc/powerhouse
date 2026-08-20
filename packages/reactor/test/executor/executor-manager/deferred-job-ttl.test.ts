import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/events/event-bus.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import {
  ReactorEventTypes,
  type JobFailedEvent,
} from "../../../src/events/types.js";
import type { IJobExecutor } from "../../../src/executor/interfaces.js";
import { SimpleJobExecutorManager } from "../../../src/executor/simple-job-executor-manager.js";
import { InMemoryJobTracker } from "../../../src/job-tracker/in-memory-job-tracker.js";
import { JobStatus } from "../../../src/shared/types.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import { NullDocumentModelResolver } from "../../../src/registry/document-model-resolver.js";
import { DocumentNotFoundError } from "../../../src/shared/errors.js";
import { JobAwaiter } from "../../../src/shared/awaiter.js";
import { createMockLogger, createTestJob } from "../../factories.js";

/** Short enough to assert against, long enough to survive a slow runner. */
const TTL_MS = 60;

const settled = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

describe("a deferred job that its document never arrives for", () => {
  let eventBus: IEventBus;
  let queue: InMemoryQueue;
  let jobTracker: InMemoryJobTracker;
  let manager: SimpleJobExecutorManager;

  const missingDocumentExecutor = (): IJobExecutor => ({
    executeJob: vi.fn().mockResolvedValue({
      success: false,
      error: new DocumentNotFoundError("missing-doc"),
    }),
  });

  const startManager = (executor: IJobExecutor, ttlMs = TTL_MS) => {
    manager = new SimpleJobExecutorManager(
      () => executor,
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

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus, new NullDocumentModelResolver());
    jobTracker = new InMemoryJobTracker(eventBus);
  });

  afterEach(async () => {
    await manager.stop(false);
  });

  it("reaches FAILED without the reactor being stopped", async () => {
    await startManager(missingDocumentExecutor());
    const job = createTestJob({
      id: "held-job",
      kind: "load",
      documentId: "missing-doc",
      scope: "global",
      maxRetries: 3,
    });
    await queue.enqueue(job);

    await settled();

    const status = jobTracker.getJobStatus("held-job");
    expect(status?.status).toBe(JobStatus.FAILED);
    expect(status?.error?.name).toBe("DocumentNotFoundError");
  });

  it("rejects a caller waiting on it, which nothing else does", async () => {
    await startManager(missingDocumentExecutor());
    const awaiter = new JobAwaiter(eventBus, (jobId) => {
      const status = jobTracker.getJobStatus(jobId);
      if (!status) throw new Error(`unknown job ${jobId}`);
      return Promise.resolve(status);
    });

    const job = createTestJob({
      id: "awaited-job",
      kind: "load",
      documentId: "missing-doc",
      scope: "global",
    });
    jobTracker.registerJob({
      id: job.id,
      documentId: job.documentId,
      status: JobStatus.PENDING,
      createdAtUtcIso: new Date().toISOString(),
      consistencyToken: {
        version: 1,
        createdAtUtcIso: new Date().toISOString(),
        coordinates: [],
      },
      meta: { batchId: job.id, batchJobIds: [job.id] },
    });
    await queue.enqueue(job);

    const settledJob = await awaiter.waitForJob("awaited-job");

    expect(settledJob.status).toBe(JobStatus.FAILED);
    expect(settledJob.error?.name).toBe("DocumentNotFoundError");
  });

  it("emits JOB_FAILED naming the document it waited for", async () => {
    await startManager(missingDocumentExecutor());
    const failures: JobFailedEvent[] = [];
    eventBus.subscribe(
      ReactorEventTypes.JOB_FAILED,
      (_type: number, data: JobFailedEvent) => {
        failures.push(data);
      },
    );

    await queue.enqueue(
      createTestJob({
        id: "held-job",
        kind: "load",
        documentId: "missing-doc",
        scope: "global",
      }),
    );

    await settled();

    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].jobId).toBe("held-job");
    expect(failures[0].error).toBeInstanceOf(DocumentNotFoundError);
    expect((failures[0].error as DocumentNotFoundError).documentId).toBe(
      "missing-doc",
    );
  });

  it("releases a job that declared a dependency on it", async () => {
    // The queue only runs a job once every id it depends on is resolved, and
    // deferring resolves nothing - so a dependent of a job deferred forever is
    // stranded whether or not its own document exists.
    const executor: IJobExecutor = {
      executeJob: vi.fn().mockImplementation((job: { documentId: string }) =>
        job.documentId === "missing-doc"
          ? {
              success: false,
              error: new DocumentNotFoundError("missing-doc"),
            }
          : { success: true, duration: 1 },
      ),
    };
    await startManager(executor);

    await queue.enqueue(
      createTestJob({
        id: "blocker",
        kind: "load",
        documentId: "missing-doc",
        scope: "global",
      }),
    );
    await queue.enqueue(
      createTestJob({
        id: "dependent",
        kind: "load",
        documentId: "other-doc",
        scope: "global",
        queueHint: ["blocker"],
      }),
    );

    await settled();

    expect(jobTracker.getJobStatus("blocker")?.status).toBe(JobStatus.FAILED);
    const ran = (
      executor.executeJob as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => (call[0] as { id: string }).id);
    expect(ran).toContain("dependent");
  });

  it("is not how a mutation naming a missing document is answered", async () => {
    // Nothing in flight creates a document a caller got wrong, so waiting out
    // the deadline would only delay the refusal. A long TTL is passed so that a
    // deferral, if it happened, could not be mistaken for a prompt failure.
    const executor = missingDocumentExecutor();
    await startManager(executor, 10_000);

    await queue.enqueue(
      createTestJob({
        id: "mutation-job",
        kind: "mutation",
        documentId: "missing-doc",
        scope: "global",
        maxRetries: 3,
      }),
    );

    await settled(200);

    const status = jobTracker.getJobStatus("mutation-job");
    expect(status?.status).toBe(JobStatus.FAILED);
    expect(status?.error?.name).toBe("DocumentNotFoundError");
    // Deterministic, so it is not re-run against a document that is still absent.
    expect(executor.executeJob).toHaveBeenCalledTimes(1);
  });

  it("still runs when the document arrives inside the deadline", async () => {
    const created = new Set<string>();
    const executor: IJobExecutor = {
      executeJob: vi.fn().mockImplementation((job: Record<string, unknown>) => {
        const documentId = job.documentId as string;
        if (job.scope === "document") {
          created.add(documentId);
          return { success: true, duration: 1 };
        }
        if (!created.has(documentId)) {
          return {
            success: false,
            error: new DocumentNotFoundError(documentId),
          };
        }
        return { success: true, duration: 1 };
      }),
    };
    await startManager(executor, 10_000);

    await queue.enqueue(
      createTestJob({
        id: "op-job",
        kind: "load",
        documentId: "doc-1",
        scope: "global",
      }),
    );
    await settled(50);
    await queue.enqueue(
      createTestJob({
        id: "create-job",
        kind: "load",
        documentId: "doc-1",
        scope: "document",
        // A load job carries operations, not actions - the shape sync delivers.
        operations: [
          {
            id: "op-create",
            index: 0,
            skip: 0,
            hash: "h",
            timestampUtcMs: "2026-01-01T00:00:00.000Z",
            action: {
              id: "action-create",
              type: "CREATE_DOCUMENT",
              scope: "document",
              input: {},
              timestampUtcMs: "2026-01-01T00:00:00.000Z",
            },
          },
        ],
      }),
    );

    await settled();

    expect(jobTracker.getJobStatus("op-job")?.status).not.toBe(
      JobStatus.FAILED,
    );
  });
});
