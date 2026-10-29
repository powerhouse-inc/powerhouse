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

describe("operation index ordering when protocol v1 undo reuses an index", () => {
  let db: Kysely<Database>;
  let operationIndex: IOperationIndex;
  let collectionId: string;
  const [docB, docA] = [generateId(), generateId()].sort();
  const label = new Map([
    [docA, "A"],
    [docB, "B"],
  ]);

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    operationIndex = new KyselyOperationIndex(db);
    collectionId = DriveCollectionId.forDrive(generateId()).key;
  });

  afterEach(async () => {
    await db.destroy();
  });

  function entry(docId: string, index: number, skip: number, type: string) {
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

  async function commit(entries: ReturnType<typeof entry>[]) {
    const txn = operationIndex.start();
    txn.write(entries);
    txn.createCollection(collectionId);
    for (const docId of new Set(entries.map((e) => e.documentId))) {
      txn.addToCollection(collectionId, docId);
    }
    await operationIndex.commit(txn);
  }

  async function listed() {
    const page = await operationIndex.find(collectionId);
    return page.results.map(
      (operation) =>
        `${label.get(operation.documentId)}${operation.index}/${operation.skip}`,
    );
  }

  it("lists operations by ordinal, in write order, not by index", async () => {
    await commit([
      entry(docA, 0, 0, "SET_MODEL_NAME"),
      entry(docA, 1, 0, "SET_MODEL_NAME"),
      entry(docA, 2, 1, "NOOP"),
      entry(docA, 2, 2, "NOOP"),
      entry(docB, 0, 0, "SET_MODEL_NAME"),
    ]);

    expect(await listed()).toStrictEqual([
      "A0/0",
      "A1/0",
      "A2/1",
      "A2/2",
      "B0/0",
    ]);
  });

  it("neither rejects nor renumbers a reused index written later", async () => {
    await commit([
      entry(docA, 0, 0, "SET_MODEL_NAME"),
      entry(docA, 1, 0, "SET_MODEL_NAME"),
      entry(docA, 2, 1, "NOOP"),
    ]);
    await commit([entry(docB, 0, 0, "SET_MODEL_NAME")]);
    await commit([
      entry(docA, 2, 2, "NOOP"),
      entry(docA, 3, 0, "SET_MODEL_NAME"),
    ]);

    expect(await listed()).toStrictEqual([
      "A0/0",
      "A1/0",
      "A2/1",
      "B0/0",
      "A2/2",
      "A3/0",
    ]);
  });
});
