import { driveDocumentModelModule } from "document-drive";
import { deriveOperationId, generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IDocumentMetaCache } from "../../src/cache/document-meta-cache-types.js";
import { DocumentMetaCache } from "../../src/cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import { driveCollectionId } from "../../src/cache/operation-index-types.js";
import type { WriteCacheConfig } from "../../src/cache/write-cache-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import {
  createMockLogger,
  createTestEventBus,
  createTestOperationStore,
} from "../factories.js";

describe("SimpleJobExecutor Integration (Modern Storage)", () => {
  let executor: SimpleJobExecutor;
  let registry: IDocumentModelRegistry;
  let db: Kysely<DatabaseSchema>;
  let operationStore: IOperationStore;
  let keyframeStore: IKeyframeStore;
  let writeCache: KyselyWriteCache;
  let operationIndex: IOperationIndex;
  let documentMetaCache: IDocumentMetaCache;

  async function createDocumentWithCreateOperation(
    documentId: string,
    documentType: string,
    state: any,
  ): Promise<void> {
    const createActionId = generateId();
    const createOperation = {
      id: deriveOperationId(documentId, "document", "main", createActionId),
      index: 0,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      skip: 0,
      action: {
        id: createActionId,
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          documentId,
          model: documentType,
        },
      },
    };

    const upgradeActionId = generateId();
    const upgradeOperation = {
      id: deriveOperationId(documentId, "document", "main", upgradeActionId),
      index: 1,
      timestampUtcMs: new Date().toISOString(),
      hash: "",
      skip: 0,
      action: {
        id: upgradeActionId,
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          state,
        },
      },
    };

    await operationStore.apply(
      documentId,
      documentType,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(createOperation);
      },
    );

    await operationStore.apply(
      documentId,
      documentType,
      "document",
      "main",
      1,
      (txn) => {
        txn.addOperations(upgradeOperation);
      },
    );

    const indexTxn = operationIndex.start();
    indexTxn.write([
      {
        ...createOperation,
        documentId,
        documentType,
        branch: "main",
        scope: "document",
      },
      {
        ...upgradeOperation,
        documentId,
        documentType,
        branch: "main",
        scope: "document",
      },
    ]);

    if (documentType === "powerhouse/document-drive") {
      const collectionId = driveCollectionId("main", documentId);
      indexTxn.createCollection(collectionId);
      indexTxn.addToCollection(collectionId, documentId);
    }

    await operationIndex.commit(indexTxn);
  }

  beforeEach(async () => {
    registry = new DocumentModelRegistry();
    registry.registerModules(driveDocumentModelModule);

    const setup = await createTestOperationStore();
    db = setup.db;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

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

    operationIndex = new KyselyOperationIndex(db);

    documentMetaCache = new DocumentMetaCache(operationStore, {
      maxDocuments: 100,
    });
    await documentMetaCache.startup();

    const eventBus = createTestEventBus();
    executor = new SimpleJobExecutor(
      createMockLogger(),
      registry,
      operationStore,
      eventBus,
      writeCache,
      operationIndex,
      documentMetaCache,
      {},
    );
  });

  afterEach(async () => {
    await writeCache.shutdown();
    await documentMetaCache.shutdown();
    try {
      await db.destroy();
    } catch {
      //
    }
  });

  describe("Document Drive Operations", () => {
    it("should execute a job and persist the operation to IOperationStore", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const job: Job = {
        id: "job-1",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {
              id: "folder-1",
              name: "Test Folder",
              parentFolder: null,
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.operations).toBeDefined();
      expect(result.error).toBeUndefined();

      const operations = await operationStore.getSince(
        document.header.id,
        "global",
        "main",
        -1,
      );

      expect(operations.results).toHaveLength(1);

      const persistedOperation = operations.results[0];
      expect(persistedOperation.action.type).toBe("ADD_FOLDER");
      expect(persistedOperation.action.input).toMatchObject({
        id: "folder-1",
        name: "Test Folder",
        parentFolder: null,
      });

      const documentState = await writeCache.getState(
        document.header.id,
        "global",
        "main",
      );
      expect(documentState).toBeDefined();
      const globalState = (documentState as any).state.global;
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
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const job1: Job = {
        id: "job-1",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {
              id: "folder-1",
              name: "Parent Folder",
              parentFolder: null,
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result1 = await executor.executeJob(job1);
      expect(result1.success).toBe(true);

      const job2: Job = {
        id: "job-2",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-2",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: new Date(Date.now() + 1).toISOString(),
            input: {
              id: "folder-2",
              name: "Child Folder",
              parentFolder: "folder-1",
            },
          },
        ],
        operations: [],
        createdAt: new Date(Date.now() + 1).toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result2 = await executor.executeJob(job2);
      expect(result2.success).toBe(true);

      const operations = await operationStore.getSince(
        document.header.id,
        "global",
        "main",
        -1,
      );

      expect(operations.results).toHaveLength(2);

      const documentState = await writeCache.getState(
        document.header.id,
        "global",
        "main",
      );
      expect(documentState).toBeDefined();
      const globalState = (documentState as any).state.global;
      expect(globalState).toBeDefined();
      expect(globalState.nodes).toBeDefined();
      expect(globalState.nodes).toHaveLength(2);

      const parentFolder = globalState.nodes.find(
        (n: any) => n.id === "folder-1",
      );
      const childFolder = globalState.nodes.find(
        (n: any) => n.id === "folder-2",
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
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const folderJob: Job = {
        id: "job-folder",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-folder",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {
              id: "folder-1",
              name: "Documents",
              parentFolder: null,
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      await executor.executeJob(folderJob);

      const fileJob: Job = {
        id: "job-file",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-file",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: new Date(Date.now() + 1).toISOString(),
            input: {
              id: "file-1",
              name: "test.txt",
              documentType: "text/plain",
              parentFolder: "folder-1",
            },
          },
        ],
        operations: [],
        createdAt: new Date(Date.now() + 1).toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(fileJob);
      expect(result.success).toBe(true);

      const operations = await operationStore.getSince(
        document.header.id,
        "global",
        "main",
        -1,
      );

      expect(operations.results).toHaveLength(2);

      const documentState = await writeCache.getState(
        document.header.id,
        "global",
        "main",
      );
      expect(documentState).toBeDefined();
      const globalState = (documentState as any).state.global;
      expect(globalState).toBeDefined();
      expect(globalState.nodes).toBeDefined();
      expect(globalState.nodes).toHaveLength(2);

      const folder = globalState.nodes.find((n: any) => n.kind === "folder");
      const file = globalState.nodes.find((n: any) => n.kind === "file");
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

    it("should fail when trying to operate on non-existent document", async () => {
      const documentId = "non-existent-doc";

      const job: Job = {
        id: "job-non-existent",
        kind: "mutation",
        documentId,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {
              id: "folder-1",
              name: "Test Folder",
              parentFolder: null,
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("not found");
    });
  });

  describe("Deletion State Checking", () => {
    it("should reject operations on deleted documents when deletion happens after global scope cache (cross-scope staleness bug)", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      // Step 1: Execute a global scope operation (caches global scope state)
      const globalJob1: Job = {
        id: "global-job-1",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "global-action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {
              id: "folder-1",
              name: "Folder 1",
              parentFolder: null,
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result1 = await executor.executeJob(globalJob1);
      expect(result1.success).toBe(true);

      // Step 2: Bring in DELETE_DOCUMENT via load job (simulates sync from another node)
      // This is a realistic scenario where delete operation arrives through sync
      const deleteTimestamp = new Date().toISOString();
      const loadJob: Job = {
        id: "load-delete-job",
        kind: "load",
        documentId: document.header.id,
        scope: "document",
        branch: "main",
        actions: [],
        operations: [
          {
            id: "delete-op-sync",
            index: 2,
            timestampUtcMs: deleteTimestamp,
            hash: "",
            skip: 0,
            action: {
              id: "delete-action-sync",
              type: "DELETE_DOCUMENT",
              scope: "document",
              timestampUtcMs: deleteTimestamp,
              input: { documentId: document.header.id },
            },
          },
        ],
        createdAt: deleteTimestamp,
        queueHint: [],
        errorHistory: [],
      };

      const loadResult = await executor.executeJob(loadJob);
      expect(loadResult.success).toBe(true);

      // Step 3: Try another global scope operation
      // BUG: This should fail with DocumentDeletedError because document was deleted
      // But the executor checks document.state.document.isDeleted from the cached
      // global scope state, which is stale (doesn't know about the deletion)
      const postDeleteJob: Job = {
        id: "post-delete-job",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "post-delete-action",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: new Date(Date.now() + 100).toISOString(),
            input: {
              id: "folder-after-delete",
              name: "Should Not Be Created",
              parentFolder: null,
            },
          },
        ],
        operations: [],
        createdAt: new Date(Date.now() + 100).toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(postDeleteJob);

      // This assertion demonstrates the expected behavior after the fix
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.name).toBe("DocumentDeletedError");
      expect(result.error?.message).toContain(document.header.id);
      expect(result.error?.message).toContain("deleted");
    });

    it("should reject operations on deleted documents", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const deleteJob: Job = {
        id: "delete-job",
        kind: "mutation",
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
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const deleteResult = await executor.executeJob(deleteJob);
      expect(deleteResult.success).toBe(true);

      const job: Job = {
        id: "job-1",
        kind: "mutation",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {
              id: "folder-1",
              name: "Test Folder",
              parentFolder: null,
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.name).toBe("DocumentDeletedError");
      expect(result.error?.message).toContain(document.header.id);
      expect(result.error?.message).toContain("deleted");
    });

    it("should reject double-deletion attempts", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const deleteJob1: Job = {
        id: "delete-job-1",
        kind: "mutation",
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
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const deleteResult1 = await executor.executeJob(deleteJob1);
      expect(deleteResult1.success).toBe(true);

      const deleteJob2: Job = {
        id: "delete-job-2",
        kind: "mutation",
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
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(deleteJob2);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.name).toBe("DocumentDeletedError");
      expect(result.error?.message).toContain(document.header.id);
      expect(result.error?.message).toContain("deleted");
    });
  });

  describe("Operation Index Integration", () => {
    it("should write operations to the operation index when creating a document", async () => {
      const job: Job = {
        id: "job-create",
        kind: "mutation",
        documentId: "new-doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "create-action",
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: {
              documentId: "new-doc-1",
              model: "powerhouse/document-drive",
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);

      const collectionId = driveCollectionId("main", "new-doc-1");
      const indexedOps = await operationIndex.find(collectionId);

      expect(indexedOps.results).toHaveLength(1);
      expect(indexedOps.results[0].documentId).toBe("new-doc-1");
      expect(indexedOps.results[0].documentType).toBe(
        "powerhouse/document-drive",
      );
      expect(indexedOps.results[0].scope).toBe("document");
      expect(indexedOps.results[0].branch).toBe("main");
    });

    it("should create collection when creating a document-drive document", async () => {
      const driveId = "drive-collection-test";
      const job: Job = {
        id: "job-create-drive",
        kind: "mutation",
        documentId: driveId,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "create-drive-action",
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: {
              documentId: driveId,
              model: "powerhouse/document-drive",
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);

      const collectionId = driveCollectionId("main", driveId);
      const collectionOps = await operationIndex.find(collectionId);

      expect(collectionOps.results).toHaveLength(1);
      expect(collectionOps.results[0].documentId).toBe(driveId);
    });

    it("should add documents to collection when adding relationships", async () => {
      const driveDoc = driveDocumentModelModule.utils.createDocument();
      const driveId = driveDoc.header.id;
      const childDocId = "child-doc-1";

      await createDocumentWithCreateOperation(
        driveId,
        driveDoc.header.documentType,
        driveDoc.state,
      );

      const childDoc = driveDocumentModelModule.utils.createDocument();
      childDoc.header.id = childDocId;
      await createDocumentWithCreateOperation(
        childDocId,
        childDoc.header.documentType,
        childDoc.state,
      );

      const addRelJob: Job = {
        id: "job-add-relationship",
        kind: "mutation",
        documentId: driveId,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "add-rel-action",
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: {
              sourceId: driveId,
              targetId: childDocId,
              relationshipType: "child",
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const addRelResult = await executor.executeJob(addRelJob);
      expect(addRelResult.success).toBe(true);

      const collectionId = driveCollectionId("main", driveId);
      const collectionOps = await operationIndex.find(collectionId);

      const addRelOp = collectionOps.results.find(
        (op) =>
          op.documentId === driveId && op.action.type === "ADD_RELATIONSHIP",
      );
      expect(addRelOp).toBeDefined();
      expect(addRelOp?.documentId).toBe(driveId);
    });

    it("should write all operation types to the index", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentWithCreateOperation(
        document.header.id,
        document.header.documentType,
        document.state,
      );

      const job: Job = {
        id: "job-upgrade",
        kind: "mutation",
        documentId: document.header.id,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "upgrade-action",
            type: "UPGRADE_DOCUMENT",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: {
              documentId: document.header.id,
              state: { ...document.state },
            },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);

      const collectionId = driveCollectionId("main", document.header.id);
      const collectionOps = await operationIndex.find(collectionId);

      expect(collectionOps.results.length).toBeGreaterThan(0);
      const upgradeOps = collectionOps.results.filter(
        (op) => op.action.type === "UPGRADE_DOCUMENT",
      );
      expect(upgradeOps.length).toBeGreaterThan(0);
    });
  });
});
