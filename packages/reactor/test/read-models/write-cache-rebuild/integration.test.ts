import {
  generateId,
  type Action,
  type Operation,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { OperationIndexEntry } from "../../../src/cache/operation-index-types.js";
import {
  createKyselyWatermarkProbe,
  SettledWatermark,
} from "../../../src/catch-up/settled-watermark.js";
import {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "../../../src/read-models/document-view.js";
import type { Database } from "../../../src/core/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import {
  KyselyDocumentIndexer,
  type IndexerDatabase,
} from "../../../src/storage/kysely/document-indexer.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import {
  createCreateDocumentOperation,
  createTestOperationStore,
  createTestRegistry,
  createUpgradeDocumentOperation,
} from "../../factories.js";

const BRANCH = "main";
const DOC_TYPE = "powerhouse/document-model";

/**
 * R1 backfill (docs/plans/2026-10-02-testing-policy.md): the write-cache /
 * read-model rebuild seam. Every existing read-model test substitutes a
 * vi.fn() getState for IWriteCache (catch-up-guards.test.ts:168,
 * base-read-model/integration.test.ts:156), so the contract between
 * BaseReadModel.rebuildStateForOperations (base-read-model.ts:477) and the
 * real KyselyWriteCache rebuild - targetRevision semantics, state shape,
 * header placement - was asserted by no test. The September data-loss bug
 * lived on exactly this seam. These tests run the real pair end to end:
 * real operation store, real write cache with the real reducer, real
 * read models, content asserted per R2.
 */
