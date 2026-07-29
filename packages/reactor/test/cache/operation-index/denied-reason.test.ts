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
import { toOperationWithContext } from "../../../src/sync/utils.js";
import { createTestSyncStorage } from "../../factories.js";

const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";

/**
 * Sync sends operations from the index rather than the operation table, so a
 * denial has to survive a round trip through it or a replica never learns the
 * operation was refused.
 */
describe("operation index denied reason", () => {
  let db: Kysely<Database>;
  let operationIndex: IOperationIndex;
  let driveId: string;
  let docId: string;
  let collectionId: string;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    operationIndex = new KyselyOperationIndex(db);
    driveId = generateId();
    docId = generateId();
    collectionId = DriveCollectionId.forDrive(driveId).key;
  });

  afterEach(async () => {
    await db.destroy();
  });

  function entry(index: number, deniedReason?: string) {
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
      hash: `hash-${index}`,
      skip: 0,
      ...(deniedReason === undefined ? {} : { deniedReason }),
      action: {
        id: actionId,
        type: "SET_MODEL_NAME",
        scope: "global",
        timestampUtcMs: String(1704067200000 + index),
        input: { name: `n${index}` },
      },
    };
  }

  it("carries the reason through a write and read", async () => {
    const txn = operationIndex.start();
    txn.write([entry(0), entry(1, "no grant permits this signer")]);
    txn.createCollection(collectionId);
    txn.addToCollection(collectionId, docId);
    await operationIndex.commit(txn);

    const page = await operationIndex.find(collectionId);
    const found = page.results.sort((a, b) => a.index - b.index);

    expect(found.map((op) => op.deniedReason)).toEqual([
      undefined,
      "no grant permits this signer",
    ]);
  });

  it("keeps the reason on the operation sync sends", async () => {
    const txn = operationIndex.start();
    txn.write([entry(0, "denied at admission")]);
    txn.createCollection(collectionId);
    txn.addToCollection(collectionId, docId);
    await operationIndex.commit(txn);

    const page = await operationIndex.find(collectionId);
    const outbound = page.results.map((e) => toOperationWithContext(e));

    expect(outbound[0].operation.deniedReason).toBe("denied at admission");
  });
});
