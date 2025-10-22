import type {
  DocumentDriveDocument,
  FolderNode,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import { MemoryStorage, driveDocumentModelModule } from "document-drive";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import { createTestEventBus, createTestOperationStore } from "../factories.js";

describe("SimpleJobExecutor Integration", () => {
  let executor: SimpleJobExecutor;
  let registry: IDocumentModelRegistry;
  let storage: MemoryStorage;
  let db: Kysely<DatabaseSchema>;
  let operationStore: IOperationStore;
  let keyframeStore: IKeyframeStore;
  let writeCache: KyselyWriteCache;

  async function createDocumentWithCreateOperation(
    document: DocumentDriveDocument,
  ): Promise<void> {
    const createOperation = {
      index: 0,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      skip: 0,
      action: {
        id: `${document.header.id}-create`,
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          documentId: document.header.id,
          model: document.header.documentType,
        },
      },
    };

    const upgradeOperation = {
      index: 1,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      skip: 0,
      action: {
        id: `${document.header.id}-upgrade`,
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          state: document.state,
        },
      },
    };

    // Write CREATE_DOCUMENT and UPGRADE_DOCUMENT operations to IOperationStore so write cache can find them
    await operationStore.apply(
      document.header.id,
      document.header.documentType,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(createOperation);
      },
    );

    await operationStore.apply(
      document.header.id,
      document.header.documentType,
      "document",
      "main",
      1,
      (txn) => {
        txn.addOperations(upgradeOperation);
      },
    );

    // Also write to legacy storage
    document.operations.document = [createOperation, upgradeOperation];
    await storage.create(document);
  }

  beforeEach(async () => {
    // Use real storage that implements both IDocumentStorage and IDocumentOperationStorage
    storage = new MemoryStorage();

    // Setup registry with real document-drive model
    registry = new DocumentModelRegistry();
    registry.registerModules(driveDocumentModelModule);

    // Create in-memory PGLite database for IOperationStore and IKeyframeStore
    const setup = await createTestOperationStore();
    db = setup.db;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

    // Create real write cache
    const config: WriteCacheConfig = {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };

    writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );

    await writeCache.startup();

    // Create executor with real storage, real operation store, and real write cache
    const eventBus = createTestEventBus();
    executor = new SimpleJobExecutor(
      registry,
      storage as IDocumentStorage,
      storage as IDocumentOperationStorage,
      operationStore,
      eventBus,
      writeCache,
    );
  });

  afterEach(async () => {
    await writeCache.shutdown();
    try {
      await db.destroy();
    } catch {
      //
    }
  });

  describe("Document Drive Operations", () => {
    it("should execute a job and persist the operation to storage", async () => {
      // Create a document-drive document
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(document);

      // Create a job to add a folder
      const job: Job = {
        id: "job-1",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-1",
              name: "Test Folder",
              parentFolder: null,
            },
          },
        ],
        createdAt: Date.now().toString(),
        queueHint: [],
      };

      // Execute the job
      const result = await executor.executeJob(job);

      // Verify job executed successfully
      expect(result.success).toBe(true);
      expect(result.operations).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify operation was persisted to storage
      const updatedDocument = await storage.get<DocumentDriveDocument>(
        document.header.id,
      );
      expect(updatedDocument.operations.global!).toHaveLength(1);

      const persistedOperation = updatedDocument.operations.global![0];
      expect(persistedOperation.action.type).toBe("ADD_FOLDER");
      expect(persistedOperation.action.input).toMatchObject({
        id: "folder-1",
        name: "Test Folder",
        parentFolder: null,
      });

      // Verify document state reflects the change
      // The state structure uses 'nodes' array for both files and folders
      const globalState = updatedDocument.state.global;
      expect(globalState).toBeDefined();
      expect(globalState.nodes).toBeDefined();
      expect(globalState.nodes).toHaveLength(1);
      expect(globalState.nodes[0]).toMatchObject({
        id: "folder-1",
        name: "Test Folder",
        parentFolder: null,
        kind: "folder",
      });
    });

    it("should handle multiple sequential operations", async () => {
      // Create a document
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(document);

      // Execute first job - add folder
      const job1: Job = {
        id: "job-1",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-1",
              name: "Parent Folder",
              parentFolder: null,
            },
          },
        ],
        createdAt: Date.now().toString(),
        queueHint: [],
      };

      const result1 = await executor.executeJob(job1);
      expect(result1.success).toBe(true);

      // Execute second job - add child folder
      const job2: Job = {
        id: "job-2",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-2",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: (Date.now() + 1).toString(),
            input: {
              id: "folder-2",
              name: "Child Folder",
              parentFolder: "folder-1",
            },
          },
        ],
        createdAt: (Date.now() + 1).toString(),
        queueHint: [],
      };

      const result2 = await executor.executeJob(job2);
      expect(result2.success).toBe(true);

      // Verify both operations were persisted
      const updatedDocument = await storage.get<DocumentDriveDocument>(
        document.header.id,
      );
      expect(updatedDocument.operations.global!).toHaveLength(2);

      // Verify state reflects both changes
      const globalState = updatedDocument.state.global;
      expect(globalState).toBeDefined();
      expect(globalState.nodes).toBeDefined();
      expect(globalState.nodes).toHaveLength(2);

      const parentFolder = globalState.nodes.find(
        (n: FolderNode) => n.id === "folder-1",
      );
      const childFolder = globalState.nodes.find(
        (n: FolderNode) => n.id === "folder-2",
      );

      expect(parentFolder).toBeDefined();
      expect(parentFolder?.name).toBe("Parent Folder");
      expect(parentFolder?.kind).toBe("folder");

      expect(childFolder).toBeDefined();
      expect(childFolder?.name).toBe("Child Folder");
      expect(childFolder?.parentFolder).toBe("folder-1");
      expect(childFolder?.kind).toBe("folder");
    });

    it("should handle file operations", async () => {
      // Create a document with a folder
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(document);

      // First add a folder
      const folderJob: Job = {
        id: "job-folder",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-folder",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-1",
              name: "Documents",
              parentFolder: null,
            },
          },
        ],
        createdAt: Date.now().toString(),
        queueHint: [],
      };

      await executor.executeJob(folderJob);

      // Then add a file to the folder
      const fileJob: Job = {
        id: "job-file",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-file",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: (Date.now() + 1).toString(),
            input: {
              id: "file-1",
              name: "test.txt",
              documentType: "text/plain",
              parentFolder: "folder-1",
            },
          },
        ],
        createdAt: (Date.now() + 1).toString(),
        queueHint: [],
      };

      const result = await executor.executeJob(fileJob);
      expect(result.success).toBe(true);

      // Verify operations were persisted
      const updatedDocument = await storage.get<DocumentDriveDocument>(
        document.header.id,
      );
      expect(updatedDocument.operations.global!).toHaveLength(2);

      // Verify state reflects the changes
      const globalState = updatedDocument.state.global;
      expect(globalState).toBeDefined();
      expect(globalState.nodes).toBeDefined();
      expect(globalState.nodes).toHaveLength(2); // 1 folder + 1 file

      const folder = globalState.nodes.find(
        (n: FolderNode) => n.kind === "folder",
      );
      const file = globalState.nodes.find((n) => n.kind === "file");
      expect(folder).toBeDefined();
      expect(folder?.id).toBe("folder-1");

      expect(file).toBeDefined();
      expect(file).toMatchObject({
        id: "file-1",
        name: "test.txt",
        documentType: "text/plain",
        parentFolder: "folder-1",
        kind: "file",
      });
    });

    it("should properly handle errors when operation storage fails", async () => {
      // Create a document
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(document);

      // Create a mock storage that fails on addDocumentOperations
      const fn = vi.fn().mockRejectedValue(new Error("Storage write failed"));
      storage.addDocumentOperations = fn;

      const eventBus = createTestEventBus();
      const executorWithFailingStorage = new SimpleJobExecutor(
        registry,
        storage as IDocumentStorage,
        storage as IDocumentOperationStorage,
        operationStore,
        eventBus,
        writeCache,
      );

      // Create a valid job
      const job: Job = {
        id: "job-1",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-1",
              name: "Test Folder",
              parentFolder: null,
            },
          },
        ],
        createdAt: Date.now().toString(),
        queueHint: [],
      };

      // Execute the job
      const result = await executorWithFailingStorage.executeJob(job);

      // Verify job failed with appropriate error
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe("Storage write failed");

      // Verify no operations were persisted
      const unchangedDocument = await storage.get<DocumentDriveDocument>(
        document.header.id,
      );
      expect(unchangedDocument.operations.global!).toHaveLength(0);
      const globalState = unchangedDocument.state.global;
      expect(globalState).toBeDefined();
      expect(globalState.nodes).toBeDefined();
      expect(globalState.nodes).toHaveLength(0);
    });

    it("should fail when trying to operate on non-existent document", async () => {
      // Don't create the document at all - no operations in IOperationStore
      const documentId = "non-existent-doc";

      // Try to add a folder to a document that doesn't exist
      const job: Job = {
        id: "job-non-existent",
        documentId,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-1",
              name: "Test Folder",
              parentFolder: null,
            },
          },
        ],
        createdAt: new Date().toISOString(),
        queueHint: [],
      };

      // Execute the job - should fail
      const result = await executor.executeJob(job);

      // Verify failure
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("no CREATE_DOCUMENT operation");
    });
  });

  describe("Deletion State Checking", () => {
    it.skip("should reject operations on deleted documents", async () => {
      // Create a document
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(document);

      // First, delete the document by executing a DELETE_DOCUMENT job
      const deleteJob: Job = {
        id: "delete-job",
        documentId: document.header.id,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "delete-action",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: { documentId: document.header.id },
          },
        ],
        createdAt: new Date().toISOString(),
        queueHint: [],
      };

      const deleteResult = await executor.executeJob(deleteJob);
      expect(deleteResult.success).toBe(true);

      // Now try to add a folder to the deleted document
      const job: Job = {
        id: "job-1",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-1",
              name: "Test Folder",
              parentFolder: null,
            },
          },
        ],
        createdAt: Date.now().toString(),
        queueHint: [],
      };

      // Execute the job
      const result = await executor.executeJob(job);

      // Verify job failed with DocumentDeletedError
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.name).toBe("DocumentDeletedError");
      expect(result.error?.message).toContain(document.header.id);
      expect(result.error?.message).toContain("deleted");
    });

    it.skip("should reject double-deletion attempts", async () => {
      // Create a document
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(document);

      // First, delete the document
      const deleteJob1: Job = {
        id: "delete-job-1",
        documentId: document.header.id,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "delete-action-1",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: { documentId: document.header.id },
          },
        ],
        createdAt: new Date().toISOString(),
        queueHint: [],
      };

      const deleteResult1 = await executor.executeJob(deleteJob1);
      expect(deleteResult1.success).toBe(true);

      // Try to delete the already-deleted document
      const deleteJob2: Job = {
        id: "delete-job-2",
        documentId: document.header.id,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "delete-action-2",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: { documentId: document.header.id },
          },
        ],
        createdAt: new Date().toISOString(),
        queueHint: [],
      };

      // Execute the job
      const result = await executor.executeJob(deleteJob2);

      // Verify job failed with DocumentDeletedError
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.name).toBe("DocumentDeletedError");
      expect(result.error?.message).toContain(document.header.id);
      expect(result.error?.message).toContain("deleted");
    });
  });
});
