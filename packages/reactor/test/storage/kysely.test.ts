import {
  addFile,
  addFolder,
  deleteNode,
  driveDocumentModelModule,
  setDriveName,
  updateFile,
} from "document-drive";
import type { Operation, PHDocumentHeader } from "document-model";
import { generateId } from "document-model/core";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateOperationError,
  RevisionMismatchError,
} from "../../src/storage/interfaces.js";
import { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";

describe("KyselyOperationStore", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;
  let dialect: any;

  beforeEach(async () => {
    // Create in-memory PGLite database for testing
    const kyselyPGlite = await KyselyPGlite.create();
    dialect = kyselyPGlite.dialect;
    db = new Kysely<DatabaseSchema>({
      dialect,
    });

    // Create the Operation table
    await db.schema
      .createTable("Operation")
      .addColumn("id", "serial", (col) => col.primaryKey())
      .addColumn("jobId", "text", (col) => col.notNull())
      .addColumn("opId", "text", (col) => col.notNull().unique())
      .addColumn("prevOpId", "text", (col) => col.notNull())
      .addColumn("writeTimestampUtcMs", "timestamptz", (col) =>
        col.notNull().defaultTo(new Date()),
      )
      .addColumn("documentId", "text", (col) => col.notNull())
      .addColumn("scope", "text", (col) => col.notNull())
      .addColumn("branch", "text", (col) => col.notNull())
      .addColumn("timestampUtcMs", "timestamptz", (col) => col.notNull())
      .addColumn("index", "integer", (col) => col.notNull())
      .addColumn("action", "text", (col) => col.notNull())
      .addColumn("skip", "integer", (col) => col.notNull())
      .addColumn("resultingState", "text")
      .addColumn("error", "text")
      .addColumn("hash", "text", (col) => col.notNull())
      .addUniqueConstraint("unique_revision", [
        "documentId",
        "scope",
        "branch",
        "index",
      ])
      .execute();

    // Create indexes
    await db.schema
      .createIndex("streamOperations")
      .on("Operation")
      .columns(["documentId", "scope", "branch", "id"])
      .execute();

    await db.schema
      .createIndex("branchlessStreamOperations")
      .on("Operation")
      .columns(["documentId", "scope", "id"])
      .execute();

    store = new KyselyOperationStore(db);
  });

  afterEach(async () => {
    // Clean up database connection
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
      await store.apply(documentId, scope, branch, 0, (txn) => {
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
      const retrievedOp = await store.get(documentId, scope, branch, 0);
      expect(retrievedOp.id).toBe(opId);
      expect(retrievedOp.action.type).toBe("ADD_FOLDER");
      expect(retrievedOp.action.input).toHaveProperty("name", "Test Folder");
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
      await expect(
        store.apply(documentId, scope, branch, 5, (txn) => {
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

      // First insert should succeed
      await store.apply(documentId, scope, branch, 0, (txn) => {
        txn.addOperations(op);
      });

      // Second insert with same ID should fail
      const secondDocId = generateId();
      await expect(
        store.apply(secondDocId, scope, branch, 0, (txn) => {
          txn.addOperations({ ...op, index: 0 });
        }),
      ).rejects.toThrow(DuplicateOperationError);
    });

    it("should store header updates in 'header' scope", async () => {
      const documentId = generateId();
      const branch = "main";

      // Create initial header using document-drive document
      const driveDoc = driveDocumentModelModule.utils.createDocument();

      // This is not how headers will work, but for now, test that we can store them per scope
      await store.apply(documentId, "header", branch, 0, (txn) => {
        const headerOp: Operation = {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "",
          skip: 0,
          action: {
            id: generateId(),
            type: "CREATE_HEADER",
            timestampUtcMs: new Date().toISOString(),
            input: {
              ...driveDoc.header,
              id: documentId,
              slug: "test-slug",
              name: "Test Document",
              branch: branch,
              revision: { global: 0 },
            } as PHDocumentHeader,
            scope: "header",
          },
        };
        txn.addOperations(headerOp);
      });

      // Update header with real document-drive action
      const updateAction = updateFile({
        id: generateId(),
        name: "Updated Document",
      });

      await store.apply(documentId, "global", branch, 0, (txn) => {
        txn.setName("Updated Name");
        txn.setSlug("updated-slug");
        txn.addOperations({
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          skip: 0,
          action: updateAction,
        });
      });

      // Verify header was updated
      const header = await store.getHeader(documentId, branch, 1);
      expect(header.name).toBe("Updated Name");
      expect(header.slug).toBe("updated-slug");
    });
  });

  describe("getHeader", () => {
    it("should reconstruct header from operations", async () => {
      const documentId = generateId();
      const branch = "main";

      // Create initial header using real document-drive document
      const driveDoc = driveDocumentModelModule.utils.createDocument();
      const initialHeader: PHDocumentHeader = {
        ...driveDoc.header,
        id: documentId,
        slug: "initial-slug",
        name: "Initial Name",
        branch: branch,
        revision: {},
        meta: { preferredEditor: "test-editor" },
      };

      // This is not how headers will work, but for now, test that we can store them per scope
      await store.apply(documentId, "header", branch, 0, (txn) => {
        txn.addOperations({
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "",
          skip: 0,
          action: {
            id: generateId(),
            type: "CREATE_HEADER",
            timestampUtcMs: new Date().toISOString(),
            input: initialHeader,
            scope: "header",
          },
        });
      });

      // Get header at revision 0
      const header = await store.getHeader(documentId, branch, 0);
      expect(header.id).toBe(documentId);
      expect(header.name).toBe("Initial Name");
      expect(header.slug).toBe("initial-slug");
      expect(header.meta?.preferredEditor).toBe("test-editor");
    });

    it("should throw error for non-existent document", async () => {
      const nonExistentId = generateId();
      await expect(store.getHeader(nonExistentId, "main", 0)).rejects.toThrow(
        "Document header not found",
      );
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

      await store.apply(documentId, scope, branch, 0, (txn) => {
        txn.addOperations(originalOp);
      });

      const retrievedOp = await store.get(documentId, scope, branch, 0);

      expect(retrievedOp.index).toBe(0);
      expect(retrievedOp.id).toBe(opId);
      expect(retrievedOp.hash).toBe("test-hash");
      expect(retrievedOp.action.type).toBe("DELETE_NODE");
      expect(retrievedOp.action.input).toEqual({ id: nodeId });
      expect(retrievedOp.resultingState).toBe(JSON.stringify({ nodes: [] }));
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

        await store.apply(documentId, scope, branch, i, (txn) => {
          txn.addOperations(op);
        });
      }

      // Get operations since revision 0 (should return operations at revision 1 and 2)
      const result = await store.getSince(documentId, scope, branch, 0);
      expect(result).toHaveLength(2);
      expect(result[0].index).toBe(1);
      expect(result[1].index).toBe(2);
      expect(result[0].action.type).toBe("ADD_FOLDER");
    });

    it("should return empty array when no operations since revision", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";

      // Add one operation at revision 0
      const action = addFile({
        id: generateId(),
        name: "test.txt",
        documentType: "text/plain",
        parentFolder: null,
      });

      await store.apply(documentId, scope, branch, 0, (txn) => {
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

      // Add some operations
      for (let i = 0; i < 2; i++) {
        const action = setDriveName({
          name: `Drive ${i}`,
        });

        await store.apply(documentId, scope, branch, i, (txn) => {
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
      expect(result[0].action.type).toBe("SET_DRIVE_NAME");
      expect(result[1].action.type).toBe("SET_DRIVE_NAME");
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

      // Add multiple operations to get database IDs
      for (let i = 0; i < 3; i++) {
        const action = deleteNode({
          id: generateId(),
        });

        await store.apply(documentId, scope, branch, i, (txn) => {
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
      result.forEach((op) => {
        expect(op.action.type).toBe("DELETE_NODE");
      });
    });
  });

  describe("abort signal handling", () => {
    it("should abort apply operation", async () => {
      const controller = new AbortController();
      controller.abort();
      const documentId = generateId();

      await expect(
        store.apply(
          documentId,
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

    it("should abort getHeader operation", async () => {
      const controller = new AbortController();
      controller.abort();
      const documentId = generateId();

      await expect(
        store.getHeader(documentId, "main", 0, controller.signal),
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
