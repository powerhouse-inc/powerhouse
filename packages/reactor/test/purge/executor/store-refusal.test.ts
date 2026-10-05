import {
  deriveOperationId,
  generateId,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { setModelName } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DocumentPurgedError } from "../../../src/shared/errors.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres } from "../../factories.js";
import { purgeMarker, seedPurgedDocument } from "../helpers.js";

function globalOperation(documentId: string, index: number): Operation {
  const action = setModelName({ name: `name-${index}` });
  return {
    id: deriveOperationId(documentId, "global", "main", action.id),
    index,
    skip: 0,
    hash: "",
    timestampUtcMs: action.timestampUtcMs,
    action,
  };
}

describe("append refusal for purged streams [Postgres]", () => {
  let db: Kysely<Database>;
  let store: KyselyOperationStore;
  let index: KyselyOperationIndex;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    db = setup.db;
    store = setup.store;
    index = new KyselyOperationIndex(db);
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  async function operationRows(documentId: string): Promise<string[]> {
    const rows = await db
      .selectFrom("Operation")
      .select("opId")
      .where("documentId", "=", documentId)
      .orderBy("id")
      .execute();
    return rows.map((row) => row.opId);
  }

  it("refuses a non-marker append in any scope", async () => {
    const documentId = generateId();
    const marker = purgeMarker(documentId);
    await seedPurgedDocument({ db, store, index }, marker);

    const operation = globalOperation(documentId, 0);
    await expect(
      store.apply(
        documentId,
        "powerhouse/document-model",
        "global",
        "main",
        0,
        (txn) => {
          txn.addOperations(operation);
        },
      ),
    ).rejects.toSatisfy(DocumentPurgedError.isError);
    expect(await operationRows(documentId)).toEqual([marker.id]);
  });

  it("answers a second marker, same or new action id, with the stored one", async () => {
    const documentId = generateId();
    const marker = purgeMarker(documentId);
    await seedPurgedDocument({ db, store, index }, marker);

    for (const again of [marker, purgeMarker(documentId)]) {
      const stored = await store.apply(
        documentId,
        "powerhouse/document-model",
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(again);
        },
      );
      expect(stored.map((operation) => operation.id)).toEqual([marker.id]);
    }
    expect(await operationRows(documentId)).toEqual([marker.id]);
  });

  it("refuses to index a non-marker operation of a purged id", async () => {
    const documentId = generateId();
    await seedPurgedDocument({ db, store, index }, purgeMarker(documentId));

    const txn = index.start();
    txn.write([
      {
        ...globalOperation(documentId, 0),
        documentId,
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
        sourceRemote: "",
      },
    ]);
    await expect(index.commit(txn)).rejects.toSatisfy(
      DocumentPurgedError.isError,
    );
    const twins = await db
      .selectFrom("operation_index_operations")
      .select("opId")
      .where("documentId", "=", documentId)
      .execute();
    expect(twins).toHaveLength(1);
  });

  it("appends to a stream without a tombstone as before", async () => {
    const documentId = generateId();
    const operation = globalOperation(documentId, 0);
    await store.apply(
      documentId,
      "powerhouse/document-model",
      "global",
      "main",
      0,
      (txn) => {
        txn.addOperations(operation);
      },
    );
    expect(await operationRows(documentId)).toEqual([operation.id]);
  });
});
