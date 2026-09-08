import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultDatabase } from "../../src/core/create-default-database.js";
import {
  ReactorBuilder,
  type ReadModelCoordinatorFactoryDeps,
} from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import type { JobReadReadyEvent } from "../../src/events/types.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type {
  IExecutorWorker,
  WorkerExecutionOutcome,
  WorkerInFlightSnapshot,
} from "../../src/executor/interfaces.js";
import type { DbConfig } from "../../src/executor/worker/protocol.js";
import type { ProjectionShardManager } from "../../src/projection/projection-shard-manager.js";
import type { Job } from "../../src/queue/types.js";
import type {
  IReadModel,
  IReadModelCoordinator,
} from "../../src/read-models/interfaces.js";
import type { ConsistencyCoordinate, JobMeta } from "../../src/shared/types.js";
import {
  createFakeProjectionTransports,
  type FakeProjectionTransport,
} from "../projection/fake-projection-transport.js";

const WORKER_DB: DbConfig = {
  host: "localhost",
  port: 5432,
  database: "test",
  user: "test",
  password: "test",
};

const SHARD_DB: DbConfig = {
  host: "projection-host",
  port: 5433,
  database: "projection",
  user: "test",
  password: "test",
};

const FIXTURE_SOURCES = [
  {
    filePath: fileURLToPath(
      new URL("../core/fixtures/model-barrel.mjs", import.meta.url),
    ),
  },
];

const JOB_META: JobMeta = { batchId: "batch-1", batchJobIds: [] };

const OPERATION: OperationWithContext = {
  operation: {
    index: 4,
    skip: 0,
    hash: "hash-4",
    timestampUtcMs: "2024-01-01T00:00:00.000Z",
    action: {
      id: "action-4",
      type: "SET_NAME",
      scope: "global",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: { name: "test" },
    },
    id: "op-4",
    resultingState: JSON.stringify({ state: "test" }),
  },
  context: {
    documentId: "doc-1",
    documentType: "test",
    scope: "global",
    branch: "main",
    ordinal: 5,
  },
};

const COORDINATES: ConsistencyCoordinate[] = [
  { documentId: "doc-1", scope: "global", branch: "main", operationIndex: 4 },
];

class StubReadModel implements IReadModel {
  constructor(readonly name: string) {}

  indexOperations(_operations: OperationWithContext[]): Promise<void> {
    return Promise.resolve();
  }
}

/** Minimal coordinator; forwards start/stop to a manager when it owns one. */
class StubCoordinator implements IReadModelCoordinator {
  readonly readModels: IReadModel[] = [];

  constructor(private readonly manager?: ProjectionShardManager) {}

  start(): void {
    this.manager?.start();
  }

  stop(): void {
    this.manager?.stop();
  }

  drain(): Promise<void> {
    return Promise.resolve();
  }

  getChainDepth(): number {
    return 0;
  }
}

class FakeWorker implements IExecutorWorker {
  readonly workerId: string;

  constructor(readonly index: number) {
    this.workerId = `fake-${index}`;
  }

  start(): Promise<void> {
    return Promise.resolve();
  }

  execute(job: Job): Promise<WorkerExecutionOutcome> {
    return Promise.resolve({ result: { job, success: true, duration: 1 } });
  }

  abort(): void {}

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  loadModel(): Promise<void> {
    return Promise.resolve();
  }

  isIdle(): boolean {
    return true;
  }

  getInFlight(): WorkerInFlightSnapshot | null {
    return null;
  }
}

async function within<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 1000,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const bomb = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not settle within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, bomb]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

