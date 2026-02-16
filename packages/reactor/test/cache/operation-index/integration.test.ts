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
          sourceRemote: "",
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
          sourceRemote: "",
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
          sourceRemote: "",
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
          sourceRemote: "",
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

      const childOps = result.results.filter(
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
          sourceRemote: "",
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
          sourceRemote: "",
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
          sourceRemote: "",
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
          sourceRemote: "",
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

      const childOps = result.results.filter(
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

  describe("getLatestTimestampForCollection()", () => {
    it("returns the latest timestamp for a collection with multiple operations", async () => {
      const driveId = "drive-timestamp-1";
      const childDocId = "child-doc-timestamp-1";
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
          sourceRemote: "",
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
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067205000",
          hash: "hash-2",
          skip: 0,
          action: {
            id: createChildActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067205000",
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
      const updateActionId = generateId();
      txn3.write([
        {
          id: deriveOperationId(driveId, "document", "main", updateActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 1,
          timestampUtcMs: "1704067203000",
          hash: "hash-3",
          skip: 0,
          action: {
            id: updateActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067203000",
            input: { name: "My Drive" },
          },
        },
      ]);
      await operationIndex.commit(txn3);

      const result =
        await operationIndex.getLatestTimestampForCollection(collectionId);

      expect(result).toBe("1704067203000");
    });

    it("returns null for collection with no operations", async () => {
      const result =
        await operationIndex.getLatestTimestampForCollection("nonexistent");

      expect(result).toBeNull();
    });

    it("excludes operations after document was removed from collection", async () => {
      const driveId = "drive-timestamp-2";
      const childDocId = "child-doc-timestamp-2";
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
          sourceRemote: "",
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
          sourceRemote: "",
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
          sourceRemote: "",
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
          sourceRemote: "",
          index: 1,
          timestampUtcMs: "1704067210000",
          hash: "hash-4",
          skip: 0,
          action: {
            id: updateChildActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067210000",
            input: { name: "Updated After Removal" },
          },
        },
      ]);
      await operationIndex.commit(txn4);

      const result =
        await operationIndex.getLatestTimestampForCollection(collectionId);

      expect(result).toBe("1704067202000");
    });
  });

  describe("get() document operations query", () => {
    it("should return all operations for a document ordered by ordinal", async () => {
      const docId = "doc-get-1";

      const txn1 = operationIndex.start();
      const createActionId = generateId();
      txn1.write([
        {
          id: deriveOperationId(docId, "document", "main", createActionId),
          documentId: docId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067200000",
          hash: "hash-1",
          skip: 0,
          action: {
            id: createActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067200000",
            input: { documentId: docId, model: "powerhouse/document-model" },
          },
        },
      ]);
      await operationIndex.commit(txn1);

      const txn2 = operationIndex.start();
      const updateActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(docId, "global", "main", updateActionId),
          documentId: docId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 0,
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

      const result = await operationIndex.get(docId);

      expect(result.results).toHaveLength(2);
      expect((result.results[0].action as { type: string }).type).toBe(
        "CREATE_DOCUMENT",
      );
      expect((result.results[1].action as { type: string }).type).toBe(
        "SET_NAME",
      );
      expect(result.results[0].ordinal).toBeLessThan(
        result.results[1].ordinal!,
      );
    });

    it("should filter by branch when view filter is provided", async () => {
      const docId = "doc-get-branch";

      const txn1 = operationIndex.start();
      const mainActionId = generateId();
      txn1.write([
        {
          id: deriveOperationId(docId, "document", "main", mainActionId),
          documentId: docId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067200000",
          hash: "hash-1",
          skip: 0,
          action: {
            id: mainActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067200000",
            input: { documentId: docId, model: "powerhouse/document-model" },
          },
        },
      ]);
      await operationIndex.commit(txn1);

      const txn2 = operationIndex.start();
      const draftActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(docId, "document", "draft", draftActionId),
          documentId: docId,
          documentType: "powerhouse/document-model",
          branch: "draft",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067201000",
          hash: "hash-2",
          skip: 0,
          action: {
            id: draftActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067201000",
            input: { documentId: docId, model: "powerhouse/document-model" },
          },
        },
      ]);
      await operationIndex.commit(txn2);

      const mainResult = await operationIndex.get(docId, { branch: "main" });
      expect(mainResult.results).toHaveLength(1);
      expect(mainResult.results[0].branch).toBe("main");

      const draftResult = await operationIndex.get(docId, { branch: "draft" });
      expect(draftResult.results).toHaveLength(1);
      expect(draftResult.results[0].branch).toBe("draft");
    });

    it("should filter by scopes when view filter is provided", async () => {
      const docId = "doc-get-scope";

      const txn1 = operationIndex.start();
      const docScopeActionId = generateId();
      txn1.write([
        {
          id: deriveOperationId(docId, "document", "main", docScopeActionId),
          documentId: docId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067200000",
          hash: "hash-1",
          skip: 0,
          action: {
            id: docScopeActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067200000",
            input: { documentId: docId, model: "powerhouse/document-model" },
          },
        },
      ]);
      await operationIndex.commit(txn1);

      const txn2 = operationIndex.start();
      const globalScopeActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(docId, "global", "main", globalScopeActionId),
          documentId: docId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067201000",
          hash: "hash-2",
          skip: 0,
          action: {
            id: globalScopeActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067201000",
            input: { name: "My Document" },
          },
        },
      ]);
      await operationIndex.commit(txn2);

      const docScopeResult = await operationIndex.get(docId, {
        scopes: ["document"],
      });
      expect(docScopeResult.results).toHaveLength(1);
      expect(docScopeResult.results[0].scope).toBe("document");

      const globalScopeResult = await operationIndex.get(docId, {
        scopes: ["global"],
      });
      expect(globalScopeResult.results).toHaveLength(1);
      expect(globalScopeResult.results[0].scope).toBe("global");
    });

    it("should return empty results for non-existent document", async () => {
      const result = await operationIndex.get("non-existent-doc");

      expect(result.results).toHaveLength(0);
    });

    it("should support pagination", async () => {
      const docId = "doc-get-paging";

      const txn = operationIndex.start();
      for (let i = 0; i < 5; i++) {
        const actionId = generateId();
        txn.write([
          {
            id: deriveOperationId(docId, "global", "main", actionId),
            documentId: docId,
            documentType: "powerhouse/document-model",
            branch: "main",
            scope: "global",
            sourceRemote: "",
            index: i,
            timestampUtcMs: `170406720${i}000`,
            hash: `hash-${i}`,
            skip: 0,
            action: {
              id: actionId,
              type: "SET_NAME",
              scope: "global",
              timestampUtcMs: `170406720${i}000`,
              input: { name: `Name ${i}` },
            },
          },
        ]);
      }
      await operationIndex.commit(txn);

      const page1 = await operationIndex.get(docId, undefined, {
        cursor: "0",
        limit: 2,
      });
      expect(page1.results).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await operationIndex.get(docId, undefined, {
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.results).toHaveLength(2);
      expect(page2.nextCursor).toBeDefined();

      const page3 = await operationIndex.get(docId, undefined, {
        limit: 2,
        cursor: page2.nextCursor!,
      });
      expect(page3.results).toHaveLength(1);
      expect(page3.nextCursor).toBeUndefined();
    });
  });

  describe("getCollectionsForDocuments()", () => {
    it("should return empty object for empty input", async () => {
      const result = await operationIndex.getCollectionsForDocuments([]);
      expect(result).toEqual({});
    });

    it("should return collection memberships for documents", async () => {
      const collectionId = `drive.main.drive-123`;
      const childDocId = `child-doc-456`;
      const driveDocId = `drive-123`;

      const txn = operationIndex.start();
      txn.createCollection(collectionId);
      txn.write([
        {
          id: "op-1",
          documentId: driveDocId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067200000",
          hash: "hash-1",
          skip: 0,
          action: {
            id: "action-1",
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067200000",
            input: {},
          },
        },
      ]);
      txn.addToCollection(collectionId, driveDocId);
      txn.write([
        {
          id: "op-2",
          documentId: childDocId,
          documentType: "test-document",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067201000",
          hash: "hash-2",
          skip: 0,
          action: {
            id: "action-2",
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067201000",
            input: {},
          },
        },
      ]);
      txn.addToCollection(collectionId, childDocId);
      await operationIndex.commit(txn);

      const result = await operationIndex.getCollectionsForDocuments([
        driveDocId,
        childDocId,
      ]);

      expect(result[driveDocId]).toContain(collectionId);
      expect(result[childDocId]).toContain(collectionId);
    });

    it("should not return removed collection memberships", async () => {
      const collectionId = `drive.main.drive-removed`;
      const docId = `doc-removed-456`;

      const txn1 = operationIndex.start();
      txn1.createCollection(collectionId);
      txn1.write([
        {
          id: "op-add",
          documentId: docId,
          documentType: "test-document",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067200000",
          hash: "hash-1",
          skip: 0,
          action: {
            id: "action-add",
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067200000",
            input: {},
          },
        },
      ]);
      txn1.addToCollection(collectionId, docId);
      await operationIndex.commit(txn1);

      const resultBefore = await operationIndex.getCollectionsForDocuments([
        docId,
      ]);
      expect(resultBefore[docId]).toContain(collectionId);

      const txn2 = operationIndex.start();
      txn2.write([
        {
          id: "op-remove",
          documentId: docId,
          documentType: "test-document",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 1,
          timestampUtcMs: "1704067201000",
          hash: "hash-2",
          skip: 0,
          action: {
            id: "action-remove",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067201000",
            input: {},
          },
        },
      ]);
      txn2.removeFromCollection(collectionId, docId);
      await operationIndex.commit(txn2);

      const resultAfter = await operationIndex.getCollectionsForDocuments([
        docId,
      ]);
      expect(resultAfter[docId]).toBeUndefined();
    });

    it("should return empty object for non-existent documents", async () => {
      const result = await operationIndex.getCollectionsForDocuments([
        "non-existent-doc-1",
        "non-existent-doc-2",
      ]);
      expect(result).toEqual({});
    });
  });
});
