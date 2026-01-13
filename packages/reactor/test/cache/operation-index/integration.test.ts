import { deriveOperationId, generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { driveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestSyncStorage } from "../../factories.js";

describe("KyselyOperationIndex Integration", () => {
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

  describe("find() collection query", () => {
    it("should include operations that occurred before document was added to collection", async () => {
      const driveId = "drive-1";
      const childDocId = "child-doc-1";
      const collectionId = driveCollectionId("main", driveId);

      const txn1 = operationIndex.start();
      const createActionId = generateId();
      txn1.write([
        {
          id: deriveOperationId(childDocId, "document", "main", createActionId),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          index: 0,
          timestampUtcMs: "1704067200000",
          hash: "hash-1",
          skip: 0,
          action: {
            id: createActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067200000",
            input: {
              documentId: childDocId,
              model: "powerhouse/document-model",
            },
          },
        },
      ]);
      await operationIndex.commit(txn1);

      const txn2 = operationIndex.start();
      const updateActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(childDocId, "document", "main", updateActionId),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          index: 1,
          timestampUtcMs: "1704067201000",
          hash: "hash-2",
          skip: 0,
          action: {
            id: updateActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067201000",
            input: { name: "My Document" },
          },
        },
      ]);
      await operationIndex.commit(txn2);

      const txn3 = operationIndex.start();
      const createDriveActionId = generateId();
      txn3.write([
        {
          id: deriveOperationId(
            driveId,
            "document",
            "main",
            createDriveActionId,
          ),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          index: 0,
          timestampUtcMs: "1704067202000",
          hash: "hash-3",
          skip: 0,
          action: {
            id: createDriveActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067202000",
            input: { documentId: driveId, model: "powerhouse/document-drive" },
          },
        },
      ]);
      txn3.createCollection(collectionId);
      txn3.addToCollection(collectionId, driveId);
      await operationIndex.commit(txn3);

      const txn4 = operationIndex.start();
      const addRelationshipActionId = generateId();
      txn4.write([
        {
          id: deriveOperationId(
            driveId,
            "document",
            "main",
            addRelationshipActionId,
          ),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          index: 1,
          timestampUtcMs: "1704067203000",
          hash: "hash-4",
          skip: 0,
          action: {
            id: addRelationshipActionId,
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "1704067203000",
            input: {
              sourceId: driveId,
              targetId: childDocId,
              relationshipType: "child",
            },
          },
        },
      ]);
      txn4.addToCollection(collectionId, childDocId);
      await operationIndex.commit(txn4);

      const result = await operationIndex.find(collectionId);

      const childOps = result.items.filter(
        (op) => op.documentId === childDocId,
      );
      expect(childOps.length).toBeGreaterThanOrEqual(2);

      const createOp = childOps.find(
        (op) => (op.action as { type: string }).type === "CREATE_DOCUMENT",
      );
      expect(createOp).toBeDefined();
      expect(createOp?.id).toBe(
        deriveOperationId(childDocId, "document", "main", createActionId),
      );

      const updateOp = childOps.find(
        (op) => (op.action as { type: string }).type === "SET_NAME",
      );
      expect(updateOp).toBeDefined();
      expect(updateOp?.id).toBe(
        deriveOperationId(childDocId, "document", "main", updateActionId),
      );
    });

    it("should exclude operations after document left the collection", async () => {
      const driveId = "drive-2";
      const childDocId = "child-doc-2";
      const collectionId = driveCollectionId("main", driveId);

      const txn1 = operationIndex.start();
      const createDriveActionId = generateId();
      txn1.write([
        {
          id: deriveOperationId(
            driveId,
            "document",
            "main",
            createDriveActionId,
          ),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          index: 0,
          timestampUtcMs: "1704067200000",
          hash: "hash-1",
          skip: 0,
          action: {
            id: createDriveActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067200000",
            input: { documentId: driveId, model: "powerhouse/document-drive" },
          },
        },
      ]);
      txn1.createCollection(collectionId);
      txn1.addToCollection(collectionId, driveId);
      await operationIndex.commit(txn1);

      const txn2 = operationIndex.start();
      const createChildActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(
            childDocId,
            "document",
            "main",
            createChildActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          index: 0,
          timestampUtcMs: "1704067201000",
          hash: "hash-2",
          skip: 0,
          action: {
            id: createChildActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067201000",
            input: {
              documentId: childDocId,
              model: "powerhouse/document-model",
            },
          },
        },
      ]);
      txn2.addToCollection(collectionId, childDocId);
      await operationIndex.commit(txn2);

      const txn3 = operationIndex.start();
      const removeRelationshipActionId = generateId();
      txn3.write([
        {
          id: deriveOperationId(
            driveId,
            "document",
            "main",
            removeRelationshipActionId,
          ),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          index: 1,
          timestampUtcMs: "1704067202000",
          hash: "hash-3",
          skip: 0,
          action: {
            id: removeRelationshipActionId,
            type: "REMOVE_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "1704067202000",
            input: {
              sourceId: driveId,
              targetId: childDocId,
              relationshipType: "child",
            },
          },
        },
      ]);
      txn3.removeFromCollection(collectionId, childDocId);
      await operationIndex.commit(txn3);

      const txn4 = operationIndex.start();
      const updateChildActionId = generateId();
      txn4.write([
        {
          id: deriveOperationId(
            childDocId,
            "document",
            "main",
            updateChildActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          index: 1,
          timestampUtcMs: "1704067203000",
          hash: "hash-4",
          skip: 0,
          action: {
            id: updateChildActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067203000",
            input: { name: "Updated After Removal" },
          },
        },
      ]);
      await operationIndex.commit(txn4);

      const result = await operationIndex.find(collectionId);

      const childOps = result.items.filter(
        (op) => op.documentId === childDocId,
      );

      const createOp = childOps.find(
        (op) =>
          op.id ===
          deriveOperationId(
            childDocId,
            "document",
            "main",
            createChildActionId,
          ),
      );
      expect(createOp).toBeDefined();

      const afterRemovalOp = childOps.find(
        (op) =>
          op.id ===
          deriveOperationId(
            childDocId,
            "document",
            "main",
            updateChildActionId,
          ),
      );
      expect(afterRemovalOp).toBeUndefined();
    });
  });
});
