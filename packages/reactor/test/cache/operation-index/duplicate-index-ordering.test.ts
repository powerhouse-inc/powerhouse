import {
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestSyncStorage } from "../../factories.js";

const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";

/**
 * Protocol v1 undo reuses an operation index and raises `skip`, so a history
 * can hold two operations at one index. The operation index orders by the
 * ordinal it assigns, not by the operation index. A stricter monotonic-index
 * rule would reject histories that both authoring approaches accept.
 */
describe("operation index ordering with a reused index", () => {
  let db: Kysely<Database>;
  let operationIndex: IOperationIndex;
  let docId: string;
  let collectionId: string;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    operationIndex = new KyselyOperationIndex(db);
    docId = generateId();
    collectionId = DriveCollectionId.forDrive(generateId()).key;
  });

  afterEach(async () => {
    await db.destroy();
  });

  function entry(index: number, skip: number, type: string) {
    const actionId = generateId();
    return {
      id: deriveOperationId(docId, "global", BRANCH, actionId),
      documentId: docId,
      documentType: DOC_TYPE,
      branch: BRANCH,
      scope: "global",
      sourceRemote: "",
      index,
      timestampUtcMs: String(1704067200000 + index),
      hash: `hash-${index}-${skip}`,
      skip,
      action: {
        id: actionId,
        type,
        scope: "global",
        timestampUtcMs: String(1704067200000 + index),
        input: { at: index },
      },
    };
  }

  it("stores and returns two operations that share an index", async () => {
    const txn = operationIndex.start();
    txn.write([
      entry(0, 0, "SET_MODEL_NAME"),
      entry(1, 0, "SET_MODEL_NAME"),
      // The undo reuses index 1 and raises skip, as protocol v1 writes it.
      entry(1, 1, "NOOP"),
    ]);
    txn.createCollection(collectionId);
    txn.addToCollection(collectionId, docId);
    await operationIndex.commit(txn);

    const page = await operationIndex.find(collectionId);
    expect(
      page.results.map((operation) => `${operation.index}/${operation.skip}`),
    ).toStrictEqual(["0/0", "1/0", "1/1"]);

    // Ordinal order, which is insertion order, not index order.
    const ordinals = page.results.map((operation) => {
      expect(operation.ordinal).toBeTypeOf("number");
      return operation.ordinal!;
    });
    expect(new Set(ordinals).size).toBe(3);
    expect([...ordinals].sort((a, b) => a - b)).toStrictEqual(ordinals);
  });

  it("keeps the reused index after a second write", async () => {
    const first = operationIndex.start();
    first.write([entry(0, 0, "SET_MODEL_NAME"), entry(1, 0, "SET_MODEL_NAME")]);
    first.createCollection(collectionId);
    first.addToCollection(collectionId, docId);
    await operationIndex.commit(first);

    const second = operationIndex.start();
    second.write([entry(1, 1, "NOOP"), entry(2, 0, "SET_MODEL_NAME")]);
    await operationIndex.commit(second);

    const page = await operationIndex.find(collectionId);
    // The second write neither rejects nor renumbers the reused index.
    expect(
      page.results.map((operation) => `${operation.index}/${operation.skip}`),
    ).toStrictEqual(["0/0", "1/0", "1/1", "2/0"]);
  });
});
