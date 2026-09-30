import {
  generateId,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { defaultCatchUpConfig } from "../../../src/catch-up/types.js";
import type { Database as CoreDatabase } from "../../../src/core/types.js";
import {
  buildProjectionStack,
  type ProjectionStack,
} from "../../../src/projection/projection-worker/build-projection-stack.js";
import type { ProjectionInitMessage } from "../../../src/projection/protocol.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { REACTOR_SCHEMA } from "../../../src/storage/migrations/migrator.js";
import { purgeMarker, seedPurgedDocument } from "../helpers.js";
import {
  appendGlobal,
  createDocument,
  createScratchDatabase,
  deleteOperations,
  DOCUMENT_TYPE,
} from "./fixtures.js";

describe("projection worker write cache on a marker", () => {
  let baseDb: Kysely<CoreDatabase>;
  let db: Kysely<Database>;
  let drop: () => Promise<void>;
  let stack: ProjectionStack | undefined;

  beforeEach(async () => {
    ({ db: baseDb, drop } = await createScratchDatabase("reactor_purge_proj"));
    db = baseDb.withSchema(REACTOR_SCHEMA) as unknown as Kysely<Database>;
  });

  afterEach(async () => {
    await stack?.shutdown();
    stack = undefined;
    await drop();
  });

  async function buildStack(intervalMs: number) {
    const init: ProjectionInitMessage = {
      type: "init",
      correlationId: "corr-1",
      shardId: "projection-shard-0",
      shardIndex: 0,
      shardCount: 1,
      db: { host: "", port: 0, database: "", user: "", password: "" },
      models: [{ spec: { kind: "test" } } as never],
      preReadyKinds: [],
      postReadyKinds: ["document-indexer"],
      chainDepthReportIntervalMs: 1000,
      indexing: { commitChunkSize: 100, yieldDeadlineMs: 0 },
      catchUp: { ...defaultCatchUpConfig, intervalMs },
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
      loadFactory: () => Promise.resolve(documentModelDocumentModelModule),
    });
  }

  /** A document the worker's cache holds in two scopes, then purged. */
  async function cachedThenPurged(target: ProjectionStack) {
    const store = new KyselyOperationStore(db);
    const documentId = generateId();
    await createDocument(store, documentId);
    await appendGlobal(store, documentId, 2);
    await target.writeCache.getState(documentId, "document", "main");
    await target.writeCache.getState(documentId, "global", "main");
    expect(
      target.writeCache.getStream(documentId, "global", "main"),
    ).toBeDefined();

    await deleteOperations(db, documentId);
    const marker = purgeMarker(documentId);
    const ordinal = await seedPurgedDocument(
      { db, store, index: new KyselyOperationIndex(db) },
      marker,
    );
    return { documentId, marker, ordinal };
  }

  function evicted(target: ProjectionStack, documentId: string): boolean {
    return (
      target.writeCache.getStream(documentId, "document", "main") ===
        undefined &&
      target.writeCache.getStream(documentId, "global", "main") === undefined
    );
  }

  it("evicts the id when a relayed write carries its marker", async () => {
    stack = await buildStack(60_000);
    const { documentId, marker, ordinal } = await cachedThenPurged(stack);

    const item: OperationWithContext = {
      operation: marker,
      context: {
        documentId,
        documentType: DOCUMENT_TYPE,
        scope: "document",
        branch: "main",
        ordinal,
      },
    };
    await stack.relayWriteReady({
      jobId: generateId(),
      operations: [item],
      jobMeta: { batchId: generateId(), batchJobIds: [] },
    });

    expect(evicted(stack, documentId)).toBe(true);
  });

  it("evicts the id when a sweep applies its marker", async () => {
    stack = await buildStack(50);
    const { documentId } = await cachedThenPurged(stack);

    await vi.waitFor(() => expect(evicted(stack!, documentId)).toBe(true), {
      timeout: 5_000,
    });
  });
});
