import { addFile, addFolder, deleteNode, setDriveName } from "document-drive";
import type { Operation } from "document-model";
import { generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateOperationError,
  RevisionMismatchError,
} from "../../src/storage/interfaces.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../factories.js";

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
      const { operation, context } = await store.get(
        documentId,
        scope,
        branch,
        0,
      );
      expect(operation.id).toBe(opId);
      expect(operation.action.type).toBe("ADD_FOLDER");
      expect(operation.action.input).toHaveProperty("name", "Test Folder");
      expect(context.documentId).toBe(documentId);
      expect(context.scope).toBe(scope);
      expect(context.branch).toBe(branch);
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
            index: 5,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-1",
            skip: 0,
            action,
          });
        }),
      ).rejects.toThrow(RevisionMismatchError);
    });

    it("should reject duplicate operation IDs", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const duplicateOpId = generateId();

      // Create a real action for adding a file
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

      // First insert should succeed
      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations(op);
      });

      // Second insert with same ID should fail
      const secondDocId = generateId();
      await expect(
        store.apply(secondDocId, documentType, scope, branch, 0, (txn) => {
          txn.addOperations({ ...op, index: 0 });
        }),
      ).rejects.toThrow(DuplicateOperationError);
    });
  });

  describe("get", () => {
    it("should retrieve a specific operation with document-drive action", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const opId = generateId();
      const nodeId = generateId();

      // Use a real delete node action
      const action = deleteNode({
        id: nodeId,
      });

      const originalOp: Operation = {
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "test-hash",
        skip: 0,
        id: opId,
        action,
        resultingState: JSON.stringify({ nodes: [] }),
        error: undefined,
      };

      const documentType = "powerhouse/document-drive";

      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations(originalOp);
      });

      const { operation, context } = await store.get(
        documentId,
        scope,
        branch,
        0,
      );

      expect(operation.index).toBe(0);
      expect(operation.id).toBe(opId);
      expect(operation.hash).toBe("test-hash");
      expect(operation.action.type).toBe("DELETE_NODE");
      expect(operation.action.input).toEqual({ id: nodeId });
      expect(operation.resultingState).toBe(JSON.stringify({ nodes: [] }));
      expect(context.documentId).toBe(documentId);
      expect(context.scope).toBe(scope);
      expect(context.branch).toBe(branch);
    });

    it("should throw error for non-existent operation", async () => {
      const documentId = generateId();
      await expect(
        store.get(documentId, "global", "main", 999),
      ).rejects.toThrow("Operation not found");
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
      expect(result).toHaveLength(2);
      expect(result[0].operation.index).toBe(1);
      expect(result[1].operation.index).toBe(2);
      expect(result[0].operation.action.type).toBe("ADD_FOLDER");
      expect(result[0].context.documentId).toBe(documentId);
      expect(result[0].context.scope).toBe(scope);
      expect(result[0].context.branch).toBe(branch);
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
      expect(result).toHaveLength(0);
    });
  });

  describe("getSinceTimestamp", () => {
    it("should get operations since a given timestamp", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const documentType = "powerhouse/document-drive";

      // Add some operations
      for (let i = 0; i < 2; i++) {
        const action = setDriveName({
          name: `Drive ${i}`,
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

      // Test with a timestamp from long ago - should get all operations
      const longAgo = new Date("2020-01-01").getTime();
      const result = await store.getSinceTimestamp(
        documentId,
        scope,
        branch,
        longAgo,
      );

      // Should get both operations since they were created after 2020
      expect(result.length).toBe(2);
      expect(result[0].operation.action.type).toBe("SET_DRIVE_NAME");
      expect(result[1].operation.action.type).toBe("SET_DRIVE_NAME");
      expect(result[0].context.documentId).toBe(documentId);
      expect(result[0].context.scope).toBe(scope);
      expect(result[0].context.branch).toBe(branch);
    });

    it("should return empty array when no operations since timestamp", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";

      // Test with a future timestamp - should get no operations
      const futureTime = Date.now() + 1000000; // 1000 seconds in future
      const result = await store.getSinceTimestamp(
        documentId,
        scope,
        branch,
        futureTime,
      );

      expect(result).toHaveLength(0);
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
      expect(allOps.length).toBeGreaterThanOrEqual(3);

      // Get operations since the first database ID
      // Note: This uses the internal database ID, not the operation ID
      const result = await store.getSinceId(1); // Assuming first DB ID is 1

      expect(result.length).toBeGreaterThanOrEqual(1);
      result.forEach((item) => {
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

    it("should abort get operation", async () => {
      const controller = new AbortController();
      controller.abort();
      const documentId = generateId();

      await expect(
        store.get(documentId, "global", "main", 0, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getSince operation", async () => {
      const controller = new AbortController();
      controller.abort();
      const documentId = generateId();

      await expect(
        store.getSince(documentId, "global", "main", 0, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getSinceTimestamp operation", async () => {
      const controller = new AbortController();
      controller.abort();
      const documentId = generateId();

      await expect(
        store.getSinceTimestamp(
          documentId,
          "global",
          "main",
          Date.now(),
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getSinceId operation", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(store.getSinceId(1, controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });
  });
});
