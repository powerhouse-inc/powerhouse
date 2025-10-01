import { addFile, addFolder, setDriveName } from "document-drive";
import type { Operation } from "document-model";
import { generateId } from "document-model/core";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyDocumentView } from "../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";

// Combined database type that includes both storage and view tables
type Database = StorageDatabase & DocumentViewDatabase;

describe("KyselyDocumentView", () => {
  let db: Kysely<Database>;
  let view: KyselyDocumentView;
  let operationStore: IOperationStore;
  let dialect: any;

  beforeEach(async () => {
    // Create in-memory PGLite database for testing
    const kyselyPGlite = await KyselyPGlite.create();
    dialect = kyselyPGlite.dialect;
    db = new Kysely<Database>({
      dialect,
    });

    // Create the Operation table for the store
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

    // Cast db to the appropriate types for each component
    operationStore = new KyselyOperationStore(
      db as unknown as Kysely<StorageDatabase>,
    );
    view = new KyselyDocumentView(db, operationStore);
  });

  afterEach(async () => {
    // Clean up database connection
    await db.destroy();
  });

  describe("init", () => {
    it("should initialize the view and create tables", async () => {
      await view.init();

      // Verify ViewState table was created and initialized
      const viewState = await db
        .selectFrom("ViewState")
        .selectAll()
        .executeTakeFirst();

      expect(viewState).toBeDefined();
      expect(viewState?.lastOperationId).toBe(0);
    });

    it("should catch up with missed operations on init", async () => {
      // Add some operations to the store first
      const documentId = generateId();
      const scope = "global";
      const branch = "main";

      for (let i = 0; i < 3; i++) {
        const action = addFolder({
          id: generateId(),
          name: `Folder ${i}`,
          parentFolder: null,
        });

        await operationStore.apply(documentId, scope, branch, i, (txn) => {
          txn.addOperations({
            index: i,
            timestampUtcMs: new Date().toISOString(),
            hash: `hash-${i}`,
            skip: 0,
            id: generateId(),
            action: {
              ...action,
              documentId, // Add documentId for parsing
              scope,
              branch,
            } as any,
          });
        });
      }

      // Initialize the view - it should process all operations
      await view.init();

      // Verify snapshots were created
      const snapshots = await db
        .selectFrom("DocumentSnapshot")
        .selectAll()
        .where("documentId", "=", documentId)
        .execute();

      expect(snapshots).toHaveLength(1); // One snapshot per document/scope/branch
      expect(snapshots[0].lastOperationIndex).toBe(2); // Last operation index
    });
  });

  describe("indexOperations", () => {
    beforeEach(async () => {
      await view.init();
    });

    it("should index operations and create document snapshots", async () => {
      const documentId = generateId();
      const operations: Operation[] = [
        {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-0",
          skip: 0,
          id: generateId(),
          action: {
            ...addFile({
              id: generateId(),
              name: "test.txt",
              documentType: "text/plain",
              parentFolder: null,
            }),
            documentId, // Adding documentId for parsing
          } as any,
        },
      ];

      await view.indexOperations(operations);

      // Verify snapshot was created
      const snapshots = await db
        .selectFrom("DocumentSnapshot")
        .selectAll()
        .where("documentId", "=", documentId)
        .execute();

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].lastOperationIndex).toBe(0);
      expect(snapshots[0].lastOperationHash).toBe("hash-0");
    });

    it("should update existing snapshots", async () => {
      const documentId = generateId();

      // Index first operation
      const operation1: Operation = {
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash-0",
        skip: 0,
        id: generateId(),
        action: {
          ...addFolder({
            id: generateId(),
            name: "Folder 1",
            parentFolder: null,
          }),
          documentId,
        } as any,
      };

      await view.indexOperations([operation1]);

      // Get initial snapshot version
      const initialSnapshot = await db
        .selectFrom("DocumentSnapshot")
        .selectAll()
        .where("documentId", "=", documentId)
        .executeTakeFirst();

      expect(initialSnapshot?.snapshotVersion).toBe(1);

      // Index second operation
      const operation2: Operation = {
        index: 1,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash-1",
        skip: 0,
        id: generateId(),
        action: {
          ...setDriveName({ name: "Updated Drive" }),
          documentId,
        } as any,
      };

      await view.indexOperations([operation2]);

      // Verify snapshot was updated
      const updatedSnapshot = await db
        .selectFrom("DocumentSnapshot")
        .selectAll()
        .where("documentId", "=", documentId)
        .executeTakeFirst();

      expect(updatedSnapshot?.lastOperationIndex).toBe(1);
      expect(updatedSnapshot?.lastOperationHash).toBe("hash-1");
      expect(updatedSnapshot?.snapshotVersion).toBe(2);
    });
  });

  describe("exists", () => {
    beforeEach(async () => {
      await view.init();
    });

    it("should check if documents exist", async () => {
      const existingDocId = generateId();
      const nonExistingDocId = generateId();

      // Create a snapshot for the existing document
      const operation: Operation = {
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash-0",
        skip: 0,
        id: generateId(),
        action: {
          ...addFile({
            id: generateId(),
            name: "exists.txt",
            documentType: "text/plain",
            parentFolder: null,
          }),
          documentId: existingDocId,
        } as any,
      };

      await view.indexOperations([operation]);

      // Check existence
      const results = await view.exists([
        existingDocId,
        nonExistingDocId,
        existingDocId, // Test duplicate
      ]);

      expect(results).toEqual([true, false, true]);
    });

    it("should return empty array for empty input", async () => {
      const results = await view.exists([]);
      expect(results).toEqual([]);
    });

    it("should not count deleted documents as existing", async () => {
      const documentId = generateId();

      // Create a snapshot
      const operation: Operation = {
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash-0",
        skip: 0,
        id: generateId(),
        action: {
          ...addFile({
            id: generateId(),
            name: "deleted.txt",
            documentType: "text/plain",
            parentFolder: null,
          }),
          documentId,
        } as any,
      };

      await view.indexOperations([operation]);

      // Mark as deleted
      await db
        .updateTable("DocumentSnapshot")
        .set({
          isDeleted: true,
          deletedAt: new Date(),
        })
        .where("documentId", "=", documentId)
        .execute();

      // Check existence
      const results = await view.exists([documentId]);
      expect(results).toEqual([false]);
    });

    it("should abort when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.exists([generateId()], controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("getMany", () => {
    beforeEach(async () => {
      await view.init();
    });

    it("should retrieve multiple documents by ID", async () => {
      const doc1Id = generateId();
      const doc2Id = generateId();
      const doc3Id = generateId();

      // Create snapshots for doc1 and doc2
      const operations = [
        {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-0",
          skip: 0,
          id: generateId(),
          action: {
            ...addFile({
              id: generateId(),
              name: "doc1.txt",
              documentType: "text/plain",
              parentFolder: null,
            }),
            documentId: doc1Id,
          } as any,
        },
        {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          skip: 0,
          id: generateId(),
          action: {
            ...addFile({
              id: generateId(),
              name: "doc2.txt",
              documentType: "text/plain",
              parentFolder: null,
            }),
            documentId: doc2Id,
          } as any,
        },
      ];

      await view.indexOperations(operations);

      // Get all three documents (doc3 doesn't exist)
      const results = await view.getMany([doc1Id, doc2Id, doc3Id]);

      expect(results).toHaveLength(3);
      expect(results[0]).not.toBeNull();
      expect(results[0]?.documentId).toBe(doc1Id);
      expect(results[1]).not.toBeNull();
      expect(results[1]?.documentId).toBe(doc2Id);
      expect(results[2]).toBeNull();
    });

    it("should return empty array for empty input", async () => {
      const results = await view.getMany([]);
      expect(results).toEqual([]);
    });

    it("should filter by scope and branch", async () => {
      const docId = generateId();

      // Create a snapshot in a different scope
      const operation: Operation = {
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash-0",
        skip: 0,
        id: generateId(),
        action: {
          ...addFile({
            id: generateId(),
            name: "scoped.txt",
            documentType: "text/plain",
            parentFolder: null,
          }),
          documentId: docId,
          scope: "custom-scope",
        } as any,
      };

      await view.indexOperations([operation]);

      // Should not find in default scope
      const defaultResults = await view.getMany([docId]);
      expect(defaultResults[0]).toBeNull();

      // Should find in custom scope
      const customResults = await view.getMany([docId], "custom-scope", "main");
      expect(customResults[0]).not.toBeNull();
      expect(customResults[0]?.documentId).toBe(docId);
    });

    it("should not return deleted documents", async () => {
      const docId = generateId();

      // Create a snapshot
      const operation: Operation = {
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash-0",
        skip: 0,
        id: generateId(),
        action: {
          ...addFile({
            id: generateId(),
            name: "deleted.txt",
            documentType: "text/plain",
            parentFolder: null,
          }),
          documentId: docId,
        } as any,
      };

      await view.indexOperations([operation]);

      // Verify it exists
      let results = await view.getMany([docId]);
      expect(results[0]).not.toBeNull();

      // Mark as deleted
      await db
        .updateTable("DocumentSnapshot")
        .set({
          isDeleted: true,
          deletedAt: new Date(),
        })
        .where("documentId", "=", docId)
        .execute();

      // Should not be returned
      results = await view.getMany([docId]);
      expect(results[0]).toBeNull();
    });

    it("should abort when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.getMany([generateId()], "global", "main", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should maintain order of requested IDs", async () => {
      const doc1Id = generateId();
      const doc2Id = generateId();
      const doc3Id = generateId();

      // Create snapshots in different order
      const operations = [
        {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-2",
          skip: 0,
          id: generateId(),
          action: {
            ...addFile({
              id: generateId(),
              name: "doc3.txt",
              documentType: "text/plain",
              parentFolder: null,
            }),
            documentId: doc3Id,
          } as any,
        },
        {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-0",
          skip: 0,
          id: generateId(),
          action: {
            ...addFile({
              id: generateId(),
              name: "doc1.txt",
              documentType: "text/plain",
              parentFolder: null,
            }),
            documentId: doc1Id,
          } as any,
        },
      ];

      await view.indexOperations(operations);

      // Request in specific order
      const results = await view.getMany([doc2Id, doc3Id, doc1Id]);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeNull(); // doc2 doesn't exist
      expect(results[1]?.documentId).toBe(doc3Id);
      expect(results[2]?.documentId).toBe(doc1Id);
    });
  });
});
