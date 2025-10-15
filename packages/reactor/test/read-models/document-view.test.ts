import { addFile, addFolder, setDriveName } from "document-drive";
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
      .addColumn("documentType", "text", (col) => col.notNull())
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
      const documentType = "powerhouse/document-drive";

      for (let i = 0; i < 3; i++) {
        const action = addFolder({
          id: generateId(),
          name: `Folder ${i}`,
          parentFolder: null,
        });

        await operationStore.apply(
          documentId,
          documentType,
          scope,
          branch,
          i,
          (txn) => {
            txn.addOperations({
              index: i,
              timestampUtcMs: new Date().toISOString(),
              hash: `hash-${i}`,
              skip: 0,
              id: generateId(),
              action,
            });
          },
        );
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
      const scope = "global";
      const branch = "main";
      const documentType = "text/plain";

      const operations = [
        {
          operation: {
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action: addFile({
              id: generateId(),
              name: "test.txt",
              documentType: "text/plain",
              parentFolder: null,
            }),
          },
          context: {
            documentId,
            documentType,
            scope,
            branch,
          },
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
      const scope = "global";
      const branch = "main";
      const documentType = "powerhouse/document-drive";

      // Index first operation
      const operation1 = {
        operation: {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-0",
          skip: 0,
          id: generateId(),
          action: addFolder({
            id: generateId(),
            name: "Folder 1",
            parentFolder: null,
          }),
        },
        context: {
          documentId,
          documentType,
          scope,
          branch,
        },
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
      const operation2 = {
        operation: {
          index: 1,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          skip: 0,
          id: generateId(),
          action: setDriveName({ name: "Updated Drive" }),
        },
        context: {
          documentId,
          documentType,
          scope,
          branch,
        },
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
      const scope = "global";
      const branch = "main";
      const documentType = "text/plain";

      // Create a snapshot for the existing document
      const operation = {
        operation: {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-0",
          skip: 0,
          id: generateId(),
          action: addFile({
            id: generateId(),
            name: "exists.txt",
            documentType: "text/plain",
            parentFolder: null,
          }),
        },
        context: {
          documentId: existingDocId,
          documentType,
          scope,
          branch,
        },
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
      const scope = "global";
      const branch = "main";
      const documentType = "text/plain";

      // Create a snapshot
      const operation = {
        operation: {
          index: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-0",
          skip: 0,
          id: generateId(),
          action: addFile({
            id: generateId(),
            name: "deleted.txt",
            documentType: "text/plain",
            parentFolder: null,
          }),
        },
        context: {
          documentId,
          documentType,
          scope,
          branch,
        },
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

  describe("getHeader", () => {
    beforeEach(async () => {
      await view.init();
    });

    it("should reconstruct header from CREATE_DOCUMENT operation", async () => {
      const documentId = generateId();
      const branch = "main";
      const documentType = "powerhouse/document-drive";
      const createdAt = new Date().toISOString();
      const nonce = "test-nonce-123";
      const publicKey: JsonWebKey = {
        kty: "EC",
        crv: "P-256",
        x: "test-x",
        y: "test-y",
      };

      // Create a CREATE_DOCUMENT operation with signing parameters
      const createAction = {
        id: generateId(),
        type: "CREATE_DOCUMENT",
        scope: "header",
        timestampUtcMs: createdAt,
        input: {
          model: "powerhouse/document-drive",
          version: "0.0.0" as const,
          documentId,
          signing: {
            signature: documentId,
            publicKey,
            nonce,
            createdAtUtcIso: createdAt,
            documentType,
          },
        },
      };

      // Index the CREATE_DOCUMENT operation in "header" scope
      await view.indexOperations([
        {
          operation: {
            index: 0,
            timestampUtcMs: createdAt,
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action: createAction,
            resultingState: JSON.stringify({
              header: {
                id: documentId,
                documentType,
                slug: documentId,
                name: "",
                branch,
                revision: { header: 0 },
                lastModifiedAtUtcIso: createdAt,
                createdAtUtcIso: createdAt,
                sig: {
                  nonce,
                  publicKey,
                },
              },
            }),
          },
          context: {
            documentId,
            documentType,
            scope: "header",
            branch,
          },
        },
      ]);

      // Store the operation in the operation store for getRevisions to work
      await operationStore.apply(
        documentId,
        documentType,
        "header",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: createdAt,
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action: createAction,
          });
        },
      );

      // Get header and verify
      const header = await view.getHeader(documentId, branch);

      expect(header.id).toBe(documentId);
      expect(header.documentType).toBe(documentType);
      expect(header.createdAtUtcIso).toBe(createdAt);
      expect(header.sig.nonce).toBe(nonce);
      expect(header.sig.publicKey).toEqual(publicKey);
    });

    it("should include revision map and latest timestamp from all scopes", async () => {
      const documentId = generateId();
      const branch = "main";
      const documentType = "powerhouse/document-drive";
      const createdAt = new Date().toISOString();
      const laterTimestamp = new Date(Date.now() + 1000).toISOString();

      // Create a CREATE_DOCUMENT operation
      const createAction = {
        id: generateId(),
        type: "CREATE_DOCUMENT",
        scope: "header",
        timestampUtcMs: createdAt,
        input: {
          model: "powerhouse/document-drive",
          version: "0.0.0" as const,
          documentId,
          signing: {
            signature: documentId,
            publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
            nonce: "nonce",
            createdAtUtcIso: createdAt,
            documentType,
          },
        },
      };

      // Index CREATE_DOCUMENT in "header" scope
      await view.indexOperations([
        {
          operation: {
            index: 0,
            timestampUtcMs: createdAt,
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action: createAction,
            resultingState: JSON.stringify({
              header: {
                id: documentId,
                documentType,
                slug: documentId,
                name: "",
                branch,
                createdAtUtcIso: createdAt,
                sig: {
                  nonce: "nonce",
                  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
                },
              },
            }),
          },
          context: {
            documentId,
            documentType,
            scope: "header",
            branch,
          },
        },
      ]);

      // Store operations in operation store
      await operationStore.apply(
        documentId,
        documentType,
        "header",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: createdAt,
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action: createAction,
          });
        },
      );

      // Add operations in different scopes to test revision tracking
      await operationStore.apply(
        documentId,
        documentType,
        "global",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: laterTimestamp,
            hash: "hash-global-0",
            skip: 0,
            id: generateId(),
            action: addFolder({
              id: generateId(),
              name: "Test Folder",
              parentFolder: null,
            }),
          });
        },
      );

      await operationStore.apply(
        documentId,
        documentType,
        "global",
        branch,
        1,
        (txn) => {
          txn.addOperations({
            index: 1,
            timestampUtcMs: laterTimestamp,
            hash: "hash-global-1",
            skip: 0,
            id: generateId(),
            action: setDriveName({ name: "Test Drive" }),
          });
        },
      );

      // Get header and verify revision tracking
      const header = await view.getHeader(documentId, branch);

      // Revision should include all scopes with their latest indices
      expect(header.revision).toEqual({
        header: 0,
        global: 1,
      });

      // lastModifiedAtUtcIso should be the latest timestamp across all scopes
      expect(header.lastModifiedAtUtcIso).toBe(laterTimestamp);
    });

    it("should handle multiple operations in header and document scopes", async () => {
      const documentId = generateId();
      const branch = "main";
      const documentType = "powerhouse/document-drive";
      const createdAt = new Date().toISOString();

      // Create a CREATE_DOCUMENT operation
      const createAction = {
        id: generateId(),
        type: "CREATE_DOCUMENT",
        scope: "header",
        timestampUtcMs: createdAt,
        input: {
          model: "powerhouse/document-drive",
          version: "0.0.0" as const,
          documentId,
          signing: {
            signature: documentId,
            publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
            nonce: "nonce",
            createdAtUtcIso: createdAt,
            documentType,
          },
        },
      };

      // Store CREATE_DOCUMENT in both view and operation store
      await view.indexOperations([
        {
          operation: {
            index: 0,
            timestampUtcMs: createdAt,
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action: createAction,
            resultingState: JSON.stringify({
              header: {
                id: documentId,
                documentType,
                slug: documentId,
                name: "",
                branch,
                createdAtUtcIso: createdAt,
                sig: {
                  nonce: "nonce",
                  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
                },
              },
            }),
          },
          context: {
            documentId,
            documentType,
            scope: "header",
            branch,
          },
        },
      ]);

      await operationStore.apply(
        documentId,
        documentType,
        "header",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: createdAt,
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action: createAction,
          });
        },
      );

      // Add an operation in document scope
      const upgradeAction = {
        id: generateId(),
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: createdAt,
        input: {
          model: "powerhouse/document-drive",
          fromVersion: "0.0.0",
          toVersion: "1.0.0",
        },
      };

      await view.indexOperations([
        {
          operation: {
            index: 0,
            timestampUtcMs: createdAt,
            hash: "hash-doc-0",
            skip: 0,
            id: generateId(),
            action: upgradeAction,
            resultingState: JSON.stringify({
              document: {
                version: "1.0.0",
                isDeleted: false,
              },
            }),
          },
          context: {
            documentId,
            documentType,
            scope: "document",
            branch,
          },
        },
      ]);

      await operationStore.apply(
        documentId,
        documentType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: createdAt,
            hash: "hash-doc-0",
            skip: 0,
            id: generateId(),
            action: upgradeAction,
          });
        },
      );

      // Get header and verify it includes operations from both header and document scopes
      const header = await view.getHeader(documentId, branch);

      expect(header.id).toBe(documentId);
      expect(header.revision).toEqual({
        header: 0,
        document: 0,
      });
    });

    it("should throw error when document header not found", async () => {
      const nonExistentDocId = generateId();
      const branch = "main";

      await expect(view.getHeader(nonExistentDocId, branch)).rejects.toThrow(
        `Document header not found: ${nonExistentDocId}`,
      );
    });

    it("should abort when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.getHeader(generateId(), "main", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });
});
