import { addFile, addFolder, setDriveName } from "document-drive";
import { generateId } from "document-model/core";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyDocumentView } from "../../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import { runMigrations } from "../../../src/storage/migrations/migrator.js";
import { createTestOperation } from "../../factories.js";

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

    // Run migrations to create all tables
    const result = await runMigrations(db);
    if (!result.success && result.error) {
      throw new Error(`Test migration failed: ${result.error.message}`);
    }

    // Cast db to the appropriate types for each component
    operationStore = new KyselyOperationStore(
      db as unknown as Kysely<StorageDatabase>,
    );
    const consistencyTracker = new ConsistencyTracker();
    view = new KyselyDocumentView(db, operationStore, consistencyTracker);
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

      const operations = [];
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

        operations.push({
          operation: {
            index: i,
            timestampUtcMs: new Date().toISOString(),
            hash: `hash-${i}`,
            skip: 0,
            id: generateId(),
            action,
          },
          context: {
            documentId,
            documentType,
            scope,
            branch,
            resultingState: JSON.stringify({ global: {} }),
          },
        });
      }

      // Mock getSinceId to return operations with resultingState
      vi.spyOn(operationStore, "getSinceId").mockResolvedValue({
        items: operations,
        nextCursor: undefined,
        hasMore: false,
      });

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
            resultingState: JSON.stringify({ global: {} }), // Ephemeral state
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
          resultingState: JSON.stringify({ global: {} }),
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
          resultingState: JSON.stringify({ global: {} }),
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
          resultingState: JSON.stringify({ global: {} }),
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
          resultingState: JSON.stringify({ global: {} }),
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
        view.exists([generateId()], undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("get() with minimal scopes (header and document only)", () => {
    beforeEach(async () => {
      await view.init();
    });

    it("should retrieve document with only header and document scopes when specifying ['header']", async () => {
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

      // Get document with just header scope specified (should return header + document minimum)
      const document = await view.get(documentId, {
        scopes: ["header"],
        branch,
      });

      // Verify header fields
      expect(document.header.id).toBe(documentId);
      expect(document.header.documentType).toBe(documentType);
      expect(document.header.createdAtUtcIso).toBe(createdAt);
      expect(document.header.sig.nonce).toBe(nonce);
      expect(document.header.sig.publicKey).toEqual(publicKey);
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
                revision: { header: 0 },
                lastModifiedAtUtcIso: laterTimestamp,
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
            resultingState: JSON.stringify({
              header: {
                id: documentId,
                documentType,
                slug: documentId,
                name: "",
                branch,
                revision: { header: 0 },
                lastModifiedAtUtcIso: laterTimestamp,
                createdAtUtcIso: createdAt,
                sig: {
                  nonce: "nonce",
                  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
                },
              },
            }),
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

      // Index the latest global operation which updates the header with cross-scope revision
      await view.indexOperations([
        {
          operation: {
            index: 1,
            timestampUtcMs: laterTimestamp,
            hash: "hash-global-1",
            skip: 0,
            id: generateId(),
            action: setDriveName({ name: "Test Drive" }),
            resultingState: JSON.stringify({
              header: {
                id: documentId,
                documentType,
                slug: documentId,
                name: "",
                branch,
                revision: { header: 0, global: 1 },
                lastModifiedAtUtcIso: laterTimestamp,
                createdAtUtcIso: createdAt,
                sig: {
                  nonce: "nonce",
                  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
                },
              },
              global: {
                name: "Test Drive",
                // ... rest of global state
              },
            }),
          },
          context: {
            documentId,
            documentType,
            scope: "global",
            branch,
            resultingState: JSON.stringify({
              header: {
                id: documentId,
                documentType,
                slug: documentId,
                name: "",
                branch,
                revision: { header: 0, global: 1 },
                lastModifiedAtUtcIso: laterTimestamp,
                createdAtUtcIso: createdAt,
                sig: {
                  nonce: "nonce",
                  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
                },
              },
              global: {
                name: "Test Drive",
                // ... rest of global state
              },
            }),
          },
        },
      ]);

      // Get document with document scope specified (should return header + document minimum)
      const document = await view.get(documentId, {
        scopes: ["document"],
        branch,
      });

      // Verify revision map includes data from snapshot
      expect(document.header.revision).toEqual({
        header: 1,
        global: 2,
      });

      // lastModifiedAtUtcIso should be the latest timestamp from snapshot
      expect(document.header.lastModifiedAtUtcIso).toBe(laterTimestamp);
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
                revision: { header: 0 },
                lastModifiedAtUtcIso: createdAt,
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
                  nonce: "nonce",
                  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
                },
              },
            }),
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

      // Index the document operation which updates the header with document scope revision
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
              header: {
                id: documentId,
                documentType,
                slug: documentId,
                name: "",
                branch,
                revision: { header: 0, document: 0 },
                lastModifiedAtUtcIso: createdAt,
                createdAtUtcIso: createdAt,
                sig: {
                  nonce: "nonce",
                  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
                },
              },
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
            resultingState: JSON.stringify({
              header: {
                id: documentId,
                documentType,
                slug: documentId,
                name: "",
                branch,
                revision: { header: 0, document: 0 },
                lastModifiedAtUtcIso: createdAt,
                createdAtUtcIso: createdAt,
                sig: {
                  nonce: "nonce",
                  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
                },
              },
              document: {
                version: "1.0.0",
                isDeleted: false,
              },
            }),
          },
        },
      ]);

      // Get document with header scope specified (should return header + document minimum)
      const document = await view.get(documentId, {
        scopes: ["header"],
        branch,
      });

      // Verify header and revision tracking
      expect(document.header.id).toBe(documentId);
      expect(document.header.revision).toEqual({
        header: 1,
        document: 1,
      });
    });

    it("should throw error when document not found", async () => {
      const nonExistentDocId = generateId();
      const branch = "main";

      await expect(
        view.get(nonExistentDocId, { scopes: ["header"], branch }),
      ).rejects.toThrow(`Document not found: ${nonExistentDocId}`);
    });

    it("should abort when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.get(
          generateId(),
          { scopes: ["header"], branch: "main" },
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("findByType", () => {
    beforeEach(async () => {
      await view.init();
    });

    it("should find documents after they are indexed", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/document-drive";
      const scope = "document";
      const branch = "main";

      const action = addFolder({
        id: generateId(),
        name: "Test Folder",
        parentFolder: null,
      });

      await operationStore.apply(
        documentId,
        documentType,
        scope,
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          });
        },
      );

      await view.indexOperations([
        {
          operation: {
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          },
          context: {
            documentId,
            documentType,
            scope,
            branch,
            resultingState: JSON.stringify({
              header: { id: documentId, documentType },
              document: {},
            }),
          },
        },
      ]);

      const result = await view.findByType(documentType);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.header.id).toBe(documentId);
      expect(result.items[0]?.header.documentType).toBe(documentType);
      expect(result.hasMore).toBe(false);
    });

    it("should respect consistency token for read-after-write consistency", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/document-drive";
      const scope = "document";
      const branch = "main";

      const action = addFolder({
        id: generateId(),
        name: "Test Folder",
        parentFolder: null,
      });

      await operationStore.apply(
        documentId,
        documentType,
        scope,
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          });
        },
      );

      const indexPromise = view.indexOperations([
        {
          operation: {
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          },
          context: {
            documentId,
            documentType,
            scope,
            branch,
            resultingState: JSON.stringify({
              header: { id: documentId, documentType },
              document: {},
            }),
          },
        },
      ]);

      const consistencyToken = {
        version: 1 as const,
        createdAtUtcIso: new Date().toISOString(),
        coordinates: [
          {
            documentId,
            scope,
            branch,
            operationIndex: 0,
          },
        ],
      };

      const resultPromise = view.findByType(
        documentType,
        undefined,
        undefined,
        consistencyToken,
      );

      await Promise.all([indexPromise, resultPromise]);

      const result = await resultPromise;

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.header.id).toBe(documentId);
    });

    it("should paginate through large result sets", async () => {
      const documentType = "powerhouse/document-drive";
      const scope = "document";
      const branch = "main";

      for (let i = 0; i < 5; i++) {
        const documentId = generateId();
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
          0,
          (txn) => {
            txn.addOperations({
              index: 0,
              timestampUtcMs: new Date().toISOString(),
              hash: `hash-${i}`,
              skip: 0,
              id: generateId(),
              action,
            });
          },
        );

        await view.indexOperations([
          {
            operation: {
              index: 0,
              timestampUtcMs: new Date().toISOString(),
              hash: `hash-${i}`,
              skip: 0,
              id: generateId(),
              action,
            },
            context: {
              documentId,
              documentType,
              scope,
              branch,
              resultingState: JSON.stringify({
                header: { id: documentId, documentType },
                document: {},
              }),
            },
          },
        ]);
      }

      const firstPage = await view.findByType(documentType, undefined, {
        cursor: "0",
        limit: 2,
      });

      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.nextCursor).toBe("2");

      const secondPage = await view.findByType(documentType, undefined, {
        cursor: firstPage.nextCursor,
        limit: 2,
      });

      expect(secondPage.items).toHaveLength(2);
      expect(secondPage.hasMore).toBe(true);
    });

    it("should filter by branch correctly when multiple branches exist", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/document-drive";
      const scope = "document";

      for (const branch of ["main", "feature"]) {
        const action = addFolder({
          id: generateId(),
          name: `Folder ${branch}`,
          parentFolder: null,
        });

        await operationStore.apply(
          documentId,
          documentType,
          scope,
          branch,
          0,
          (txn) => {
            txn.addOperations({
              index: 0,
              timestampUtcMs: new Date().toISOString(),
              hash: `hash-${branch}`,
              skip: 0,
              id: generateId(),
              action,
            });
          },
        );

        await view.indexOperations([
          {
            operation: {
              index: 0,
              timestampUtcMs: new Date().toISOString(),
              hash: `hash-${branch}`,
              skip: 0,
              id: generateId(),
              action,
            },
            context: {
              documentId,
              documentType,
              scope,
              branch,
              resultingState: JSON.stringify({
                header: { id: documentId, documentType },
                document: {},
              }),
            },
          },
        ]);
      }

      const mainResult = await view.findByType(documentType, {
        branch: "main",
      });
      const featureResult = await view.findByType(documentType, {
        branch: "feature",
      });

      expect(mainResult.items).toHaveLength(1);
      expect(featureResult.items).toHaveLength(1);
    });

    it("should exclude deleted documents from results", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/document-drive";
      const scope = "document";
      const branch = "main";

      const action = addFolder({
        id: generateId(),
        name: "Test Folder",
        parentFolder: null,
      });

      await operationStore.apply(
        documentId,
        documentType,
        scope,
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          });
        },
      );

      await view.indexOperations([
        {
          operation: {
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          },
          context: {
            documentId,
            documentType,
            scope,
            branch,
            resultingState: JSON.stringify({
              header: { id: documentId, documentType },
              document: {},
            }),
          },
        },
      ]);

      await db
        .updateTable("DocumentSnapshot")
        .set({ isDeleted: true })
        .where("documentId", "=", documentId)
        .execute();

      const result = await view.findByType(documentType);

      expect(result.items).toHaveLength(0);
    });
  });

  describe("resolveSlug", () => {
    beforeEach(async () => {
      await view.init();
    });

    it("should resolve slug after document with slug is indexed", async () => {
      const documentId = generateId();
      const slug = "my-test-slug";
      const documentType = "powerhouse/document-drive";
      const scope = "header";
      const branch = "main";

      const action = addFolder({
        id: generateId(),
        name: "Test Folder",
        parentFolder: null,
      });

      await operationStore.apply(
        documentId,
        documentType,
        scope,
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          });
        },
      );

      await db
        .insertInto("SlugMapping")
        .values({
          slug,
          documentId,
          scope,
          branch,
        })
        .execute();

      const result = await view.resolveSlug(slug);

      expect(result).toBe(documentId);
    });

    it("should respect consistency token for read-after-write consistency", async () => {
      const documentId = generateId();
      const slug = "my-test-slug";
      const documentType = "powerhouse/document-drive";
      const scope = "header";
      const branch = "main";

      const action = addFolder({
        id: generateId(),
        name: "Test Folder",
        parentFolder: null,
      });

      await operationStore.apply(
        documentId,
        documentType,
        scope,
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          });
        },
      );

      await db
        .insertInto("SlugMapping")
        .values({
          slug,
          documentId,
          scope,
          branch,
        })
        .execute();

      await view.indexOperations([
        {
          operation: {
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          },
          context: {
            documentId,
            documentType,
            scope,
            branch,
            resultingState: JSON.stringify({
              header: { id: documentId, documentType },
            }),
          },
        },
      ]);

      const consistencyToken = {
        version: 1 as const,
        createdAtUtcIso: new Date().toISOString(),
        coordinates: [
          {
            documentId,
            scope,
            branch,
            operationIndex: 0,
          },
        ],
      };

      const result = await view.resolveSlug(slug, undefined, consistencyToken);

      expect(result).toBe(documentId);
    });

    it("should return undefined before document is indexed", async () => {
      const result = await view.resolveSlug("non-existent-slug");

      expect(result).toBeUndefined();
    });

    it("should filter by branch correctly when slug exists on multiple branches", async () => {
      const documentId = generateId();
      const slug = "my-slug";
      const scope = "header";

      for (const branch of ["main", "feature"]) {
        await db
          .insertInto("SlugMapping")
          .values({
            slug: `${slug}-${branch}`,
            documentId,
            scope,
            branch,
          })
          .execute();
      }

      const mainResult = await view.resolveSlug(`${slug}-main`, {
        branch: "main",
      });
      const featureResult = await view.resolveSlug(`${slug}-feature`, {
        branch: "feature",
      });

      expect(mainResult).toBe(documentId);
      expect(featureResult).toBe(documentId);
    });

    it("should resolve slug immediately after indexing", async () => {
      const documentId = generateId();
      const slug = "immediate-slug";
      const documentType = "powerhouse/document-drive";
      const scope = "header";
      const branch = "main";

      const action = addFolder({
        id: generateId(),
        name: "Test Folder",
        parentFolder: null,
      });

      await operationStore.apply(
        documentId,
        documentType,
        scope,
        branch,
        0,
        (txn) => {
          txn.addOperations({
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash-0",
            skip: 0,
            id: generateId(),
            action,
          });
        },
      );

      await db
        .insertInto("SlugMapping")
        .values({
          slug,
          documentId,
          scope,
          branch,
        })
        .execute();

      const result = await view.resolveSlug(slug);

      expect(result).toBe(documentId);
    });

    describe("automatic slug indexing", () => {
      beforeEach(async () => {
        await view.init();
      });

      it("should create slug mapping when indexing header with slug", async () => {
        const documentId = generateId();
        const slug = "auto-indexed-slug";
        const documentType = "powerhouse/document-model";
        const branch = "main";

        const headerState = {
          id: documentId,
          documentType,
          slug,
          name: "Test Document",
        };

        const resultingState = JSON.stringify({
          header: headerState,
          document: {},
        });

        await view.indexOperations([
          {
            operation: createTestOperation({
              index: 0,
              action: {
                type: "CREATE_DOCUMENT",
                scope: "document",
                input: {},
              } as any,
            }),
            context: {
              documentId,
              documentType,
              scope: "header",
              branch,
              resultingState,
            },
          },
        ]);

        const resolvedId = await view.resolveSlug(slug, branch);

        expect(resolvedId).toBe(documentId);
      });

      it("should not create mapping when slug equals documentId", async () => {
        const documentId = generateId();
        const slug = documentId;
        const documentType = "powerhouse/document-model";
        const branch = "main";

        const headerState = {
          id: documentId,
          documentType,
          slug,
        };

        const resultingState = JSON.stringify({
          header: headerState,
          document: {},
        });

        await view.indexOperations([
          {
            operation: createTestOperation({
              index: 0,
              action: {
                type: "CREATE_DOCUMENT",
                scope: "document",
                input: {},
              } as any,
            }),
            context: {
              documentId,
              documentType,
              scope: "header",
              branch,
              resultingState,
            },
          },
        ]);

        const result = await db
          .selectFrom("SlugMapping")
          .selectAll()
          .where("slug", "=", slug)
          .where("branch", "=", branch)
          .executeTakeFirst();

        expect(result).toBeUndefined();
      });

      it("should create slug mapping for document with slug", async () => {
        const documentId = generateId();
        const slug = "test-document-slug";
        const documentType = "powerhouse/document-model";
        const branch = "main";

        const headerState = {
          id: documentId,
          documentType,
          slug,
        };

        const resultingState = JSON.stringify({
          header: headerState,
          document: {},
        });

        await view.indexOperations([
          {
            operation: createTestOperation({
              index: 0,
              action: {
                type: "CREATE_DOCUMENT",
                scope: "document",
                input: {},
              } as any,
            }),
            context: {
              documentId,
              documentType,
              scope: "header",
              branch,
              resultingState,
            },
          },
        ]);

        const resolvedId = await view.resolveSlug(slug, branch);
        expect(resolvedId).toBe(documentId);
      });

      it("should handle multiple documents with different slugs", async () => {
        const doc1Id = generateId();
        const doc2Id = generateId();
        const slug1 = "document-one";
        const slug2 = "document-two";
        const documentType = "powerhouse/document-model";
        const branch = "main";

        const headerState1 = {
          id: doc1Id,
          documentType,
          slug: slug1,
        };

        const headerState2 = {
          id: doc2Id,
          documentType,
          slug: slug2,
        };

        await view.indexOperations([
          {
            operation: createTestOperation({
              index: 0,
              action: {
                type: "CREATE_DOCUMENT",
                scope: "document",
                input: {},
              } as any,
            }),
            context: {
              documentId: doc1Id,
              documentType,
              scope: "header",
              branch,
              resultingState: JSON.stringify({
                header: headerState1,
                document: {},
              }),
            },
          },
          {
            operation: createTestOperation({
              index: 0,
              action: {
                type: "CREATE_DOCUMENT",
                scope: "document",
                input: {},
              } as any,
            }),
            context: {
              documentId: doc2Id,
              documentType,
              scope: "header",
              branch,
              resultingState: JSON.stringify({
                header: headerState2,
                document: {},
              }),
            },
          },
        ]);

        const resolved1 = await view.resolveSlug(slug1, branch);
        expect(resolved1).toBe(doc1Id);

        const resolved2 = await view.resolveSlug(slug2, branch);
        expect(resolved2).toBe(doc2Id);
      });
    });
  });
});
