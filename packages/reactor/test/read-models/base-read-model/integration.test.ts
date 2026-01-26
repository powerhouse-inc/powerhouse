import { PGlite } from "@electric-sql/pglite";
import { generateId } from "document-model/core";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import { BaseReadModel } from "../../../src/read-models/base-read-model.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { OperationWithContext } from "../../../src/storage/interfaces.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";

type Database = StorageDatabase & DocumentViewDatabase;

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
      READ_MODEL_ID,
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
      READ_MODEL_ID,
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
      READ_MODEL_ID,
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
      READ_MODEL_ID,
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
      },
      {
        ...initialOperations[1]!.operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
      },
      {
        ...initialOperations[2]!.operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
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
      },
      {
        ...newOp2.operation,
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
      },
    ]);

    await operationIndex.commit(txn);

    const consistencyTracker2 = new ConsistencyTracker();
    const spyModel2 = new SpyReadModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      mockWriteCache,
      consistencyTracker2,
      READ_MODEL_ID,
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
      READ_MODEL_ID,
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
      READ_MODEL_ID,
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
});
