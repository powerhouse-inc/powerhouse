import { PGlite } from "@electric-sql/pglite";
import { defaultCatchUpConfig } from "../../src/catch-up/types.js";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { generateId } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/core/types.js";
import { buildProjectionStack } from "../../src/projection/projection-worker/build-projection-stack.js";
import type {
  DbConfig,
  ProjectionInitMessage,
} from "../../src/projection/protocol.js";
import type { ReadModelIndexingConfig } from "../../src/read-models/base-read-model.js";
import type { IReadModel } from "../../src/read-models/interfaces.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../src/storage/migrations/migrator.js";

const DB: DbConfig = {
  host: "localhost",
  port: 5432,
  database: "test",
  user: "test",
  password: "test",
};

const HOST_INDEXING: ReadModelIndexingConfig = {
  commitChunkSize: 7,
  yieldDeadlineMs: 0,
};

const BATCH_SIZE = 40;

function driveState(name: string, fileCount: number) {
  return {
    header: { name, slug: "stable-drive-slug" },
    global: {
      name,
      nodes: Array.from({ length: fileCount }, (_, i) => ({
        id: `node-${i}`,
        name: `file-${i}`,
      })),
    },
  };
}

/** One document/scope/branch, so every operation rewrites the same row. */
function makeBatch(documentId: string, size: number): OperationWithContext[] {
  const items: OperationWithContext[] = [];
  for (let i = 0; i < size; i++) {
    items.push({
      operation: {
        index: i,
        timestampUtcMs: new Date(1700000000000 + i).toISOString(),
        hash: `hash-${i}`,
        skip: 0,
        id: generateId(),
        action: {
          id: generateId(),
          type: "SET_DRIVE_NAME",
          input: { name: `drive-${i}` },
          scope: "global",
          timestampUtcMs: new Date(1700000000000 + i).toISOString(),
        },
      },
      context: {
        documentId,
        documentType: "powerhouse/document-drive",
        scope: "global",
        branch: "main",
        resultingState: JSON.stringify(driveState(`drive-${i}`, i)),
        ordinal: i + 1,
      },
    } as unknown as OperationWithContext);
  }
  return items;
}

function makeRelationshipBatch(
  sourceId: string,
  size: number,
): OperationWithContext[] {
  const items: OperationWithContext[] = [];
  for (let i = 0; i < size; i++) {
    items.push({
      operation: {
        index: i,
        timestampUtcMs: new Date(1700000000000 + i).toISOString(),
        hash: `hash-${i}`,
        skip: 0,
        id: generateId(),
        action: {
          id: generateId(),
          type: "ADD_RELATIONSHIP",
          input: {
            sourceId,
            targetId: `target-${i}`,
            relationshipType: "child",
          },
          scope: "global",
          timestampUtcMs: new Date(1700000000000 + i).toISOString(),
        },
      },
      context: {
        documentId: sourceId,
        documentType: "powerhouse/document-drive",
        scope: "global",
        branch: "main",
        resultingState: JSON.stringify({ global: {} }),
        ordinal: i + 1,
      },
    } as unknown as OperationWithContext);
  }
  return items;
}

/** Records the size of every chunk the model's own commit receives. */
function recordChunks(model: IReadModel): number[][] {
  const seen: number[][] = [];
  const target = model as unknown as {
    commitOperations: (items: OperationWithContext[]) => Promise<void>;
  };
  const original = target.commitOperations.bind(model);
  target.commitOperations = async (items: OperationWithContext[]) => {
    seen.push(items.map((item) => item.operation.index));
    await original(items);
  };
  return seen;
}

describe("buildProjectionStack indexing config", () => {
  let baseDb: Kysely<Database>;

  beforeEach(async () => {
    baseDb = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Test migration failed: ${result.error.message}`);
    }
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  async function buildStack() {
    const init: ProjectionInitMessage = {
      type: "init",
      correlationId: "corr-1",
      shardId: "projection-shard-0",
      shardIndex: 0,
      shardCount: 1,
      db: DB,
      models: [],
      preReadyKinds: ["document-view"],
      postReadyKinds: ["document-indexer"],
      chainDepthReportIntervalMs: 1000,
      indexing: HOST_INDEXING,
      catchUp: defaultCatchUpConfig,
    };

    return buildProjectionStack({
      init,
      database: baseDb,
      logger: new ConsoleLogger(["test"]),
      events: {
        onReadReady: () => {},
        onReadModelIndexed: () => {},
        onBatchCompleted: () => {},
        onReadModelSwept: () => {},
      },
    });
  }

  it("builds the document view with the host's chunk size", async () => {
    const stack = await buildStack();
    const view = stack.coordinator.preReady[0];
    const seen = recordChunks(view);

    const batch = makeBatch(generateId(), BATCH_SIZE);
    await view.indexOperations(batch);

    expect(seen.length).toBe(
      Math.ceil(BATCH_SIZE / HOST_INDEXING.commitChunkSize),
    );
    expect(seen.flat()).toEqual(batch.map((item) => item.operation.index));

    await stack.shutdown();
  });

  it("builds the document indexer with the host's chunk size", async () => {
    const stack = await buildStack();
    const indexer = stack.coordinator.postReady[0];
    const seen = recordChunks(indexer);

    const batch = makeRelationshipBatch(generateId(), BATCH_SIZE);
    await indexer.indexOperations(batch);

    expect(seen.length).toBe(
      Math.ceil(BATCH_SIZE / HOST_INDEXING.commitChunkSize),
    );
    expect(seen.flat()).toEqual(batch.map((item) => item.operation.index));

    await stack.shutdown();
  });
});