describe("read models rebuilding through the real write cache", () => {
  let db: Kysely<StorageDatabase>;
  let store: KyselyOperationStore;
  let operationIndex: KyselyOperationIndex;
  let writeCache: KyselyWriteCache;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
    cleanup = async () => {
      await setup.baseDb.destroy();
      await setup.cleanup();
    };
    operationIndex = new KyselyOperationIndex(db);
    writeCache = new KyselyWriteCache(
      setup.keyframeStore,
      store,
      createTestRegistry(),
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 100 },
    );
    await writeCache.startup();
  });

  afterEach(async () => {
    await writeCache.shutdown();
    await cleanup();
  });

  function setNameOperation(index: number, name: string): Operation {
    const timestampUtcMs = new Date(1_700_000_000_000 + index).toISOString();
    return {
      id: generateId(),
      index,
      skip: 0,
      hash: `hash-global-${index}`,
      timestampUtcMs,
      action: {
        id: generateId(),
        type: "SET_MODEL_NAME",
        scope: "global",
        timestampUtcMs,
        input: { name },
      } as Action,
    };
  }

  function entryFor(
    documentId: string,
    scope: string,
    operation: Operation,
  ): OperationIndexEntry {
    return {
      id: operation.id,
      documentId,
      documentType: DOC_TYPE,
      scope,
      branch: BRANCH,
      sourceRemote: "",
      index: operation.index,
      timestampUtcMs: operation.timestampUtcMs,
      hash: operation.hash,
      skip: operation.skip,
      action: operation.action,
    };
  }

  async function commitEntries(entries: OperationIndexEntry[]) {
    const txn = operationIndex.start();
    txn.write(entries);
    return operationIndex.commit(txn);
  }

  function makeWatermark(): SettledWatermark {
    return new SettledWatermark(
      createKyselyWatermarkProbe(db),
      new ConsoleLogger(["test"]),
    );
  }

  /** Seeds a reducible document-model stream, as the executor writes one. */
  async function seedDocument(
    documentId: string,
    globalOps: Operation[],
  ): Promise<{ documentOps: Operation[] }> {
    const initialState =
      documentModelDocumentModelModule.utils.createDocument().state;
    const documentOps = [
      createCreateDocumentOperation(documentId, DOC_TYPE),
      createUpgradeDocumentOperation(
        documentId,
        0,
        1,
        initialState as Record<string, unknown>,
      ),
    ];
    await store.apply(documentId, DOC_TYPE, "document", BRANCH, 0, (txn) => {
      for (const op of documentOps) txn.addOperations(op);
    });
    await store.apply(documentId, DOC_TYPE, "global", BRANCH, 0, (txn) => {
      for (const op of globalOps) txn.addOperations(op);
    });
    return { documentOps };
  }

  async function snapshot(documentId: string, scope: string) {
    return (db as unknown as Kysely<Database>)
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .executeTakeFirst();
  }

  // The store holds the full stream before any entry is swept, so a cache
  // that ignores targetRevision and returns head state writes name-2 into
  // the snapshot on the first sweep. The convention under test is
  // IWriteCache.getState's "index of the last operation to apply"
  // (src/cache/write/interfaces.ts:17).
  it("a swept operation's snapshot carries the state at its own revision, not the head", async () => {
    const documentId = generateId();
    const globalOps = [
      setNameOperation(1, "name-1"),
      setNameOperation(2, "name-2"),
    ];
    const { documentOps } = await seedDocument(documentId, globalOps);

    const view = new KyselyDocumentView(
      db as never,
      store,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
      DeletedDocumentRead.NotFound,
    );
    const watermark = makeWatermark();
    view.attachCatchUp(watermark, 100_000);
    await view.init();

    await commitEntries([
      entryFor(documentId, "document", documentOps[0]!),
      entryFor(documentId, "document", documentOps[1]!),
      entryFor(documentId, "global", globalOps[0]!),
    ]);
    const firstSettled = await watermark.refresh();
    await view.sweep(
      firstSettled,
      await operationIndex.getOrdinalsInRange(0, firstSettled, 10),
    );

    const afterFirst = await snapshot(documentId, "global");
    expect(afterFirst?.content).toMatchObject({ name: "name-1" });
    expect(afterFirst?.lastOperationIndex).toBe(1);

    await commitEntries([entryFor(documentId, "global", globalOps[1]!)]);
    const secondSettled = await watermark.refresh();
    await view.sweep(
      secondSettled,
      await operationIndex.getOrdinalsInRange(0, secondSettled, 10),
    );

    const afterSecond = await snapshot(documentId, "global");
    expect(afterSecond?.content).toMatchObject({ name: "name-2" });
    expect(afterSecond?.lastOperationIndex).toBe(2);

    const document = await view.get(documentId);
    expect(
      (document.state as Record<string, Record<string, unknown>>).global,
    ).toMatchObject({ name: "name-2" });
  });

  // With a mocked cache the indexer accepted any stream
  // (catch-up-guards.test.ts:430); with the real cache a document absent
  // from the operation store is dropped as "gone" (base-read-model.ts:799).
  // This pins the composed happy path: a stored document's relationship
  // operation survives the rebuild and lands as a row.
  it("a swept relationship is indexed after its document rebuilds through the real cache", async () => {
    const parentId = generateId();
    const childId = generateId();
    const timestampUtcMs = new Date(1_700_000_000_000).toISOString();
    const addRelationship: Operation = {
      id: generateId(),
      index: 1,
      skip: 0,
      hash: "hash-rel-1",
      timestampUtcMs,
      action: {
        id: generateId(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        timestampUtcMs,
        input: {
          sourceId: parentId,
          targetId: childId,
          relationshipType: "child",
        },
      } as Action,
    };
    const createOp = createCreateDocumentOperation(parentId, DOC_TYPE);
    await store.apply(parentId, DOC_TYPE, "document", BRANCH, 0, (txn) => {
      txn.addOperations(createOp);
      txn.addOperations(addRelationship);
    });

    const indexer = new KyselyDocumentIndexer(
      db as unknown as Kysely<IndexerDatabase>,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
    );
    const watermark = makeWatermark();
    indexer.attachCatchUp(watermark, 100_000);
    await indexer.init();

    await commitEntries([
      entryFor(parentId, "document", createOp),
      entryFor(parentId, "document", addRelationship),
    ]);
    const settled = await watermark.refresh();
    const result = await indexer.sweep(
      settled,
      await operationIndex.getOrdinalsInRange(0, settled, 10),
    );

    expect(result).toMatchObject({ replayed: 2 });
    const outgoing = await indexer.getOutgoing(parentId, ["child"]);
    expect(outgoing.results).toHaveLength(1);
    expect(outgoing.results[0]).toMatchObject({
      targetId: childId,
      relationshipType: "child",
    });
  });
});
