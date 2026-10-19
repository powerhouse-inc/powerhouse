import type {
  Action,
  OperationContext,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperationIndexEntry } from "../../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { DocumentModelSource } from "../../../src/core/reactor-builder.js";
import { fileURLToPath } from "node:url";
import type { InProcessReactorModule } from "../../../src/core/types.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../../src/events/types.js";
import type {
  IExecutorWorker,
  WorkerExecutionOutcome,
  WorkerInFlightSnapshot,
} from "../../../src/executor/interfaces.js";
import type { WorkerFactory } from "../../../src/executor/worker-pool-job-executor-manager.js";
import { bucketFor } from "../../../src/executor/worker-pool-router.js";
import {
  fromErrorInfo,
  toErrorInfo,
} from "../../../src/executor/worker/error-info.js";
import type {
  JobWriteReadyPayload,
  ModelManifestEntry,
} from "../../../src/executor/worker/protocol.js";
import { ModuleNotFoundError } from "../../../src/registry/errors.js";
import type { Job } from "../../../src/queue/types.js";
import { JobStatus } from "../../../src/shared/types.js";

type FakeWorkerOptions = {
  index: number;
  executeImpl?: (job: Job) => Promise<WorkerExecutionOutcome>;
};

class FakeWorker implements IExecutorWorker {
  readonly workerId: string;
  readonly index: number;
  startCalls = 0;
  shutdownCalls = 0;
  executeCalls: Job[] = [];
  private executeImpl?: (job: Job) => Promise<WorkerExecutionOutcome>;

  constructor(opts: FakeWorkerOptions) {
    this.index = opts.index;
    this.workerId = `fake-${opts.index}`;
    this.executeImpl = opts.executeImpl;
  }

  start(): Promise<void> {
    this.startCalls++;
    return Promise.resolve();
  }

  async execute(job: Job): Promise<WorkerExecutionOutcome> {
    this.executeCalls.push(job);
    if (this.executeImpl) {
      return await this.executeImpl(job);
    }
    return {
      result: {
        job,
        success: true,
        duration: 1,
      },
      writeReady: {
        operations: [],
        jobMeta: job.meta,
      },
    };
  }

  abort(): void {}

  shutdown(): Promise<void> {
    this.shutdownCalls++;
    return Promise.resolve();
  }

  loadModel(): Promise<void> {
    return Promise.resolve();
  }

  evictPurged(): void {}

  isIdle(): boolean {
    return true;
  }

  getInFlight(): WorkerInFlightSnapshot | null {
    return null;
  }
}

const SPECS: DocumentModelSource[] = [
  {
    filePath: fileURLToPath(
      new URL("../../core/fixtures/model-barrel.mjs", import.meta.url),
    ),
  },
];