describe("ReactorBuilder.withReadModelCoordinatorFactory", () => {
  let module: InProcessReactorModule | undefined;
  let db: Kysely<Database> | undefined;
  let manager: ProjectionShardManager | undefined;
  let destroyDb = true;

  afterEach(async () => {
    if (module) {
      await module.reactor.kill().completed;
      module = undefined;
    }
    if (manager) {
      await manager.shutdown();
      manager = undefined;
    }
    if (db && destroyDb) {
      await db.destroy();
    }
    db = undefined;
    destroyDb = true;
  });

  async function buildWithManager(options: {
    onReadReady?: (event: JobReadReadyEvent) => void;
    registerShutdownHook?: (
      deps: ReadModelCoordinatorFactoryDeps,
      manager: ProjectionShardManager,
    ) => void;
    signalHandlers?: boolean;
  }): Promise<{
    module: InProcessReactorModule;
    transports: FakeProjectionTransport[];
  }> {
    db = await createDefaultDatabase();
    const { transports, factory } = createFakeProjectionTransports();
    const builder = new ReactorBuilder()
      .withKysely(db)
      .withProjectionWorkerFactory(factory)
      .withReadModelCoordinatorFactory(async (deps) => {
        manager = await deps.createProjectionShardManager({
          shardCount: 1,
          preReadyKinds: ["document-view", "document-indexer"],
          postReadyKinds: [],
          db: SHARD_DB,
          shutdownGraceMs: 10,
          onReadReady: options.onReadReady,
        });
        options.registerShutdownHook?.(deps, manager);
        return new StubCoordinator(manager);
      });
    if (options.signalHandlers) {
      builder.withSignalHandlers();
    }
    module = await builder.buildModule();
    return { module, transports };
  }

  it("hands the factory the caller read models, the internals, and installs its coordinator", async () => {
    const registered = new StubReadModel("registered");
    const built = new StubReadModel("built");
    const coordinator = new StubCoordinator();
    let received: ReadModelCoordinatorFactoryDeps | undefined;

    module = await new ReactorBuilder()
      .withReadModel(registered)
      .withReadModelFactory(() => built)
      .withReadModelCoordinatorFactory((deps) => {
        received = deps;
        return coordinator;
      })
      .buildModule();

    expect(received).toBeDefined();
    expect(received!.readModels).toEqual([registered, built]);
    expect(received!.readModels).not.toContain(module.documentView);
    expect(received!.readModels).not.toContain(module.documentIndexer);
    expect(received!.subscriptionNotificationReadModel.name).toBe(
      "subscription-notification",
    );
    expect(received!.processorManager).toBe(module.processorManager);
    expect(received!.documentView).toBe(module.documentView);
    expect(received!.documentIndexer).toBe(module.documentIndexer);
    expect(received!.eventBus).toBe(module.eventBus);
    expect(module.readModelCoordinator).toBe(coordinator);
  });

  it("builds with withReadModel, withReadModelFactory and a coordinator factory together", async () => {
    module = await new ReactorBuilder()
      .withReadModel(new StubReadModel("registered"))
      .withReadModelFactory(() => new StubReadModel("built"))
      .withReadModelCoordinatorFactory(() => new StubCoordinator())
      .buildModule();

    expect(module.readModelCoordinator).toBeInstanceOf(StubCoordinator);
  });

  it("bound creator honours config.db and wires the host consistency trackers", async () => {
    const { module: built, transports } = await buildWithManager({});

    expect(transports).toHaveLength(1);
    const init = transports[0]!.sentOfType("init");
    expect(init).toHaveLength(1);
    expect(init[0]!.db.host).toBe(SHARD_DB.host);
    expect(init[0]!.db.applicationName).toBe("reactor-projection-shard");

    await built.eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
      operations: [OPERATION],
      jobMeta: JOB_META,
    });
    expect(transports[0]!.sentOfType("write-ready")).toHaveLength(1);

    const wait = built.documentViewConsistencyTracker.waitFor(COORDINATES);
    transports[0]!.send({
      type: "readmodel-indexed",
      shardId: "projection-shard-0",
      jobId: "job-1",
      readModelName: "document-view",
      stage: "pre_ready",
      durationMs: 1,
      operationCount: 1,
      success: true,
    });

    await within(wait, "documentViewConsistencyTracker under the factory");
  });

  it("bound creator forwards onReadReady to the manager", async () => {
    const hookEvents: JobReadReadyEvent[] = [];
    const { module: built, transports } = await buildWithManager({
      onReadReady: (event) => hookEvents.push(event),
    });
    const busEvents: JobReadReadyEvent[] = [];
    built.eventBus.subscribe(
      ReactorEventTypes.JOB_READ_READY,
      (_type: number, event: JobReadReadyEvent) => {
        busEvents.push(event);
      },
    );

    await built.eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
      operations: [OPERATION],
      jobMeta: JOB_META,
    });
    transports[0]!.send({
      type: "read-ready",
      shardId: "projection-shard-0",
      jobId: "job-1",
      operations: [OPERATION],
    });

    expect(hookEvents.map((e) => e.jobId)).toEqual(["job-1"]);
    expect(busEvents).toHaveLength(0);

    await manager!.emitReadReady(hookEvents[0]!);
    expect(busEvents.map((e) => e.jobId)).toEqual(["job-1"]);
  });

  it("bound creator registers no shutdown hook; registerShutdownHook joins the builder's list", async () => {
    const realExit = process.exit;
    const sigtermBefore = new Set(process.listeners("SIGTERM"));
    const sigintBefore = new Set(process.listeners("SIGINT"));
    let resolveExit: (code: number | undefined) => void = () => {};
    const exited = new Promise<number | undefined>((resolve) => {
      resolveExit = resolve;
    });
    process.exit = ((code?: number) => {
      resolveExit(code);
      return undefined as never;
    }) as typeof process.exit;

    let hookCalls = 0;
    try {
      const { transports } = await buildWithManager({
        signalHandlers: true,
        registerShutdownHook: (deps, shardManager) => {
          deps.registerShutdownHook(async () => {
            hookCalls++;
            await shardManager.shutdown();
          });
        },
      });
      const shutdownSpy = vi.spyOn(manager!, "shutdown");

      const added = process
        .listeners("SIGTERM")
        .filter((listener) => !sigtermBefore.has(listener));
      expect(added).toHaveLength(1);
      (added[0] as NodeJS.SignalsListener)("SIGTERM");

      const exitCode = await within(exited, "signal-handler shutdown");
      destroyDb = false;

      expect(exitCode).toBe(0);
      expect(hookCalls).toBe(1);
      expect(shutdownSpy).toHaveBeenCalledTimes(1);
      expect(transports[0]!.terminateCalls).toBe(1);
      manager = undefined;
    } finally {
      process.exit = realExit;
      for (const listener of process.listeners("SIGTERM")) {
        if (!sigtermBefore.has(listener)) {
          process.removeListener("SIGTERM", listener as NodeJS.SignalsListener);
        }
      }
      for (const listener of process.listeners("SIGINT")) {
        if (!sigintBefore.has(listener)) {
          process.removeListener("SIGINT", listener as NodeJS.SignalsListener);
        }
      }
    }
  });

  it("bound creator rejects a db on a different target than the worker pool's", async () => {
    db = await createDefaultDatabase();
    const { transports, factory } = createFakeProjectionTransports();

    await expect(
      new ReactorBuilder()
        .withKysely(db)
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool({
          numWorkers: 1,
          db: WORKER_DB,
          factory: (index) => new FakeWorker(index),
        })
        .withProjectionWorkerFactory(factory)
        .withReadModelCoordinatorFactory(async (deps) => {
          const created = await deps.createProjectionShardManager({
            shardCount: 1,
            preReadyKinds: ["document-view", "document-indexer"],
            postReadyKinds: [],
            db: { ...WORKER_DB, host: "other-host" },
          });
          return new StubCoordinator(created);
        })
        .buildModule(),
    ).rejects.toThrow(/must address the same Postgres database/);
    expect(transports).toHaveLength(0);
  });

  it("bound creator rejects a kind list that leaves a built-in to nobody", async () => {
    db = await createDefaultDatabase();
    const { transports, factory } = createFakeProjectionTransports();

    await expect(
      new ReactorBuilder()
        .withKysely(db)
        .withProjectionWorkerFactory(factory)
        .withReadModelCoordinatorFactory(async (deps) => {
          const created = await deps.createProjectionShardManager({
            shardCount: 1,
            preReadyKinds: ["document-view"],
            postReadyKinds: [],
            db: SHARD_DB,
          });
          return new StubCoordinator(created);
        })
        .buildModule(),
    ).rejects.toThrow(/never named: document-indexer/);
    expect(transports).toHaveLength(0);
  });

  it("rejects withReadModelCoordinator together with withReadModelCoordinatorFactory", async () => {
    await expect(
      new ReactorBuilder()
        .withReadModelCoordinator(new StubCoordinator())
        .withReadModelCoordinatorFactory(() => new StubCoordinator())
        .buildModule(),
    ).rejects.toThrow(
      /withReadModelCoordinator and withReadModelCoordinatorFactory are mutually exclusive/,
    );
  });

  it("rejects withProjectionShards together with withReadModelCoordinatorFactory", async () => {
    await expect(
      new ReactorBuilder()
        .withProjectionShards({
          shardCount: 1,
          preReadyKinds: ["document-view", "document-indexer"],
          postReadyKinds: [],
          db: SHARD_DB,
        })
        .withReadModelCoordinatorFactory(() => new StubCoordinator())
        .buildModule(),
    ).rejects.toThrow(
      /withProjectionShards and withReadModelCoordinatorFactory are mutually exclusive/,
    );
  });
});
