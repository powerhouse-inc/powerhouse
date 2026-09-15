import {
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type {
  IOperationIndex,
  OperationIndexEntry,
} from "../../../src/cache/operation-index-types.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestSyncStorage } from "../../factories.js";

/** A reshuffle commits one index row per operation the stream still applies. */
describe("KyselyOperationIndex bulk insert limit", () => {
  const documentId = "bulk-insert-doc";
  let db: Kysely<Database>;
  let operationIndex: IOperationIndex;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    operationIndex = new KyselyOperationIndex(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  function entry(index: number): OperationIndexEntry {
    const actionId = generateId();
    return {
      id: deriveOperationId(documentId, "global", "main", actionId),
      documentId,
      documentType: "powerhouse/document-model",
      branch: "main",
      scope: "global",
      sourceRemote: "",
      index,
      timestampUtcMs: "1704067200000",
      hash: `hash-${index}`,
      skip: 0,
      action: {
        id: actionId,
        type: "SET_NAME",
        scope: "global",
        timestampUtcMs: "1704067200000",
        input: { name: `name-${index}` },
      },
    };
  }

  it("commits an operation count that overruns one statement's bind slots", async () => {
    const operations: OperationIndexEntry[] = [];
    for (let index = 0; index < 4000; index++) {
      operations.push(entry(index));
    }

    const txn = operationIndex.start();
    txn.write(operations);

    const ordinals = await operationIndex.commit(txn);

    expect(ordinals).toHaveLength(operations.length);
    expect(new Set(ordinals).size).toBe(operations.length);
    // Callers index these by row position.
    expect([...ordinals].sort((a, b) => a - b)).toEqual(ordinals);
  });
});
