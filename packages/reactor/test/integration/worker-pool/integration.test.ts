import type {
  Action,
  OperationContext,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { DocumentModelSpecInput } from "../../../src/core/reactor-builder.js";
import type { ReactorModule } from "../../../src/core/types.js";
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
import type { JobWriteReadyPayload } from "../../../src/executor/worker/protocol.js";
import type { WorkerPoolConfig } from "../../../src/executor/worker/protocol.js";
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

  async start(): Promise<void> {
    this.startCalls++;
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

  async shutdown(): Promise<void> {
    this.shutdownCalls++;
  }

  isIdle(): boolean {
    return true;
  }

  getInFlight(): WorkerInFlightSnapshot | null {
    return null;
  }
}

const SPECS: DocumentModelSpecInput[] = [
  { packageName: "ph/test-model", version: "1.0.0" },
];

function poolConfig(numWorkers: number): WorkerPoolConfig {
  return { enabled: true, numWorkers, workerType: "thread" };
}

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

describe("Worker pool integration through ReactorBuilder", () => {
  let modules: ReactorModule[] = [];

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
    config: WorkerPoolConfig,
    factory: WorkerFactory,
  ): Promise<ReactorModule> {
    const module = await new ReactorBuilder()
      .withDocumentModelSpecs(SPECS)
      .withWorkerPool(config)
      .withWorkerFactory(factory)
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
    const module = await buildReactor(poolConfig(3), factory);

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
        executeImpl: async (job) => ({
          result: { job, success: true, duration: 1 },
          writeReady: {
            operations: [op],
            jobMeta: job.meta,
          } as JobWriteReadyPayload,
        }),
      });
    const module = await buildReactor(poolConfig(1), factory);

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

  it("reports numExecutors === numWorkers on the manager", async () => {
    const factory: WorkerFactory = (index) => new FakeWorker({ index });
    const module = await buildReactor(poolConfig(4), factory);
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
    const module = await buildReactor(poolConfig(2), factory);
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
    const module = await buildReactor(poolConfig(N), factory);

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
