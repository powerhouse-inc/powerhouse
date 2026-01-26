import { addFile, addFolder, deleteNode, setDriveName } from "document-drive";
import type { Operation } from "document-model";
import { deriveOperationId, generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateOperationError,
  RevisionMismatchError,
} from "../../../src/storage/interfaces.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../../factories.js";

describe("KyselyOperationStore", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("apply", () => {
    it("should apply operations atomically with real document-drive actions", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const opId = generateId();

      // Create a real document-drive action for adding a folder
      const action = addFolder({
        id: generateId(),
        name: "Test Folder",
        parentFolder: null,
      });

      // First operation (revision 0)
      const documentType = "powerhouse/document-drive";
      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        const op: Operation = {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          skip: 0,
          id: opId,
          action,
        };
        txn.addOperations(op);
      });

      // Verify operation was stored
      const result = await store.getSince(documentId, scope, branch, -1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(opId);
      expect(result.items[0].action.type).toBe("ADD_FOLDER");
      expect(result.items[0].action.input).toHaveProperty(
        "name",
        "Test Folder",
      );
    });

    it("should enforce revision ordering", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";

      // Create a real action for setting drive name
      const action = setDriveName({
        name: "My Test Drive",
      });

      // Try to apply operation with wrong revision
      const documentType = "powerhouse/document-drive";
      await expect(
        store.apply(documentId, documentType, scope, branch, 5, (txn) => {
          txn.addOperations({
            id: deriveOperationId(documentId, scope, branch, action.id),
            index: 5,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-1",
            skip: 0,
            action,
          });
        }),
      ).rejects.toThrow(RevisionMismatchError);
    });

    it("should allow same opId with different index (reshuffle scenario)", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const sharedOpId = generateId();

      const action = addFile({
        id: generateId(),
        name: "test-document.txt",
        documentType: "text/plain",
        parentFolder: null,
      });

      const documentType = "powerhouse/document-drive";

      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations({
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          skip: 0,
          id: sharedOpId,
          action,
        });
      });

      await store.apply(documentId, documentType, scope, branch, 1, (txn) => {
        txn.addOperations({
          index: 1,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-2",
          skip: 0,
          id: sharedOpId,
          action,
        });
      });

      const result = await store.getSince(documentId, scope, branch, -1);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe(sharedOpId);
      expect(result.items[1].id).toBe(sharedOpId);
    });

    it("should allow same opId with different skip (undo/redo scenario)", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const sharedOpId = generateId();

      const action = addFile({
        id: generateId(),
        name: "test-document.txt",
        documentType: "text/plain",
        parentFolder: null,
      });

      const documentType = "powerhouse/document-drive";

      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations({
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          skip: 0,
          id: sharedOpId,
          action,
        });
      });

      await store.apply(documentId, documentType, scope, branch, 1, (txn) => {
        txn.addOperations({
          index: 1,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-2",
          skip: 1,
          id: sharedOpId,
          action,
        });
      });

      const result = await store.getSince(documentId, scope, branch, -1);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].skip).toBe(0);
      expect(result.items[1].skip).toBe(1);
    });

    it("should reject duplicate (opId, index, skip) combination", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const duplicateOpId = generateId();

      const action = addFile({
        id: generateId(),
        name: "test-document.txt",
        documentType: "text/plain",
        parentFolder: null,
      });

      const op: Operation = {
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash-1",
        skip: 0,
        id: duplicateOpId,
        action,
      };

      const documentType = "powerhouse/document-drive";

      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations(op);
      });

      const secondDocId = generateId();
      await expect(
        store.apply(secondDocId, documentType, scope, branch, 0, (txn) => {
          txn.addOperations({ ...op, index: 0 });
        }),
      ).rejects.toThrow(DuplicateOperationError);
    });
  });

  describe("getSince", () => {
    it("should get operations since a given revision", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const documentType = "powerhouse/document-drive";

      // Add multiple operations
      const operations = [];
      for (let i = 0; i < 3; i++) {
        const action = addFolder({
          id: generateId(),
          name: `Folder ${i}`,
          parentFolder: null,
        });

        const op = {
          index: i,
          timestampUtcMs: new Date(Date.now() + i * 1000).toISOString(),
          hash: `hash-${i}`,
          skip: 0,
          id: generateId(),
          action,
        };
        operations.push(op);

        await store.apply(documentId, documentType, scope, branch, i, (txn) => {
          txn.addOperations(op);
        });
      }

      // Get operations since revision 0 (should return operations at revision 1 and 2)
      const result = await store.getSince(documentId, scope, branch, 0);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].index).toBe(1);
      expect(result.items[1].index).toBe(2);
      expect(result.items[0].action.type).toBe("ADD_FOLDER");
      expect(result.hasMore).toBe(false);
    });

    it("should return empty array when no operations since revision", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const documentType = "powerhouse/document-drive";

      // Add one operation at revision 0
      const action = addFile({
        id: generateId(),
        name: "test.txt",
        documentType: "text/plain",
        parentFolder: null,
      });

      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations({
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-0",
          skip: 0,
          id: generateId(),
          action,
        });
      });

      // Get operations since revision 0 (should return empty array)
      const result = await store.getSince(documentId, scope, branch, 0);
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should support cursor-based paging", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const documentType = "powerhouse/document-drive";

      // Add 5 operations
      for (let i = 0; i < 5; i++) {
        const action = addFolder({
          id: generateId(),
          name: `Folder ${i}`,
          parentFolder: null,
        });

        await store.apply(documentId, documentType, scope, branch, i, (txn) => {
          txn.addOperations({
            index: i,
            timestampUtcMs: new Date(Date.now() + i * 1000).toISOString(),
            hash: `hash-${i}`,
            skip: 0,
            id: generateId(),
            action,
          });
        });
      }

      // Get first page of 2 items starting from revision 0
      const page1 = await store.getSince(
        documentId,
        scope,
        branch,
        0,
        undefined,
        {
          cursor: "",
          limit: 2,
        },
      );
      expect(page1.items).toHaveLength(2);
      expect(page1.items[0].index).toBe(1);
      expect(page1.items[1].index).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      // Get second page using cursor
      const page2 = await store.getSince(
        documentId,
        scope,
        branch,
        0,
        undefined,
        {
          cursor: page1.nextCursor,
          limit: 2,
        },
      );
      expect(page2.items).toHaveLength(2);
      expect(page2.items[0].index).toBe(3);
      expect(page2.items[1].index).toBe(4);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe("getSinceId", () => {
    it("should get operations since a given database ID", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const documentType = "powerhouse/document-drive";

      // Add multiple operations to get database IDs
      for (let i = 0; i < 3; i++) {
        const action = deleteNode({
          id: generateId(),
        });

        await store.apply(documentId, documentType, scope, branch, i, (txn) => {
          txn.addOperations({
            index: i,
            timestampUtcMs: new Date().toISOString(),
            hash: `hash-${i}`,
            skip: 0,
            id: generateId(),
            action,
          });
        });
      }

      // Get all operations first to find the first ID
      const allOps = await store.getSince(documentId, scope, branch, -1);
      expect(allOps.items.length).toBeGreaterThanOrEqual(3);

      // Get operations since the first database ID
      // Note: This uses the internal database ID, not the operation ID
      const result = await store.getSinceId(1); // Assuming first DB ID is 1

      expect(result.items.length).toBeGreaterThanOrEqual(1);
      result.items.forEach((item) => {
        expect(item.operation.action.type).toBe("DELETE_NODE");
        expect(item.context.documentId).toBe(documentId);
      });
    });
  });

  describe("abort signal handling", () => {
    it("should abort apply operation", async () => {
      const controller = new AbortController();
      controller.abort();
      const documentId = generateId();
      const documentType = "powerhouse/document-drive";

      await expect(
        store.apply(
          documentId,
          documentType,
          "global",
          "main",
          0,
          () => {},
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getSince operation", async () => {
      const controller = new AbortController();
      controller.abort();
      const documentId = generateId();

      await expect(
        store.getSince(
          documentId,
          "global",
          "main",
          0,
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getSinceId operation", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        store.getSinceId(1, undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });
});
