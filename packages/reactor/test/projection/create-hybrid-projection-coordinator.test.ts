import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultDatabase } from "../../src/core/create-default-database.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
} from "../../src/events/types.js";
import {
  createHybridProjectionCoordinatorFactory,
  type HybridProjectionOptions,
} from "../../src/projection/create-hybrid-projection-coordinator.js";
import { HybridProjectionCoordinator } from "../../src/projection/hybrid-projection-coordinator.js";
import type { DbConfig } from "../../src/projection/protocol.js";
import type { IReadModel } from "../../src/read-models/interfaces.js";
import type { JobMeta } from "../../src/shared/types.js";
import {
  createFakeProjectionTransports,
  type FakeProjectionTransport,
} from "./fake-projection-transport.js";

const FAKE_DB: DbConfig = {
  host: "projection-host",
  port: 5433,
  database: "projection",
  user: "test",
  password: "test",
  applicationName: "test-projection",
};

const SHARD_ID = "projection-shard-0";
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

/** Answers every `drain` the host posted, as a live worker would. */
function replyDrained(transport: FakeProjectionTransport): void {
  for (const drain of transport.sentOfType("drain")) {
    transport.send({
      type: "drained",
      correlationId: drain.correlationId,
      shardId: SHARD_ID,
    });
  }
}

class StubReadModel implements IReadModel {
  readonly indexed: OperationWithContext[][] = [];

  constructor(
    readonly name: string,
    readonly sequence: string[],
  ) {}

  indexOperations(operations: OperationWithContext[]): Promise<void> {
    this.indexed.push(operations);
    this.sequence.push(`${this.name}:index`);
    return Promise.resolve();
  }
}

describe("createHybridProjectionCoordinatorFactory", () => {
  let db: Kysely<Database> | undefined;
  let module: InProcessReactorModule | undefined;
  let transports: FakeProjectionTransport[] = [];

  afterEach(async () => {
    if (module) {
      const coordinator =
        module.readModelCoordinator as HybridProjectionCoordinator;
      const shutdown = coordinator.shutdown();
      replyDrained(transports[0]!);
      await within(shutdown, "hybrid coordinator shutdown in afterEach");
      module = undefined;
    }
    transports = [];
    if (db) {
      await db.destroy();
      db = undefined;
    }
  });

  async function build(
    options: HybridProjectionOptions = {},
  ): Promise<{ module: InProcessReactorModule; stub: StubReadModel }> {
    const sequence: string[] = [];
    const stub = new StubReadModel("stub", sequence);
    db = await createDefaultDatabase();
    const fakes = createFakeProjectionTransports();
    transports = fakes.transports;
    module = await new ReactorBuilder()
      .withKysely(db)
      .withProjectionWorkerFactory(fakes.factory)
      .withReadModel(stub)
      .withReadModelCoordinatorFactory(
        createHybridProjectionCoordinatorFactory({
          db: FAKE_DB,
          poolSize: 3,
          shutdownGraceMs: 10,
          ...options,
        }),
      )
      .buildModule();
    module.eventBus.subscribe(
      ReactorEventTypes.JOB_READ_READY,
      (_type: number, event: JobReadReadyEvent) => {
        sequence.push(`read-ready:${event.jobId}`);
      },
    );
    return { module, stub };
  }

  it("installs a HybridProjectionCoordinator exposing host models and the built-ins", async () => {
    const { module: built, stub } = await build();

    const coordinator = built.readModelCoordinator;
    expect(coordinator).toBeInstanceOf(HybridProjectionCoordinator);
    expect(coordinator.readModels).toContain(stub);
    expect(coordinator.readModels).toContain(built.documentView);
    expect(coordinator.readModels).toContain(built.documentIndexer);
    expect(coordinator.readModels).toContain(built.processorManager);
    expect(coordinator.readModels.map(({ name }) => name)).toContain(
      "subscription-notification",
    );
  });

  it("starts one shard owning both built-in kinds pre-ready, on the given db", async () => {
    await build();

    expect(transports).toHaveLength(1);
    const init = transports[0]!.sentOfType("init");
    expect(init).toHaveLength(1);
    expect(init[0]!.shardCount).toBe(1);
    expect(init[0]!.preReadyKinds).toEqual([
      "document-view",
      "document-indexer",
    ]);
    expect(init[0]!.postReadyKinds).toEqual([]);
    expect(init[0]!.db.host).toBe(FAKE_DB.host);
    expect(init[0]!.db.poolSize).toBe(3);
    expect(init[0]!.db.applicationName).toBe(FAKE_DB.applicationName);
  });

  it("relays write-ready to the worker and indexes the host model before JOB_READ_READY", async () => {
    const { module: built, stub } = await build();

    await built.eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
      operations: [OPERATION],
      jobMeta: JOB_META,
    });
    expect(transports[0]!.sentOfType("write-ready")).toHaveLength(1);

    const readReady = new Promise<JobReadReadyEvent>((resolve) => {
      const unsubscribe = built.eventBus.subscribe(
        ReactorEventTypes.JOB_READ_READY,
        (_type: number, event: JobReadReadyEvent) => {
          unsubscribe();
          resolve(event);
        },
      );
    });
    transports[0]!.send({
      type: "read-ready",
      shardId: SHARD_ID,
      jobId: "job-1",
      operations: [OPERATION],
    });

    const event = await within(readReady, "JOB_READ_READY via the hybrid");
    expect(event.jobId).toBe("job-1");
    expect(stub.indexed).toEqual([[OPERATION]]);
    expect(stub.sequence).toEqual(["stub:index", "read-ready:job-1"]);
  });

  it("forwards a worker death to onFatal", async () => {
    const fatal: Array<{ shardId: string; reason: Error }> = [];
    await build({
      onFatal: (shardId, reason) => fatal.push({ shardId, reason }),
    });

    transports[0]!.emit("exit", 1);

    expect(fatal).toHaveLength(1);
    expect(fatal[0]!.shardId).toBe(SHARD_ID);
    expect(fatal[0]!.reason).toBeInstanceOf(Error);
  });
});
