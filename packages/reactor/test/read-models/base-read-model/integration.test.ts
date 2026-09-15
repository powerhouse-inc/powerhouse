import { PGlite } from "@electric-sql/pglite";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { generateId } from "@powerhousedao/shared/document-model";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PAGE_LIMIT,
  KyselyOperationIndex,
} from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import {
  BaseReadModel,
  defaultReadModelIndexingConfig,
  type ReadModelIndexingConfig,
} from "../../../src/read-models/base-read-model.js";
import { KyselyDocumentView } from "../../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../../src/storage/kysely/document-indexer.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type {
  DocumentIndexerDatabase,
  Database as StorageDatabase,
} from "../../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";

type Database = StorageDatabase &
  DocumentViewDatabase &
  DocumentIndexerDatabase;

type IndexedCoordinate = {
  documentId: string;
  branch: string;
  scope: string;
  index: number;
};

/**
 * SpyReadModel tracks all calls to indexOperations with their operation coordinates.
 * Used to verify operations are indexed exactly once per (documentId, branch, scope, index).
 */
class SpyReadModel extends BaseReadModel {
  public indexedCoordinates: IndexedCoordinate[] = [];

  async indexOperations(items: OperationWithContext[]): Promise<void> {
    for (const item of items) {
      this.indexedCoordinates.push({
        documentId: item.context.documentId,
        branch: item.context.branch,
        scope: item.context.scope,
        index: item.operation.index,
      });
    }
    await super.indexOperations(items);
  }
}

function createOperation(
  documentId: string,
  scope: string,
  branch: string,
  index: number,
  ordinal: number,
): OperationWithContext {
  const timestamp = new Date().toISOString();
  return {
    operation: {
      index,
      timestampUtcMs: timestamp,
      hash: `hash-${ordinal}`,
      skip: 0,
      id: generateId(),
      action: {
        id: generateId(),
        type: "TEST_ACTION",
        timestampUtcMs: timestamp,
        input: {},
        scope: "global",
      },
    },
    context: {
      documentId,
      documentType: "test/document",
      scope,
      branch,
      resultingState: JSON.stringify({}),
      ordinal,
    },
  };
}