function makeJob(overrides: Partial<Job> = {}): Job {
  const id = overrides.id ?? `job-${Math.random().toString(36).slice(2)}`;
  const action: Action = {
    id: `action-${id}`,
    type: "SET_NAME",
    scope: "global",
    timestampUtcMs: "2024-01-01T00:00:00.000Z",
    input: { name: "test" },
  } as Action;
  return {
    id,
    kind: "mutation",
    documentId: "doc-1",
    scope: "global",
    branch: "main",
    actions: [action],
    operations: [],
    createdAt: new Date().toISOString(),
    queueHint: [],
    retryCount: 0,
    maxRetries: 0,
    errorHistory: [],
    meta: { batchId: `batch-${id}`, batchJobIds: [id] },
    ...overrides,
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

function makeOpWithAction(
  documentId: string,
  type: string,
  scope = "global",
): OperationWithContext {
  const action: Action = {
    id: `action-${type}-${documentId}`,
    type,
    scope,
    timestampUtcMs: "2024-01-01T00:00:00.000Z",
    input: {},
  } as Action;
  const ctx: OperationContext = {
    documentId,
    documentType: "test/type",
    scope,
    branch: "main",
    ordinal: 1,
  };
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
    context: ctx,
  };
}

function makeIndexEntry(documentId: string): OperationIndexEntry {
  const action: Action = {
    id: `action-index-${documentId}`,
    type: "SET_NAME",
    scope: "global",
    timestampUtcMs: "2024-01-01T00:00:00.000Z",
    input: {},
  } as Action;
  return {
    id: `op-index-${documentId}`,
    index: 0,
    timestampUtcMs: action.timestampUtcMs,
    hash: "h",
    skip: 0,
    action,
    documentId,
    documentType: "test/type",
    branch: "main",
    scope: "global",
    sourceRemote: "",
  };
}

describe("Worker pool integration through ReactorBuilder", () => {
  let modules: InProcessReactorModule[] = [];

  afterEach(async () => {
    for (const m of modules) {
      try {
        await m.reactor.kill();
      } catch {
        // best-effort teardown
      }
    }
    modules = [];
  });

  async function buildReactor(
    numWorkers: number,
    factory: WorkerFactory,
  ): Promise<InProcessReactorModule> {
    const module = await new ReactorBuilder()
      .withDocumentModelSources(SPECS)
      .withWorkerPool({ numWorkers, factory })
      .buildModule();
    modules.push(module);
    return module;
  }

  it("routes a job through the queue to the matching worker and completes it", async () => {
    const created: FakeWorker[] = [];
    const factory = (index: number) => {
      const w = new FakeWorker({ index });
      created.push(w);
      return w;
    };
    const module = await buildReactor(3, factory);

    const docId = findJobForBucket(2, 3);
    const job = makeJob({ id: "job-routed", documentId: docId });

    await module.queue.enqueue(job);

    await vi.waitUntil(
      () => created[2].executeCalls.some((j) => j.id === "job-routed"),
      { timeout: 2000 },
    );

    expect(created[0].executeCalls).toHaveLength(0);
    expect(created[1].executeCalls).toHaveLength(0);
    expect(created[2].executeCalls.map((j) => j.id)).toEqual(["job-routed"]);

    await vi.waitUntil(
      () => {
        const s = module.jobTracker.getJobStatus("job-routed")?.status;
        return s === JobStatus.WRITE_READY || s === JobStatus.READ_READY;
      },
      { timeout: 2000 },
    );
  });

  it("emits JOB_WRITE_READY with parent-enriched memberships", async () => {
    const op = makeOpWithAction("doc-mem", "SET_NAME");
    const factory: WorkerFactory = (index) =>
      new FakeWorker({
        index,
        executeImpl: (job) =>
          Promise.resolve({
            result: { job, success: true, duration: 1 },
            writeReady: {
              operations: [op],
              jobMeta: job.meta,
            } as JobWriteReadyPayload,
          }),
      });
    const module = await buildReactor(1, factory);

    const writeReady = new Promise<JobWriteReadyEvent>((resolve) => {
      module.eventBus.subscribe(
        ReactorEventTypes.JOB_WRITE_READY,
        (_t: number, data: JobWriteReadyEvent) => {
          resolve(data);
        },
      );
    });

    const job = makeJob({ id: "job-wr", documentId: "doc-mem" });
    await module.queue.enqueue(job);
    const event = await writeReady;
    expect(event.jobId).toBe("job-wr");
    expect(event.operations).toHaveLength(1);
    expect(event.collectionMemberships).toBeDefined();
    expect(event.collectionMemberships!["doc-mem"]).toEqual([]);
  });

  it("reads memberships the worker's commit created, not a cached answer", async () => {
    const op = makeOpWithAction("doc-cascade", "SET_NAME");
    const factory: WorkerFactory = (index) =>
      new FakeWorker({
        index,
        executeImpl: (job) =>
          Promise.resolve({
            result: { job, success: true, duration: 1 },
            writeReady: {
              operations: [op],
              jobMeta: job.meta,
            } as JobWriteReadyPayload,
          }),
      });
    const module = await buildReactor(1, factory);

    const writeReadyFor = (jobId: string): Promise<JobWriteReadyEvent> =>
      new Promise<JobWriteReadyEvent>((resolve) => {
        module.eventBus.subscribe(
          ReactorEventTypes.JOB_WRITE_READY,
          (_t: number, data: JobWriteReadyEvent) => {
            if (data.jobId === jobId) {
              resolve(data);
            }
          },
        );
      });

    const first = writeReadyFor("job-before-cascade");
    await module.queue.enqueue(
      makeJob({ id: "job-before-cascade", documentId: "doc-cascade" }),
    );
    const beforeEvent = await first;
    expect(beforeEvent.collectionMemberships!["doc-cascade"]).toEqual([]);

    const txn = module.operationIndex.start();
    txn.write([makeIndexEntry("doc-cascade")]);
    txn.addToCollection("coll-cascade", "doc-cascade");
    await module.operationIndex.commit(txn);

    const second = writeReadyFor("job-after-cascade");
    await module.queue.enqueue(
      makeJob({ id: "job-after-cascade", documentId: "doc-cascade" }),
    );
    const afterEvent = await second;
    expect(afterEvent.collectionMemberships!["doc-cascade"]).toContain(
      "coll-cascade",
    );
  });

  it("reports numExecutors === numWorkers on the manager", async () => {
    const factory: WorkerFactory = (index) => new FakeWorker({ index });
    const module = await buildReactor(4, factory);
    expect(module.executorManager.getStatus().numExecutors).toBe(4);
    expect(module.executorManager.getExecutors()).toEqual([]);
  });

  it("shuts each fake worker down on reactor.kill()", async () => {
    const created: FakeWorker[] = [];
    const factory = (index: number) => {
      const w = new FakeWorker({ index });
      created.push(w);
      return w;
    };
    const module = await buildReactor(2, factory);
    await module.reactor.kill();
    modules.pop();
    for (const w of created) {
      expect(w.shutdownCalls).toBeGreaterThan(0);
    }
  });

  it("distributes a batch of jobs across multiple workers per sticky routing", async () => {
    const N = 3;
    const created: FakeWorker[] = [];
    const factory = (index: number) => {
      const w = new FakeWorker({ index });
      created.push(w);
      return w;
    };
    const module = await buildReactor(N, factory);

    const jobs: Job[] = [];
    for (let i = 0; i < N; i++) {
      const docId = findJobForBucket(i, N);
      jobs.push(makeJob({ id: `dist-${i}`, documentId: docId }));
    }
    for (const j of jobs) {
      await module.queue.enqueue(j);
    }

    await vi.waitUntil(
      () =>
        created.every((w) => w.executeCalls.length === 1) &&
        jobs.every((j) => {
          const s = module.jobTracker.getJobStatus(j.id)?.status;
          return s === JobStatus.WRITE_READY || s === JobStatus.READ_READY;
        }),
      { timeout: 3000 },
    );

    for (let i = 0; i < N; i++) {
      expect(created[i].executeCalls[0].id).toBe(`dist-${i}`);
    }
  });
});

describe("Worker pool model recovery", () => {
  let modules: InProcessReactorModule[] = [];

  afterEach(async () => {
    for (const m of modules) {
      try {
        await m.reactor.kill();
      } catch {
        // best-effort teardown
      }
    }
    modules = [];
  });

  // What a worker sends back after the IPC round trip, not the host's own class.
  function missingModel(job: Job, type: string): WorkerExecutionOutcome {
    const error = fromErrorInfo(toErrorInfo(new ModuleNotFoundError(type, 1)));
    return { result: { job, success: false, error } };
  }

  class ModelTrackingWorker extends FakeWorker {
    loaded: ModelManifestEntry[] = [];

    override loadModel(entry?: ModelManifestEntry): Promise<void> {
      if (entry) this.loaded.push(entry);
      return Promise.resolve();
    }
  }

  it("re-sends a model the host has to a worker that lacks it, then retries", async () => {
    const created: ModelTrackingWorker[] = [];
    const factory: WorkerFactory = (index) => {
      const worker: ModelTrackingWorker = new ModelTrackingWorker({
        index,
        executeImpl: (job) =>
          Promise.resolve(
            worker.loaded.some((e) => e.documentType === "test/alpha")
              ? {
                  result: { job, success: true, duration: 1 },
                  writeReady: { operations: [], jobMeta: job.meta },
                }
              : missingModel(job, "test/alpha"),
          ),
      });
      created.push(worker);
      return worker;
    };
    const module = await new ReactorBuilder()
      .withDocumentModelSources(SPECS)
      .withDocumentModelLoader({ load: vi.fn() })
      .withWorkerPool({ numWorkers: 1, factory })
      .buildModule();
    modules.push(module);

    await module.queue.enqueue(makeJob({ id: "job-recover", maxRetries: 3 }));

    await vi.waitUntil(
      () => {
        const s = module.jobTracker.getJobStatus("job-recover")?.status;
        return s === JobStatus.WRITE_READY || s === JobStatus.READ_READY;
      },
      { timeout: 3000 },
    );
    expect(created[0].executeCalls).toHaveLength(2);
    expect(created[0].loaded).toEqual([
      {
        documentType: "test/alpha",
        version: "1",
        spec: {
          module: {
            filePath: (SPECS[0] as { filePath: string }).filePath,
            exportName: "alphaModel",
          },
        },
      },
    ]);
  });

  it("fails a job at once when its model exists on the host only as a live module", async () => {
    const created: ModelTrackingWorker[] = [];
    const factory: WorkerFactory = (index) => {
      const worker = new ModelTrackingWorker({
        index,
        executeImpl: (job) => Promise.resolve(missingModel(job, "test/live")),
      });
      created.push(worker);
      return worker;
    };
    const liveModule = {
      version: 1,
      reducer: () => undefined,
      documentModel: { global: { id: "test/live" } },
      actions: {},
      utils: {},
    };
    const module = await new ReactorBuilder()
      .withDocumentModelSources(SPECS)
      .withDocumentModelLoader({
        load: vi.fn().mockResolvedValue(liveModule),
      })
      .withWorkerPool({ numWorkers: 1, factory })
      .buildModule();
    modules.push(module);

    await module.queue.enqueue(makeJob({ id: "job-live", maxRetries: 3 }));

    await vi.waitUntil(
      () =>
        module.jobTracker.getJobStatus("job-live")?.status === JobStatus.FAILED,
      { timeout: 3000 },
    );
    expect(created[0].executeCalls).toHaveLength(1);
    expect(created[0].loaded).toEqual([]);
    expect(module.jobTracker.getJobStatus("job-live")?.error?.name).toBe(
      "ModelNotWorkerImportableError",
    );
  });
});
