import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultDatabase } from "../../src/core/create-default-database.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type { ProjectionShardManager } from "../../src/projection/projection-shard-manager.js";
import type { DbConfig } from "../../src/projection/protocol.js";
import type { ConsistencyCoordinate, JobMeta } from "../../src/shared/types.js";
import {
  createFakeProjectionTransports,
  type FakeProjectionTransport,
} from "./fake-projection-transport.js";

const SHARD_DB: DbConfig = {
  host: "localhost",
  port: 5432,
  database: "test",
  user: "test",
  password: "test",
};

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
  {
    documentId: "doc-1",
    scope: "global",
    branch: "main",
    operationIndex: 4,
  },
];

async function within<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 250,
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

describe("withProjectionShards consistency wiring", () => {
  let db: Kysely<Database> | undefined;
  let module: InProcessReactorModule | undefined;

  afterEach(async () => {
    if (module) {
      await (module.readModelCoordinator as ProjectionShardManager).shutdown();
      module = undefined;
    }
    if (db) {
      await db.destroy();
      db = undefined;
    }
  });

  async function buildShardedModule(): Promise<{
    module: InProcessReactorModule;
    transports: FakeProjectionTransport[];
  }> {
    db = await createDefaultDatabase();
    const { transports, factory } = createFakeProjectionTransports();
    const built = await new ReactorBuilder()
      .withKysely(db)
      .withProjectionShards({
        db: SHARD_DB,
        shardCount: 1,
        preReadyKinds: ["document-view", "document-indexer"],
        postReadyKinds: [],
        shutdownGraceMs: 10,
      })
      .withProjectionWorkerFactory(factory)
      .buildModule();
    module = built;
    return { module: built, transports };
  }

  it("advances the host consistency trackers the read path waits on", async () => {
    const { module: built, transports } = await buildShardedModule();

    await built.eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
      operations: [OPERATION],
      jobMeta: JOB_META,
    });

    expect(transports).toHaveLength(1);
    expect(transports[0]!.sentOfType("write-ready")).toHaveLength(1);

    const documentViewWait =
      built.documentViewConsistencyTracker.waitFor(COORDINATES);
    const documentIndexerWait =
      built.documentIndexerConsistencyTracker.waitFor(COORDINATES);

    for (const readModelName of ["document-view", "document-indexer"]) {
      transports[0]!.send({
        type: "readmodel-indexed",
        shardId: "projection-shard-0",
        jobId: "job-1",
        readModelName,
        stage: "pre_ready",
        durationMs: 1,
        operationCount: 1,
        success: true,
      });
    }
    transports[0]!.send({
      type: "read-ready",
      shardId: "projection-shard-0",
      jobId: "job-1",
      operations: [OPERATION],
    });

    await within(
      Promise.all([documentViewWait, documentIndexerWait]),
      "host consistency trackers under withProjectionShards",
    );
  });

  it("lets a document-view read carrying a consistency token complete", async () => {
    const { module: built, transports } = await buildShardedModule();

    await built.eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
      operations: [OPERATION],
      jobMeta: JOB_META,
    });

    const read = built.documentView.waitForConsistency({
      version: 1,
      createdAtUtcIso: "2024-01-01T00:00:00.000Z",
      coordinates: COORDINATES,
    });

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

    await within(
      read,
      "document-view waitForConsistency under withProjectionShards",
    );
  });
});
