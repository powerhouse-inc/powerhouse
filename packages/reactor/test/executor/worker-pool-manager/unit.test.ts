import type {
  Action,
  OperationContext,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ICollectionMembershipCache } from "../../../src/cache/collection-membership-cache.js";
import { EventBus } from "../../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobFailedEvent,
  type JobRunningEvent,
  type JobWriteReadyEvent,
} from "../../../src/events/types.js";
import type {
  IExecutorWorker,
  WorkerExecutionOutcome,
  WorkerInFlightSnapshot,
} from "../../../src/executor/interfaces.js";
import { bucketFor } from "../../../src/executor/worker-pool-router.js";
import { WorkerPoolJobExecutorManager } from "../../../src/executor/worker-pool-job-executor-manager.js";
import { WorkerExitedError } from "../../../src/executor/worker/errors.js";
import type {
  JobWriteReadyPayload,
  ModelManifestEntry,
} from "../../../src/executor/worker/protocol.js";
import { InMemoryJobTracker } from "../../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import type { Job } from "../../../src/queue/types.js";
import { NullDocumentModelResolver } from "../../../src/registry/document-model-resolver.js";
import { DocumentNotFoundError } from "../../../src/shared/errors.js";
import { createMockLogger, createTestJob } from "../../factories.js";

type FakeWorkerOptions = {
  index: number;
  outcome?: WorkerExecutionOutcome | ((job: Job) => WorkerExecutionOutcome);
  executeImpl?: (job: Job) => Promise<WorkerExecutionOutcome>;
  startImpl?: () => Promise<void>;
};

class FakeWorker implements IExecutorWorker {
  readonly workerId: string;
  readonly index: number;
  startCalls = 0;
  shutdownCalls = 0;
  shutdownGracefulHistory: boolean[] = [];
  executeCalls: Job[] = [];
  private inFlight: WorkerInFlightSnapshot | null = null;
  private outcome:
    | WorkerExecutionOutcome
    | ((job: Job) => WorkerExecutionOutcome);
  private executeImpl?: (job: Job) => Promise<WorkerExecutionOutcome>;
  private startImpl?: () => Promise<void>;
  private idle = true;

  constructor(opts: FakeWorkerOptions) {
    this.index = opts.index;
    this.workerId = `worker-${opts.index}`;
    this.outcome = opts.outcome ?? {
      result: { job: {} as Job, success: true, duration: 1 },
    };
    this.executeImpl = opts.executeImpl;
    this.startImpl = opts.startImpl;
  }

  async start(): Promise<void> {
    this.startCalls++;
    if (this.startImpl) {
      await this.startImpl();
    }
  }

  async execute(job: Job): Promise<WorkerExecutionOutcome> {
    this.executeCalls.push(job);
    this.idle = false;
    this.inFlight = { correlationId: `corr-${job.id}`, jobId: job.id };
    try {
      if (this.executeImpl) {
        return await this.executeImpl(job);
      }
      const out =
        typeof this.outcome === "function" ? this.outcome(job) : this.outcome;
      return out;
    } finally {
      this.idle = true;
      this.inFlight = null;
    }
  }

  abort(): void {}

  shutdown(graceful: boolean): Promise<void> {
    this.shutdownCalls++;
    this.shutdownGracefulHistory.push(graceful);
    return Promise.resolve();
  }

  loadModelCalls: ModelManifestEntry[] = [];
  loadModelImpl?: (entry: ModelManifestEntry) => Promise<void>;

  async loadModel(entry: ModelManifestEntry): Promise<void> {
    this.loadModelCalls.push(entry);
    if (this.loadModelImpl) {
      await this.loadModelImpl(entry);
    }
  }

  isIdle(): boolean {
    return this.idle;
  }

  getInFlight(): WorkerInFlightSnapshot | null {
    return this.inFlight;
  }
}