describe("BaseReadModel idempotency", () => {
  let db: Kysely<Database>;
  let operationIndex: IOperationIndex;
  let mockWriteCache: IWriteCache;
  const READ_MODEL_ID = "spy-read-model";

  beforeEach(async () => {
    const dialect = new PGliteDialect(new PGlite());
    const baseDb = new Kysely<Database>({ dialect });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Migration failed: ${result.error.message}`);
    }
    db = baseDb.withSchema(REACTOR_SCHEMA);
    operationIndex = new KyselyOperationIndex(
      db as unknown as Kysely<StorageDatabase>,
    );

    mockWriteCache = {
      getState: vi.fn().mockResolvedValue({}),
      putState: vi.fn(),
      putRun: vi.fn(),
      invalidate: vi.fn().mockReturnValue(0),
      clear: vi.fn(),
      startup: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("should index operations only once during normal operation", async () => {
    const consistencyTracker = new ConsistencyTracker();
    const spyModel = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker,
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: true,
        indexing: defaultReadModelIndexingConfig,
      },
    );

    await spyModel.init();

    const documentId = generateId();
    const operations = [
      createOperation(documentId, "global", "main", 0, 1),
      createOperation(documentId, "global", "main", 1, 2),
      createOperation(documentId, "global", "main", 2, 3),
    ];

    await spyModel.indexOperations(operations);

    expect(spyModel.indexedCoordinates).toHaveLength(3);
    expect(spyModel.indexedCoordinates[0]).toEqual({
      documentId,
      branch: "main",
      scope: "global",
      index: 0,
    });
    expect(spyModel.indexedCoordinates[1]).toEqual({
      documentId,
      branch: "main",
      scope: "global",
      index: 1,
    });
    expect(spyModel.indexedCoordinates[2]).toEqual({
      documentId,
      branch: "main",
      scope: "global",
      index: 2,
    });
  });

  it("should not re-index already processed operations after restart", async () => {
    const consistencyTracker1 = new ConsistencyTracker();
    const spyModel1 = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker1,
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: true,
        indexing: defaultReadModelIndexingConfig,
      },
    );

    await spyModel1.init();

    const documentId = generateId();
    const operations = [
      createOperation(documentId, "global", "main", 0, 1),
      createOperation(documentId, "global", "main", 1, 2),
      createOperation(documentId, "global", "main", 2, 3),
    ];

    await spyModel1.indexOperations(operations);
    expect(spyModel1.indexedCoordinates).toHaveLength(3);

    const viewState = await db
      .selectFrom("ViewState")
      .selectAll()
      .where("readModelId", "=", READ_MODEL_ID)
      .executeTakeFirst();
    expect(viewState?.lastOrdinal).toBe(3);

    const consistencyTracker2 = new ConsistencyTracker();
    const spyModel2 = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker2,
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: true,
        indexing: defaultReadModelIndexingConfig,
      },
    );

    await spyModel2.init();

    expect(spyModel2.indexedCoordinates).toHaveLength(0);
  });

  it("should only index new operations after restart with new operations", async () => {
    const consistencyTracker1 = new ConsistencyTracker();
    const spyModel1 = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker1,
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: true,
        indexing: defaultReadModelIndexingConfig,
      },
    );

    await spyModel1.init();

    const documentId = generateId();
    const initialOperations = [
      createOperation(documentId, "global", "main", 0, 1),
      createOperation(documentId, "global", "main", 1, 2),
      createOperation(documentId, "global", "main", 2, 3),
    ];

    await spyModel1.indexOperations(initialOperations);
    expect(spyModel1.indexedCoordinates).toHaveLength(3);

    const txn = operationIndex.start();
    txn.write([
      {
        ...initialOperations[0]!.operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
        sourceRemote: "",
      },
      {
        ...initialOperations[1]!.operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
        sourceRemote: "",
      },
      {
        ...initialOperations[2]!.operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
        sourceRemote: "",
      },
    ]);

    const newOp1 = createOperation(documentId, "global", "main", 3, 4);
    const newOp2 = createOperation(documentId, "global", "main", 4, 5);

    txn.write([
      {
        ...newOp1.operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
        sourceRemote: "",
      },
      {
        ...newOp2.operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
        sourceRemote: "",
      },
    ]);

    await operationIndex.commit(txn);

    const consistencyTracker2 = new ConsistencyTracker();
    const spyModel2 = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker2,
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: true,
        indexing: defaultReadModelIndexingConfig,
      },
    );

    await spyModel2.init();

    expect(spyModel2.indexedCoordinates).toHaveLength(2);
    expect(spyModel2.indexedCoordinates[0]).toEqual({
      documentId,
      branch: "main",
      scope: "global",
      index: 3,
    });
    expect(spyModel2.indexedCoordinates[1]).toEqual({
      documentId,
      branch: "main",
      scope: "global",
      index: 4,
    });
  });

  it("should handle multiple documents with each (docId, branch, scope, index) indexed once", async () => {
    const consistencyTracker1 = new ConsistencyTracker();
    const spyModel1 = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker1,
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: true,
        indexing: defaultReadModelIndexingConfig,
      },
    );

    await spyModel1.init();

    const doc1Id = generateId();
    const doc2Id = generateId();
    const initialOperations = [
      createOperation(doc1Id, "global", "main", 0, 1),
      createOperation(doc1Id, "global", "main", 1, 2),
      createOperation(doc2Id, "global", "main", 0, 3),
      createOperation(doc2Id, "global", "main", 1, 4),
    ];

    await spyModel1.indexOperations(initialOperations);
    expect(spyModel1.indexedCoordinates).toHaveLength(4);

    const txn = operationIndex.start();
    for (const op of initialOperations) {
      txn.write([
        {
          ...op.operation,
          documentId: op.context.documentId,
          documentType: "test/document",
          scope: "global",
          branch: "main",
          sourceRemote: "",
        },
      ]);
    }

    const newOps = [
      createOperation(doc1Id, "global", "main", 2, 5),
      createOperation(doc2Id, "global", "main", 2, 6),
    ];

    for (const op of newOps) {
      txn.write([
        {
          ...op.operation,
          documentId: op.context.documentId,
          documentType: "test/document",
          scope: "global",
          branch: "main",
          sourceRemote: "",
        },
      ]);
    }

    await operationIndex.commit(txn);

    const consistencyTracker2 = new ConsistencyTracker();
    const spyModel2 = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker2,
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: true,
        indexing: defaultReadModelIndexingConfig,
      },
    );

    await spyModel2.init();

    expect(spyModel2.indexedCoordinates).toHaveLength(2);

    const doc1NewOp = spyModel2.indexedCoordinates.find(
      (c) => c.documentId === doc1Id,
    );
    const doc2NewOp = spyModel2.indexedCoordinates.find(
      (c) => c.documentId === doc2Id,
    );

    expect(doc1NewOp).toEqual({
      documentId: doc1Id,
      branch: "main",
      scope: "global",
      index: 2,
    });

    expect(doc2NewOp).toEqual({
      documentId: doc2Id,
      branch: "main",
      scope: "global",
      index: 2,
    });
  });

  it("should catch up past a single default page during init", async () => {
    const documentId = generateId();
    const total = DEFAULT_PAGE_LIMIT + 50;

    const txn = operationIndex.start();
    txn.write(
      Array.from({ length: total }, (_, i) => ({
        ...createOperation(documentId, "global", "main", i, i + 1).operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
        sourceRemote: "",
      })),
    );
    await operationIndex.commit(txn);

    const spyModel = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      new ConsistencyTracker(),
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: true,
        indexing: defaultReadModelIndexingConfig,
      },
    );
    const indexSpy = vi.spyOn(spyModel, "indexOperations");

    await spyModel.init();

    expect(spyModel.indexedCoordinates).toHaveLength(total);
    expect(indexSpy.mock.calls.length).toBeGreaterThan(1);

    const viewState = await db
      .selectFrom("ViewState")
      .selectAll()
      .where("readModelId", "=", READ_MODEL_ID)
      .executeTakeFirst();
    expect(viewState?.lastOrdinal).toBe(total);
  });
});

const BATCH_SIZE = 40;
const CHUNKED: ReadModelIndexingConfig = {
  commitChunkSize: 7,
  yieldDeadlineMs: 0,
};
const UNCHUNKED: ReadModelIndexingConfig = {
  commitChunkSize: Number.MAX_SAFE_INTEGER,
  yieldDeadlineMs: 0,
};

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

describe("BaseReadModel chunked indexing", () => {
  let db: Kysely<Database>;
  let operationStore: IOperationStore;
  let operationIndex: IOperationIndex;
  let writeCache: IWriteCache;
  let tracker: ConsistencyTracker;

  beforeEach(async () => {
    const baseDb = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Test migration failed: ${result.error.message}`);
    }
    db = baseDb.withSchema(REACTOR_SCHEMA);

    operationStore = new KyselyOperationStore(
      db as unknown as Kysely<StorageDatabase>,
    );
    operationIndex = new KyselyOperationIndex(
      db as unknown as Kysely<StorageDatabase>,
    );
    writeCache = {
      getState: vi.fn().mockResolvedValue({}),
      putState: vi.fn(),
      putRun: vi.fn(),
      invalidate: vi.fn().mockReturnValue(0),
      clear: vi.fn(),
      startup: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as unknown as IWriteCache;
    tracker = new ConsistencyTracker();
  });

  afterEach(async () => {
    await db.destroy();
  });

  function makeView(indexing: ReadModelIndexingConfig) {
    return new KyselyDocumentView(
      db as unknown as Kysely<StorageDatabase & DocumentViewDatabase>,
      operationStore,
      operationIndex,
      writeCache,
      tracker,
      false,
      indexing,
    );
  }

  it("commits the batch as consecutive in-order slices covering it exactly", async () => {
    const view = makeView(CHUNKED);
    await view.init();

    const seen: number[][] = [];
    const commit = (
      view as unknown as {
        commitOperations: (i: OperationWithContext[]) => Promise<void>;
      }
    ).commitOperations.bind(view);
    (
      view as unknown as {
        commitOperations: (i: OperationWithContext[]) => Promise<void>;
      }
    ).commitOperations = async (items: OperationWithContext[]) => {
      seen.push(items.map((i) => i.operation.index));
      await commit(items);
    };

    const batch = makeBatch(generateId(), BATCH_SIZE);
    await view.indexOperations(batch);

    expect(seen.length).toBe(Math.ceil(BATCH_SIZE / CHUNKED.commitChunkSize));
    expect(seen.flat()).toEqual(batch.map((i) => i.operation.index));
    for (const chunk of seen) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNKED.commitChunkSize);
    }
  });

  it("produces the same snapshot chunked as unchunked", async () => {
    const documentId = generateId();
    const batch = makeBatch(documentId, BATCH_SIZE);

    const unchunked = makeView(UNCHUNKED);
    await unchunked.init();
    await unchunked.indexOperations(batch);
    const expected = await db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "=", documentId)
      .orderBy("scope", "asc")
      .execute();
    const expectedSlugs = await db
      .selectFrom("SlugMapping")
      .selectAll()
      .where("documentId", "=", documentId)
      .orderBy("slug", "asc")
      .execute();

    await db.deleteFrom("DocumentSnapshot").execute();
    await db.deleteFrom("SlugMapping").execute();
    await db
      .updateTable("ViewState")
      .set({ lastOrdinal: 0 })
      .where("readModelId", "=", "document-view")
      .execute();

    const chunked = makeView(CHUNKED);
    await chunked.init();
    await chunked.indexOperations(batch);
    const actual = await db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "=", documentId)
      .orderBy("scope", "asc")
      .execute();
    const actualSlugs = await db
      .selectFrom("SlugMapping")
      .selectAll()
      .where("documentId", "=", documentId)
      .orderBy("slug", "asc")
      .execute();

    expect(actual.length).toBe(expected.length);
    expect(actual.length).toBeGreaterThan(0);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i]!.scope).toBe(expected[i]!.scope);
      expect(actual[i]!.content).toEqual(expected[i]!.content);
      expect(actual[i]!.slug).toBe(expected[i]!.slug);
      expect(actual[i]!.name).toBe(expected[i]!.name);
      expect(actual[i]!.lastOperationIndex).toBe(
        expected[i]!.lastOperationIndex,
      );
      expect(actual[i]!.lastOperationHash).toBe(expected[i]!.lastOperationHash);
      expect(actual[i]!.snapshotVersion).toBe(expected[i]!.snapshotVersion);
    }
    expect(actualSlugs.map((r) => r.slug)).toEqual(
      expectedSlugs.map((r) => r.slug),
    );
  });

  it("holds a token-carrying reader until the whole batch is indexed", async () => {
    const documentId = generateId();
    const batch = makeBatch(documentId, BATCH_SIZE);
    const last = batch[batch.length - 1]!;

    const view = makeView(CHUNKED);
    await view.init();

    let resolvedDuringPass = false;
    let passFinished = false;
    const waiter = view
      .waitForConsistency({
        version: 1,
        createdAtUtcIso: new Date().toISOString(),
        coordinates: [
          {
            documentId,
            scope: "global",
            branch: "main",
            operationIndex: last.operation.index,
          },
        ],
      })
      .then(() => {
        resolvedDuringPass = !passFinished;
      });

    await view.indexOperations(batch);
    passFinished = true;
    await waiter;

    expect(resolvedDuringPass).toBe(false);

    const snapshot = await db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", "global")
      .executeTakeFirst();
    expect(snapshot?.lastOperationIndex).toBe(last.operation.index);
    expect((snapshot?.content as { name: string }).name).toBe(
      `drive-${BATCH_SIZE - 1}`,
    );
  });

  it("advances the stored ordinal only once the whole batch is committed", async () => {
    const documentId = generateId();
    const batch = makeBatch(documentId, BATCH_SIZE);

    const view = makeView(CHUNKED);
    await view.init();

    const ordinalsSeenMidPass: (number | undefined)[] = [];
    const commit = (
      view as unknown as {
        commitOperations: (i: OperationWithContext[]) => Promise<void>;
      }
    ).commitOperations.bind(view);
    (
      view as unknown as {
        commitOperations: (i: OperationWithContext[]) => Promise<void>;
      }
    ).commitOperations = async (items: OperationWithContext[]) => {
      await commit(items);
      const row = await db
        .selectFrom("ViewState")
        .select("lastOrdinal")
        .where("readModelId", "=", "document-view")
        .executeTakeFirst();
      ordinalsSeenMidPass.push(row?.lastOrdinal);
    };

    await view.indexOperations(batch);

    expect(ordinalsSeenMidPass.length).toBeGreaterThan(1);
    expect(ordinalsSeenMidPass.every((o) => o === 0)).toBe(true);

    const after = await db
      .selectFrom("ViewState")
      .select("lastOrdinal")
      .where("readModelId", "=", "document-view")
      .executeTakeFirst();
    expect(after?.lastOrdinal).toBe(BATCH_SIZE);
  });

  it("lets an unrelated query through while the batch is being indexed", async () => {
    const view = makeView(CHUNKED);
    await view.init();

    let indexing = true;
    let readsDuringPass = 0;
    const reader = (async () => {
      while (indexing) {
        await sql`SELECT 1 AS x`.execute(db);
        readsDuringPass++;
        await new Promise((r) => setTimeout(r, 0));
      }
    })();

    try {
      await view.indexOperations(makeBatch(generateId(), BATCH_SIZE));
    } finally {
      indexing = false;
      await reader;
    }

    expect(readsDuringPass).toBeGreaterThan(1);
  });

  it("indexes the same relationship edges chunked as unchunked", async () => {
    const sourceId = generateId();
    const batch = makeRelationshipBatch(sourceId, BATCH_SIZE);

    const makeIndexer = (indexing: ReadModelIndexingConfig) =>
      new KyselyDocumentIndexer(
        db as never,
        operationIndex,
        writeCache,
        new ConsistencyTracker(),
        indexing,
      );

    const unchunked = makeIndexer(UNCHUNKED);
    await unchunked.init();
    await unchunked.indexOperations(batch);
    const expected = await db
      .selectFrom("DocumentRelationship")
      .select(["sourceId", "targetId", "relationshipType"])
      .orderBy("targetId", "asc")
      .execute();

    await db.deleteFrom("DocumentRelationship").execute();
    await db
      .updateTable("ViewState")
      .set({ lastOrdinal: 0 })
      .where("readModelId", "=", "document-indexer")
      .execute();

    const chunked = makeIndexer(CHUNKED);
    await chunked.init();
    await chunked.indexOperations(batch);
    const actual = await db
      .selectFrom("DocumentRelationship")
      .select(["sourceId", "targetId", "relationshipType"])
      .orderBy("targetId", "asc")
      .execute();

    expect(actual.length).toBe(BATCH_SIZE);
    expect(actual).toEqual(expected);
  });

  it("opens no transaction per chunk for a batch with no relationship operation", async () => {
    const indexer = new KyselyDocumentIndexer(
      db as never,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
      CHUNKED,
    );
    await indexer.init();

    const spy = vi.spyOn(
      db as unknown as { transaction: () => unknown },
      "transaction",
    );
    await indexer.indexOperations(makeBatch(generateId(), BATCH_SIZE));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
