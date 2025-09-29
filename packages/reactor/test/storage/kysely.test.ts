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
  });
});