function makeOpContext(documentId: string, scope = "global"): OperationContext {
  return {
    documentId,
    documentType: "test/type",
    scope,
    branch: "main",
    ordinal: 1,
  };
}

function makeOpWithAction(
  documentId: string,
  type: string,
  input: Record<string, unknown> = {},
  scope = "global",
): OperationWithContext {
  const action: Action = {
    id: `action-${type}-${documentId}`,
    type,
    scope,
    timestampUtcMs: "2024-01-01T00:00:00.000Z",
    input,
  } as Action;
  return {
    operation: {
      index: 0,
      timestampUtcMs: action.timestampUtcMs,
      hash: "h",
      skip: 0,
      action,
      id: `op-${type}-${documentId}`,
      resultingState: "{}",
    },
    context: makeOpContext(documentId, scope),
  };
}

function makeWriteReady(
  job: Job,
  ops: OperationWithContext[] = [],
): JobWriteReadyPayload {
  return { operations: ops, jobMeta: job.meta };
}

function makeMembershipCache(
  initial: Record<string, string[]> = {},
): ICollectionMembershipCache & {
  invalidatedIds: string[];
  lookups: string[][];
} {
  const invalidatedIds: string[] = [];
  const lookups: string[][] = [];
  const data = new Map(Object.entries(initial));
  return {
    invalidatedIds,
    lookups,
    invalidate(documentId: string) {
      invalidatedIds.push(documentId);
      data.delete(documentId);
    },
    getCollectionsForDocuments(documentIds: string[]) {
      lookups.push([...documentIds]);
      const out: Record<string, string[]> = {};
      for (const id of documentIds) {
        out[id] = data.get(id) ?? [];
      }
      return Promise.resolve(out);
    },
  };
}

function findJobForBucket(bucket: number, numWorkers: number): string {
  for (let i = 0; i < 1000; i++) {
    const id = `doc-${i}`;
    if (bucketFor(id, numWorkers) === bucket) {
      return id;
    }
  }
  throw new Error(`no documentId found for bucket ${bucket}/${numWorkers}`);
}

const flush = async (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));

