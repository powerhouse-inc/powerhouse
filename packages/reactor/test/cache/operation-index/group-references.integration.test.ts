import { generateId } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type {
  IOperationIndex,
  OperationIndexEntry,
} from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestSyncStorage } from "../../factories.js";

function entry(
  documentId: string,
  scope: string,
  type: string,
  index: number,
): OperationIndexEntry {
  const actionId = generateId();
  return {
    id: generateId(),
    documentId,
    documentType: "powerhouse/document-model",
    branch: "main",
    scope,
    sourceRemote: "",
    index,
    timestampUtcMs: String(1704067200000 + index),
    hash: `hash-${index}`,
    skip: 0,
    action: {
      id: actionId,
      type,
      scope,
      timestampUtcMs: String(1704067200000 + index),
      input: {},
    },
  } as never as OperationIndexEntry;
}

describe("group references in the operation index", () => {
  let db: Kysely<Database>;
  let operationIndex: IOperationIndex;
  const collectionId = DriveCollectionId.forDrive("drive-1").key;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    operationIndex = new KyselyOperationIndex(db);

    // doc-1 is a member of drive-1's collection.
    const txn = operationIndex.start();
    txn.createCollection(collectionId);
    txn.write([entry("doc-1", "document", "CREATE_DOCUMENT", 0)]);
    txn.addToCollection(collectionId, "doc-1");
    await operationIndex.commit(txn);
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function membership(documentId: string) {
    return db
      .selectFrom("document_collections")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("collectionId", "=", collectionId)
      .executeTakeFirst();
  }

  async function recordReference(
    documentId: string,
    groupIds: string[],
    index: number,
  ): Promise<number> {
    const txn = operationIndex.start();
    txn.write([entry(documentId, "auth", "SET_GRANT", index)]);
    txn.recordGroupReferences(documentId, groupIds);
    const ordinals = await operationIndex.commit(txn);
    return ordinals[0];
  }

  it("records references and joins the groups to the document's collections", async () => {
    const ordinal = await recordReference("doc-1", ["g-1", "g-2"], 1);

    const references = await db
      .selectFrom("group_references")
      .selectAll()
      .where("documentId", "=", "doc-1")
      .orderBy("groupId")
      .execute();
    expect(references).toEqual([
      { documentId: "doc-1", groupId: "g-1" },
      { documentId: "doc-1", groupId: "g-2" },
    ]);

    const row = await membership("g-1");
    expect(row).toBeDefined();
    expect(Number(row!.joinedOrdinal)).toBe(ordinal);
    expect(row!.leftOrdinal).toBeNull();
  });

  it("keeps the earliest join when a reference is rediscovered", async () => {
    const first = await recordReference("doc-1", ["g-1"], 1);
    await recordReference("doc-1", ["g-1"], 2);

    const row = await membership("g-1");
    expect(Number(row!.joinedOrdinal)).toBe(first);
  });

  it("reopens a membership the group had left", async () => {
    await recordReference("doc-1", ["g-1"], 1);

    const leave = operationIndex.start();
    leave.write([entry("g-1", "document", "REMOVE_RELATIONSHIP", 0)]);
    leave.removeFromCollection(collectionId, "g-1");
    await operationIndex.commit(leave);
    expect((await membership("g-1"))!.leftOrdinal).not.toBeNull();

    await recordReference("doc-1", ["g-1"], 2);
    expect((await membership("g-1"))!.leftOrdinal).toBeNull();
  });

  it("brings referenced groups along when the document joins a collection", async () => {
    // doc-2 references g-3 before belonging to any collection.
    const txn = operationIndex.start();
    txn.write([entry("doc-2", "auth", "SET_GRANT", 0)]);
    txn.recordGroupReferences("doc-2", ["g-3"]);
    await operationIndex.commit(txn);
    expect(await membership("g-3")).toBeUndefined();

    const join = operationIndex.start();
    join.write([entry("doc-2", "document", "ADD_RELATIONSHIP", 1)]);
    join.addToCollection(collectionId, "doc-2");
    const ordinals = await operationIndex.commit(join);

    const row = await membership("g-3");
    expect(row).toBeDefined();
    expect(Number(row!.joinedOrdinal)).toBe(ordinals[0]);
    expect(row!.leftOrdinal).toBeNull();
  });

  it("records nothing for an auth operation that names no groups", async () => {
    const txn = operationIndex.start();
    txn.write([entry("doc-1", "auth", "REMOVE_GRANT", 1)]);
    txn.recordGroupReferences("doc-1", []);
    await operationIndex.commit(txn);

    const references = await db
      .selectFrom("group_references")
      .selectAll()
      .execute();
    expect(references).toEqual([]);
  });
});
