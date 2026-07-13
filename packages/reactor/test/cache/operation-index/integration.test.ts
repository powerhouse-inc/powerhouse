import {
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_LIMIT,
  KyselyOperationIndex,
} from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
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
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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

    it("should include retroactively-joined operations even when the cursor has advanced past them", async () => {
      const driveId = "drive-retroactive";
      const childDocId = "child-doc-retroactive";
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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
          hash: "hash-drive-create",
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
      const setChildNameActionId = generateId();
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
          hash: "hash-child-create",
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
        {
          id: deriveOperationId(
            childDocId,
            "global",
            "main",
            setChildNameActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067202000",
          hash: "hash-child-setname",
          skip: 0,
          action: {
            id: setChildNameActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067202000",
            input: { name: "Child" },
          },
        },
      ]);
      await operationIndex.commit(txn2);

      const txn3 = operationIndex.start();
      const addFolderActionId = generateId();
      txn3.write([
        {
          id: deriveOperationId(driveId, "document", "main", addFolderActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 1,
          timestampUtcMs: "1704067203000",
          hash: "hash-add-folder",
          skip: 0,
          action: {
            id: addFolderActionId,
            type: "ADD_FOLDER",
            scope: "document",
            timestampUtcMs: "1704067203000",
            input: { id: "folder-1", name: "specs" },
          },
        },
      ]);
      const folderOrdinals = await operationIndex.commit(txn3);
      const cursorAfterFolder = folderOrdinals[0];

      const beforeRelResult = await operationIndex.find(collectionId, 0);
      const beforeChildOps = beforeRelResult.results.filter(
        (op) => op.documentId === childDocId,
      );
      expect(beforeChildOps).toHaveLength(0);

      const txn4 = operationIndex.start();
      const addRelActionId = generateId();
      txn4.write([
        {
          id: deriveOperationId(driveId, "document", "main", addRelActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 2,
          timestampUtcMs: "1704067204000",
          hash: "hash-add-rel",
          skip: 0,
          action: {
            id: addRelActionId,
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "1704067204000",
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

      const result = await operationIndex.find(collectionId, cursorAfterFolder);

      const childOps = result.results.filter(
        (op) => op.documentId === childDocId,
      );

      const createOp = childOps.find(
        (op) => (op.action as { type: string }).type === "CREATE_DOCUMENT",
      );
      expect(createOp).toBeDefined();
      expect(createOp?.id).toBe(
        deriveOperationId(childDocId, "document", "main", createChildActionId),
      );

      const setNameOp = childOps.find(
        (op) => (op.action as { type: string }).type === "SET_NAME",
      );
      expect(setNameOp).toBeDefined();
      expect(setNameOp?.id).toBe(
        deriveOperationId(childDocId, "global", "main", setChildNameActionId),
      );
    });

    it("splits joiner backfill and new ops across pages by ordinal", async () => {
      const driveId = "drive-paging-1";
      const childDocId = "child-paging-1";
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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
          hash: "hash-drive-create",
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
      const childCreateActionId = generateId();
      const childSetNameActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(
            childDocId,
            "document",
            "main",
            childCreateActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067201000",
          hash: "hash-child-create",
          skip: 0,
          action: {
            id: childCreateActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067201000",
            input: {
              documentId: childDocId,
              model: "powerhouse/document-model",
            },
          },
        },
        {
          id: deriveOperationId(
            childDocId,
            "global",
            "main",
            childSetNameActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067202000",
          hash: "hash-child-setname",
          skip: 0,
          action: {
            id: childSetNameActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067202000",
            input: { name: "Child" },
          },
        },
      ]);
      await operationIndex.commit(txn2);

      const txn3 = operationIndex.start();
      const folderActionId = generateId();
      txn3.write([
        {
          id: deriveOperationId(driveId, "document", "main", folderActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 1,
          timestampUtcMs: "1704067203000",
          hash: "hash-folder",
          skip: 0,
          action: {
            id: folderActionId,
            type: "ADD_FOLDER",
            scope: "document",
            timestampUtcMs: "1704067203000",
            input: { id: "folder-1", name: "specs" },
          },
        },
      ]);
      const folderOrdinals = await operationIndex.commit(txn3);
      const cursorAfterFolder = folderOrdinals[0];

      const txn4 = operationIndex.start();
      const addRelActionId = generateId();
      txn4.write([
        {
          id: deriveOperationId(driveId, "document", "main", addRelActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 2,
          timestampUtcMs: "1704067204000",
          hash: "hash-add-rel",
          skip: 0,
          action: {
            id: addRelActionId,
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "1704067204000",
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

      const txn5 = operationIndex.start();
      const driveSetNameActionId = generateId();
      txn5.write([
        {
          id: deriveOperationId(
            driveId,
            "global",
            "main",
            driveSetNameActionId,
          ),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067205000",
          hash: "hash-drive-setname",
          skip: 0,
          action: {
            id: driveSetNameActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067205000",
            input: { name: "My Drive" },
          },
        },
      ]);
      await operationIndex.commit(txn5);

      const collectedOrdinals: number[] = [];
      let page = await operationIndex.find(
        collectionId,
        cursorAfterFolder,
        undefined,
        { cursor: "0", limit: 1 },
      );

      while (page.results.length > 0) {
        for (const entry of page.results) {
          collectedOrdinals.push(entry.ordinal!);
        }
        if (!page.next) {
          break;
        }
        page = await page.next();
      }

      const sorted = [...collectedOrdinals].sort((a, b) => a - b);
      expect(collectedOrdinals).toEqual(sorted);
      expect(collectedOrdinals[0]).toBeLessThanOrEqual(cursorAfterFolder);
      expect(collectedOrdinals[collectedOrdinals.length - 1]).toBeGreaterThan(
        cursorAfterFolder,
      );
      expect(collectedOrdinals.length).toBeGreaterThanOrEqual(4);
    });

    it("does not re-emit joiner ops on continuation pages", async () => {
      const driveId = "drive-no-dupes";
      const childDocId = "child-no-dupes";
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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
          hash: "hash-drive-create-2",
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
      const childCreateActionId = generateId();
      const childSetNameActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(
            childDocId,
            "document",
            "main",
            childCreateActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067201000",
          hash: "hash-child-create-2",
          skip: 0,
          action: {
            id: childCreateActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067201000",
            input: {
              documentId: childDocId,
              model: "powerhouse/document-model",
            },
          },
        },
        {
          id: deriveOperationId(
            childDocId,
            "global",
            "main",
            childSetNameActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067202000",
          hash: "hash-child-setname-2",
          skip: 0,
          action: {
            id: childSetNameActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067202000",
            input: { name: "Child" },
          },
        },
      ]);
      await operationIndex.commit(txn2);

      const txn3 = operationIndex.start();
      const folderActionId = generateId();
      txn3.write([
        {
          id: deriveOperationId(driveId, "document", "main", folderActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 1,
          timestampUtcMs: "1704067203000",
          hash: "hash-folder-2",
          skip: 0,
          action: {
            id: folderActionId,
            type: "ADD_FOLDER",
            scope: "document",
            timestampUtcMs: "1704067203000",
            input: { id: "folder-1", name: "specs" },
          },
        },
      ]);
      const folderOrdinals = await operationIndex.commit(txn3);
      const cursorAfterFolder = folderOrdinals[0];

      const txn4 = operationIndex.start();
      const addRelActionId = generateId();
      txn4.write([
        {
          id: deriveOperationId(driveId, "document", "main", addRelActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 2,
          timestampUtcMs: "1704067204000",
          hash: "hash-add-rel-2",
          skip: 0,
          action: {
            id: addRelActionId,
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "1704067204000",
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

      const seenOrdinals = new Set<number>();
      let page = await operationIndex.find(
        collectionId,
        cursorAfterFolder,
        undefined,
        { cursor: "0", limit: 2 },
      );

      while (page.results.length > 0) {
        for (const entry of page.results) {
          expect(seenOrdinals.has(entry.ordinal!)).toBe(false);
          seenOrdinals.add(entry.ordinal!);
        }
        if (!page.next) {
          break;
        }
        page = await page.next();
      }

      expect(seenOrdinals.size).toBeGreaterThanOrEqual(3);
    });

    it("applies branch / scope / excludeSourceRemote view filters to joiner backfill", async () => {
      const driveId = "drive-view-filter";
      const childDocId = "child-view-filter";
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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
          hash: "hash-vf-drive",
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
      const childMainDocActionId = generateId();
      const childMainGlobalActionId = generateId();
      const childDraftActionId = generateId();
      const childRemoteActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(
            childDocId,
            "document",
            "main",
            childMainDocActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067201000",
          hash: "hash-vf-child-main-doc",
          skip: 0,
          action: {
            id: childMainDocActionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1704067201000",
            input: {
              documentId: childDocId,
              model: "powerhouse/document-model",
            },
          },
        },
        {
          id: deriveOperationId(
            childDocId,
            "global",
            "main",
            childMainGlobalActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067202000",
          hash: "hash-vf-child-main-global",
          skip: 0,
          action: {
            id: childMainGlobalActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067202000",
            input: { name: "Child main global" },
          },
        },
        {
          id: deriveOperationId(
            childDocId,
            "document",
            "draft",
            childDraftActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "draft",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067202500",
          hash: "hash-vf-child-draft",
          skip: 0,
          action: {
            id: childDraftActionId,
            type: "SET_NAME",
            scope: "document",
            timestampUtcMs: "1704067202500",
            input: { name: "Draft" },
          },
        },
        {
          id: deriveOperationId(
            childDocId,
            "global",
            "main",
            childRemoteActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "global",
          sourceRemote: "remoteA",
          index: 1,
          timestampUtcMs: "1704067202700",
          hash: "hash-vf-child-remote",
          skip: 0,
          action: {
            id: childRemoteActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067202700",
            input: { name: "From remoteA" },
          },
        },
      ]);
      await operationIndex.commit(txn2);

      const txn3 = operationIndex.start();
      const folderActionId = generateId();
      txn3.write([
        {
          id: deriveOperationId(driveId, "document", "main", folderActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 1,
          timestampUtcMs: "1704067203000",
          hash: "hash-vf-folder",
          skip: 0,
          action: {
            id: folderActionId,
            type: "ADD_FOLDER",
            scope: "document",
            timestampUtcMs: "1704067203000",
            input: { id: "folder-1", name: "specs" },
          },
        },
      ]);
      const folderOrdinals = await operationIndex.commit(txn3);
      const cursorAfterFolder = folderOrdinals[0];

      const txn4 = operationIndex.start();
      const addRelActionId = generateId();
      txn4.write([
        {
          id: deriveOperationId(driveId, "document", "main", addRelActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 2,
          timestampUtcMs: "1704067204000",
          hash: "hash-vf-add-rel",
          skip: 0,
          action: {
            id: addRelActionId,
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "1704067204000",
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

      const branchResult = await operationIndex.find(
        collectionId,
        cursorAfterFolder,
        { branch: "main" },
      );
      const branchChildOps = branchResult.results.filter(
        (op) => op.documentId === childDocId,
      );
      expect(branchChildOps.every((op) => op.branch === "main")).toBe(true);
      expect(branchChildOps.some((op) => op.branch === "draft")).toBe(false);

      const scopeResult = await operationIndex.find(
        collectionId,
        cursorAfterFolder,
        { scopes: ["document"] },
      );
      const scopeChildOps = scopeResult.results.filter(
        (op) => op.documentId === childDocId,
      );
      expect(scopeChildOps.every((op) => op.scope === "document")).toBe(true);
      expect(scopeChildOps.some((op) => op.scope === "global")).toBe(false);

      const remoteResult = await operationIndex.find(
        collectionId,
        cursorAfterFolder,
        { excludeSourceRemote: "remoteA" },
      );
      const remoteChildOps = remoteResult.results.filter(
        (op) => op.documentId === childDocId,
      );
      expect(remoteChildOps.every((op) => op.sourceRemote !== "remoteA")).toBe(
        true,
      );
      expect(remoteChildOps.some((op) => op.sourceRemote === "remoteA")).toBe(
        false,
      );
    });

    it("returns no rows when cursor is past joinedOrdinal", async () => {
      const driveId = "drive-past-cursor";
      const childDocId = "child-past-cursor";
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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
          hash: "hash-pc-drive",
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
      const childCreateActionId = generateId();
      txn2.write([
        {
          id: deriveOperationId(
            childDocId,
            "document",
            "main",
            childCreateActionId,
          ),
          documentId: childDocId,
          documentType: "powerhouse/document-model",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067201000",
          hash: "hash-pc-child",
          skip: 0,
          action: {
            id: childCreateActionId,
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
      await operationIndex.commit(txn2);

      const txn3 = operationIndex.start();
      const addRelActionId = generateId();
      txn3.write([
        {
          id: deriveOperationId(driveId, "document", "main", addRelActionId),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
          index: 1,
          timestampUtcMs: "1704067202000",
          hash: "hash-pc-add-rel",
          skip: 0,
          action: {
            id: addRelActionId,
            type: "ADD_RELATIONSHIP",
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
      txn3.addToCollection(collectionId, childDocId);
      const addRelOrdinals = await operationIndex.commit(txn3);
      const cursorAfterAddRel = addRelOrdinals[0];

      const txn4 = operationIndex.start();
      const driveSetNameActionId = generateId();
      txn4.write([
        {
          id: deriveOperationId(
            driveId,
            "global",
            "main",
            driveSetNameActionId,
          ),
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "global",
          sourceRemote: "",
          index: 0,
          timestampUtcMs: "1704067203000",
          hash: "hash-pc-drive-setname",
          skip: 0,
          action: {
            id: driveSetNameActionId,
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1704067203000",
            input: { name: "My Drive" },
          },
        },
      ]);
      await operationIndex.commit(txn4);

      const result = await operationIndex.find(collectionId, cursorAfterAddRel);

      const childOps = result.results.filter(
        (op) => op.documentId === childDocId,
      );
      expect(childOps).toHaveLength(0);

      const driveOps = result.results.filter((op) => op.documentId === driveId);
      expect(driveOps.length).toBeGreaterThanOrEqual(1);
      const setNameOp = driveOps.find(
        (op) => (op.action as { type: string }).type === "SET_NAME",
      );
      expect(setNameOp).toBeDefined();
    });

    it("should exclude operations after document left the collection", async () => {
      const driveId = "drive-2";
      const childDocId = "child-doc-2";
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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
      const collectionId = DriveCollectionId.forDrive(driveId).key;

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

  describe("getSinceOrdinal() default paging", () => {
    it("should bound the first page and stream the full set via next when no paging is given", async () => {
      const documentId = "doc-default-paging";
      const total = DEFAULT_PAGE_LIMIT + 50;

      const txn = operationIndex.start();
      txn.write(
        Array.from({ length: total }, (_, i) => {
          const actionId = generateId();
          return {
            id: deriveOperationId(documentId, "global", "main", actionId),
            documentId,
            documentType: "powerhouse/document-model",
            branch: "main",
            scope: "global",
            sourceRemote: "",
            index: i,
            timestampUtcMs: String(1704067200000 + i),
            hash: `hash-${i}`,
            skip: 0,
            action: {
              id: actionId,
              type: "TEST_ACTION",
              scope: "global",
              timestampUtcMs: String(1704067200000 + i),
              input: {},
            },
          };
        }),
      );
      await operationIndex.commit(txn);

      let page = await operationIndex.getSinceOrdinal(0);
      expect(page.results.length).toBe(DEFAULT_PAGE_LIMIT);
      expect(page.next).toBeDefined();

      const ordinals = page.results.map((op) => op.context.ordinal);
      while (page.next) {
        page = await page.next();
        ordinals.push(...page.results.map((op) => op.context.ordinal));
      }

      expect(ordinals.length).toBe(total);
      const ascending = ordinals.every((o, i) => i === 0 || o > ordinals[i - 1]!);
      expect(ascending).toBe(true);
    });
  });
});