describe("WorkerPoolJobExecutorManager", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;
  let jobTracker: InMemoryJobTracker;
  let cache: ReturnType<typeof makeMembershipCache>;
  let createdWorkers: FakeWorker[];

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus, new NullDocumentModelResolver());
    jobTracker = new InMemoryJobTracker(eventBus);
    cache = makeMembershipCache();
    createdWorkers = [];
  });

  function buildManager(
    factory: (index: number) => FakeWorker,
    jobTimeoutMs = 30_000,
  ): WorkerPoolJobExecutorManager {
    return new WorkerPoolJobExecutorManager(
      (i: number) => {
        const w = factory(i);
        createdWorkers.push(w);
        return w;
      },
      eventBus,
      queue,
      jobTracker,
      createMockLogger(),
      new NullDocumentModelResolver(),
      cache,
      jobTimeoutMs,
    );
  }

  describe("start / stop", () => {
    it("spawns N workers and calls start() on each", async () => {
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: { result: { job: {} as Job, success: true, duration: 1 } },
          }),
      );
      await manager.start(3);
      expect(createdWorkers).toHaveLength(3);
      for (const w of createdWorkers) {
        expect(w.startCalls).toBe(1);
      }
      const status = manager.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.numExecutors).toBe(3);
      await manager.stop(false);
    });

    it("throws when already running", async () => {
      const manager = buildManager((i) => new FakeWorker({ index: i }));
      await manager.start(1);
      await expect(manager.start(1)).rejects.toThrow(/already running/i);
      await manager.stop(false);
    });

    it("throws when numWorkers < 1", async () => {
      const manager = buildManager((i) => new FakeWorker({ index: i }));
      await expect(manager.start(0)).rejects.toThrow(/at least 1/);
    });

    it("stop(false) shuts each worker down immediately", async () => {
      const manager = buildManager((i) => new FakeWorker({ index: i }));
      await manager.start(2);
      await manager.stop(false);
      for (const w of createdWorkers) {
        expect(w.shutdownCalls).toBe(1);
        expect(w.shutdownGracefulHistory).toEqual([false]);
      }
      expect(manager.getStatus().isRunning).toBe(false);
    });

    it("stop on a not-running manager is a no-op", async () => {
      const manager = buildManager((i) => new FakeWorker({ index: i }));
      await expect(manager.stop(true)).resolves.toBeUndefined();
    });
  });

  describe("getExecutors", () => {
    it("returns an empty array in pool mode", async () => {
      const manager = buildManager((i) => new FakeWorker({ index: i }));
      await manager.start(2);
      expect(manager.getExecutors()).toEqual([]);
      await manager.stop(false);
    });
  });

  describe("sticky routing", () => {
    it("routes a job only to the worker whose bucket matches", async () => {
      const numWorkers = 3;
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
            }),
          }),
      );
      await manager.start(numWorkers);

      const docForBucket0 = findJobForBucket(0, numWorkers);
      const docForBucket2 = findJobForBucket(2, numWorkers);

      await queue.enqueue(
        createTestJob({ id: "job-a", documentId: docForBucket0 }),
      );
      await queue.enqueue(
        createTestJob({ id: "job-b", documentId: docForBucket2 }),
      );

      await flush(100);

      expect(createdWorkers[0].executeCalls.map((j) => j.id)).toEqual([
        "job-a",
      ]);
      expect(createdWorkers[1].executeCalls.map((j) => j.id)).toEqual([]);
      expect(createdWorkers[2].executeCalls.map((j) => j.id)).toEqual([
        "job-b",
      ]);
      await manager.stop(true);
    });
  });

  describe("success + writeReady", () => {
    it("emits JOB_WRITE_READY with collectionMemberships populated", async () => {
      cache = makeMembershipCache({ "doc-1": ["coll-A", "coll-B"] });
      const setNameOp = makeOpWithAction("doc-1", "SET_NAME", { name: "x" });
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
              writeReady: makeWriteReady(job, [setNameOp]),
            }),
          }),
      );
      await manager.start(1);

      const writeReadyPromise = new Promise<JobWriteReadyEvent>((resolve) => {
        eventBus.subscribe(
          ReactorEventTypes.JOB_WRITE_READY,
          (_t: number, data: JobWriteReadyEvent) => resolve(data),
        );
      });

      await queue.enqueue(createTestJob({ id: "job-1", documentId: "doc-1" }));
      const event = await writeReadyPromise;
      expect(event.jobId).toBe("job-1");
      expect(event.operations).toHaveLength(1);
      expect(event.collectionMemberships).toEqual({
        "doc-1": ["coll-A", "coll-B"],
      });
      expect(cache.lookups).toEqual([["doc-1"]]);
      await manager.stop(true);
    });

    it("emits JOB_RUNNING before dispatch", async () => {
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
            }),
          }),
      );
      await manager.start(1);

      const runningEvents: JobRunningEvent[] = [];
      eventBus.subscribe(
        ReactorEventTypes.JOB_RUNNING,
        (_t: number, data: JobRunningEvent) => {
          runningEvents.push(data);
        },
      );

      await queue.enqueue(createTestJob({ id: "running-job" }));
      await flush(50);
      expect(runningEvents.some((e) => e.jobId === "running-job")).toBe(true);
      await manager.stop(true);
    });

    it("invalidates membership cache for ADD_RELATIONSHIP targetId", async () => {
      cache = makeMembershipCache({
        "doc-target": ["coll-old"],
        "doc-parent": [],
      });
      const addRel = makeOpWithAction("doc-parent", "ADD_RELATIONSHIP", {
        targetId: "doc-target",
      });
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
              writeReady: makeWriteReady(job, [addRel]),
            }),
          }),
      );
      await manager.start(1);

      const writeReadyPromise = new Promise<JobWriteReadyEvent>((resolve) => {
        eventBus.subscribe(
          ReactorEventTypes.JOB_WRITE_READY,
          (_t: number, data: JobWriteReadyEvent) => resolve(data),
        );
      });

      await queue.enqueue(
        createTestJob({ id: "job-rel", documentId: "doc-parent" }),
      );
      await writeReadyPromise;
      expect(cache.invalidatedIds).toContain("doc-target");
      await manager.stop(true);
    });

    it("invalidates membership cache for DELETE_DOCUMENT", async () => {
      cache = makeMembershipCache({ "doc-del": ["coll-old"] });
      const delOp = makeOpWithAction("doc-del", "DELETE_DOCUMENT", {});
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
              writeReady: makeWriteReady(job, [delOp]),
            }),
          }),
      );
      await manager.start(1);

      const writeReadyPromise = new Promise<JobWriteReadyEvent>((resolve) => {
        eventBus.subscribe(
          ReactorEventTypes.JOB_WRITE_READY,
          (_t: number, data: JobWriteReadyEvent) => resolve(data),
        );
      });

      await queue.enqueue(
        createTestJob({ id: "job-del", documentId: "doc-del" }),
      );
      await writeReadyPromise;
      expect(cache.invalidatedIds).toContain("doc-del");
      await manager.stop(true);
    });

    it("does not emit JOB_WRITE_READY on failure", async () => {
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: {
                job,
                success: false,
                error: new Error("boom"),
              },
            }),
          }),
      );
      await manager.start(1);

      const writeReadyEvents: JobWriteReadyEvent[] = [];
      eventBus.subscribe(
        ReactorEventTypes.JOB_WRITE_READY,
        (_t: number, data: JobWriteReadyEvent) => {
          writeReadyEvents.push(data);
        },
      );

      await queue.enqueue(
        createTestJob({
          id: "fail-job",
          retryCount: 0,
          maxRetries: 0,
        }),
      );
      await flush(100);
      expect(writeReadyEvents).toHaveLength(0);
      await manager.stop(true);
    });
  });

  describe("worker.execute throws", () => {
    it("emits JOB_FAILED and continues dispatching", async () => {
      let firstCall = true;
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            executeImpl: (job) => {
              if (firstCall) {
                firstCall = false;
                return Promise.reject(new Error("explosion"));
              }
              return Promise.resolve({
                result: { job, success: true, duration: 1 },
              });
            },
          }),
      );
      await manager.start(1);

      const failed: JobFailedEvent[] = [];
      eventBus.subscribe(
        ReactorEventTypes.JOB_FAILED,
        (_t: number, data: JobFailedEvent) => {
          failed.push(data);
        },
      );

      await queue.enqueue(
        createTestJob({
          id: "throw-job",
          retryCount: 0,
          maxRetries: 0,
        }),
      );
      await flush(100);

      expect(failed.some((e) => e.jobId === "throw-job")).toBe(true);
      expect(failed.find((e) => e.jobId === "throw-job")?.error.message).toBe(
        "explosion",
      );

      // Manager should still process subsequent jobs
      await queue.enqueue(createTestJob({ id: "post-throw-job" }));
      await flush(100);
      expect(
        createdWorkers[0].executeCalls.some((j) => j.id === "post-throw-job"),
      ).toBe(true);
      await manager.stop(true);
    });
  });

  describe("DocumentNotFoundError deferral", () => {
    it("defers a job and re-enqueues on CREATE_DOCUMENT flush", async () => {
      const created = new Set<string>();
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            executeImpl: (job) => {
              if (job.scope === "document") {
                created.add(job.documentId);
                return Promise.resolve({
                  result: { job, success: true, duration: 1 },
                });
              }
              if (!created.has(job.documentId)) {
                return Promise.resolve({
                  result: {
                    job,
                    success: false,
                    error: new DocumentNotFoundError(job.documentId),
                  },
                });
              }
              return Promise.resolve({
                result: { job, success: true, duration: 1 },
              });
            },
          }),
      );
      await manager.start(1);

      const failed: JobFailedEvent[] = [];
      eventBus.subscribe(
        ReactorEventTypes.JOB_FAILED,
        (_t: number, data: JobFailedEvent) => {
          failed.push(data);
        },
      );

      await queue.enqueue(
        createTestJob({
          id: "set-name-job",
          documentId: "doc-x",
          scope: "global",
          retryCount: 0,
          maxRetries: 3,
        }),
      );
      await flush(50);

      await queue.enqueue(
        createTestJob({
          id: "create-job",
          documentId: "doc-x",
          scope: "document",
          actions: [
            {
              id: "create-action",
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: { documentId: "doc-x" },
            } as Action,
          ],
          retryCount: 0,
          maxRetries: 0,
        }),
      );
      await flush(300);

      expect(failed.some((e) => e.jobId === "set-name-job")).toBe(false);
      await manager.stop(true);
    });

    it("stop(true) fails any still-deferred jobs", async () => {
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: {
                job,
                success: false,
                error: new DocumentNotFoundError(job.documentId),
              },
            }),
          }),
      );
      await manager.start(1);

      await queue.enqueue(
        createTestJob({
          id: "deferred-job",
          documentId: "missing-doc",
          retryCount: 0,
          maxRetries: 3,
        }),
      );
      await flush(100);

      const failedPromise = new Promise<JobFailedEvent>((resolve) => {
        eventBus.subscribe(
          ReactorEventTypes.JOB_FAILED,
          (_t: number, data: JobFailedEvent) => resolve(data),
        );
      });
      await manager.stop(true);
      const evt = await failedPromise;
      expect(evt.jobId).toBe("deferred-job");
      expect(DocumentNotFoundError.isError(evt.error)).toBe(true);
    });
  });

  describe("getStatus aggregation", () => {
    it("tracks totalJobsProcessed across successful executions", async () => {
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
            }),
          }),
      );
      await manager.start(1);

      await queue.enqueue(createTestJob({ id: "s-1" }));
      await queue.enqueue(createTestJob({ id: "s-2" }));
      await flush(100);

      expect(manager.getStatus().totalJobsProcessed).toBe(2);
      await manager.stop(true);
    });

    it("returns activeJobs=0 when idle", async () => {
      const manager = buildManager(
        (i) =>
          new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
            }),
          }),
      );
      await manager.start(2);
      expect(manager.getStatus().activeJobs).toBe(0);
      await manager.stop(true);
    });
  });

  describe("worker transport crash recovery", () => {
    it(
      "retries the in-flight job, replaces the dead worker, and dispatches " +
        "to the replacement",
      async () => {
        const writeReadyEvents: JobWriteReadyEvent[] = [];
        const failedEvents: JobFailedEvent[] = [];
        eventBus.subscribe(
          ReactorEventTypes.JOB_WRITE_READY,
          (_t: number, data: JobWriteReadyEvent) => {
            writeReadyEvents.push(data);
          },
        );
        eventBus.subscribe(
          ReactorEventTypes.JOB_FAILED,
          (_t: number, data: JobFailedEvent) => {
            failedEvents.push(data);
          },
        );

        const retrySpy = vi.spyOn(queue, "retryJob");

        let callCount = 0;
        const manager = buildManager((i) => {
          callCount++;
          if (callCount === 1) {
            return new FakeWorker({
              index: i,
              executeImpl: () =>
                Promise.reject(
                  new WorkerExitedError(`worker-${i}`, 1, "corr-1"),
                ),
            });
          }
          return new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
              writeReady: makeWriteReady(job),
            }),
          });
        });

        await manager.start(1);

        await queue.enqueue(
          createTestJob({
            id: "crash-job",
            documentId: "doc-crash",
            retryCount: 0,
            maxRetries: 3,
          }),
        );
        await flush(150);

        expect(retrySpy).toHaveBeenCalledWith(
          "crash-job",
          expect.objectContaining({ message: expect.stringContaining("exit") }),
        );

        expect(callCount).toBe(2);
        const replacement = createdWorkers[1];
        expect(replacement.startCalls).toBe(1);
        expect(replacement.executeCalls.map((j) => j.id)).toEqual([
          "crash-job",
        ]);

        expect(failedEvents.some((e) => e.jobId === "crash-job")).toBe(false);
        expect(writeReadyEvents.some((e) => e.jobId === "crash-job")).toBe(
          true,
        );

        await manager.stop(true);
      },
    );

    it(
      "treats WorkerExitedError as transport (no JOB_FAILED) while a " +
        "generic execute() throw still emits JOB_FAILED",
      async () => {
        const failedEvents: JobFailedEvent[] = [];
        eventBus.subscribe(
          ReactorEventTypes.JOB_FAILED,
          (_t: number, data: JobFailedEvent) => {
            failedEvents.push(data);
          },
        );

        let callCount = 0;
        const manager = buildManager((i) => {
          callCount++;
          if (callCount === 1) {
            return new FakeWorker({
              index: i,
              executeImpl: () =>
                Promise.reject(new WorkerExitedError(`worker-${i}`, 137, null)),
            });
          }
          return new FakeWorker({
            index: i,
            outcome: (job) => ({
              result: { job, success: true, duration: 1 },
            }),
          });
        });

        await manager.start(1);
        await queue.enqueue(
          createTestJob({
            id: "transport-job",
            retryCount: 0,
            maxRetries: 3,
          }),
        );
        await flush(150);

        expect(failedEvents.some((e) => e.jobId === "transport-job")).toBe(
          false,
        );
        await manager.stop(true);
      },
    );
  });

  describe("loadModel broadcast", () => {
    const entry: ModelManifestEntry = {
      documentType: "ph/test-model",
      version: "1.0.0",
      spec: {
        module: { packageName: "ph/test-model", exportName: "documentModel" },
      },
    };

    it("invokes loadModel on every worker in parallel", async () => {
      const manager = buildManager((i) => new FakeWorker({ index: i }));
      await manager.start(3);
      await manager.loadModel(entry);
      for (const w of createdWorkers) {
        expect(w.loadModelCalls).toEqual([entry]);
      }
      await manager.stop(true);
    });

    it("resolves silently when no workers are running", async () => {
      const manager = buildManager((i) => new FakeWorker({ index: i }));
      await expect(manager.loadModel(entry)).resolves.toBeUndefined();
    });

    it("treats DuplicateModuleError responses as success", async () => {
      const manager = buildManager((i) => {
        const w = new FakeWorker({ index: i });
        if (i === 0) {
          const dup = new Error(
            "Document model module already registered for type: ph/test-model",
          );
          dup.name = "DuplicateModuleError";
          const wrapper = new Error("worker 0 reported duplicate");
          (wrapper as { cause?: unknown }).cause = dup;
          w.loadModelImpl = () => Promise.reject(wrapper);
        }
        return w;
      });
      await manager.start(3);
      await expect(manager.loadModel(entry)).resolves.toBeUndefined();
      await manager.stop(true);
    });

    it("rejects when a worker fails to load the model", async () => {
      const manager = buildManager((i) => {
        const w = new FakeWorker({ index: i });
        if (i === 1) {
          w.loadModelImpl = () =>
            Promise.reject(new Error("worker-1 explosion"));
        }
        return w;
      });
      await manager.start(3);
      await expect(manager.loadModel(entry)).rejects.toThrow(
        "worker-1 explosion",
      );
      // every worker still saw the broadcast attempt
      for (const w of createdWorkers) {
        expect(w.loadModelCalls).toEqual([entry]);
      }
      await manager.stop(true);
    });
  });
});
