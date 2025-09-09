import {
  MemoryStorage,
  driveDocumentModelModule,
  type DocumentDriveDocument,
  type FolderNode,
} from "document-drive";
import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive/storage/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";

describe("SimpleJobExecutor Integration", () => {
  let executor: SimpleJobExecutor;
  let registry: IDocumentModelRegistry;
  let storage: MemoryStorage;

  beforeEach(() => {
    // Use real storage that implements both IDocumentStorage and IDocumentOperationStorage
    storage = new MemoryStorage();

    // Setup registry with real document-drive model
    registry = new DocumentModelRegistry();
    registry.registerModules(driveDocumentModelModule);

    // Create executor with real storage
    executor = new SimpleJobExecutor(
      registry,
      storage as IDocumentStorage,
      storage as IDocumentOperationStorage,
    );
  });

  describe("Document Drive Operations", () => {
    it("should execute a job and persist the operation to storage", async () => {
      // Create a document-drive document
      const document = driveDocumentModelModule.utils.createDocument();
      await storage.create(document);

      // Create a job to add a folder
      const job: Job = {
        id: "job-1",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        operation: {
          action: {
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
          index: 0,
          timestampUtcMs: Date.now().toString(),
          hash: "test-hash",
          skip: 0,
        },
        createdAt: Date.now().toString(),
        queueHint: [],
      };

      // Execute the job
      const result = await executor.executeJob(job);

      // Verify job executed successfully
      expect(result.success).toBe(true);
      expect(result.operation).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify operation was persisted to storage
      const updatedDocument = await storage.get<DocumentDriveDocument>(
        document.header.id,
      );
      expect(updatedDocument.operations.global).toHaveLength(1);

      const persistedOperation = updatedDocument.operations.global[0];
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
      await storage.create(document);

      // Execute first job - add folder
      const job1: Job = {
        id: "job-1",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        operation: {
          action: {
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
          index: 0,
          timestampUtcMs: Date.now().toString(),
          hash: "hash-1",
          skip: 0,
        },
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
        operation: {
          action: {
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
          index: 1,
          timestampUtcMs: (Date.now() + 1).toString(),
          hash: "hash-2",
          skip: 0,
        },
        createdAt: (Date.now() + 1).toString(),
        queueHint: [],
      };

      const result2 = await executor.executeJob(job2);
      expect(result2.success).toBe(true);

      // Verify both operations were persisted
      const updatedDocument = await storage.get<DocumentDriveDocument>(
        document.header.id,
      );
      expect(updatedDocument.operations.global).toHaveLength(2);

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
      await storage.create(document);

      // First add a folder
      const folderJob: Job = {
        id: "job-folder",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        operation: {
          action: {
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
          index: 0,
          timestampUtcMs: Date.now().toString(),
          hash: "hash-folder",
          skip: 0,
        },
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
        operation: {
          action: {
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
          index: 1,
          timestampUtcMs: (Date.now() + 1).toString(),
          hash: "hash-file",
          skip: 0,
        },
        createdAt: (Date.now() + 1).toString(),
        queueHint: [],
      };

      const result = await executor.executeJob(fileJob);
      expect(result.success).toBe(true);

      // Verify operations were persisted
      const updatedDocument = await storage.get<DocumentDriveDocument>(
        document.header.id,
      );
      expect(updatedDocument.operations.global).toHaveLength(2);

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
      await storage.create(document);

      // Create a mock storage that fails on addDocumentOperations
      const fn = vi.fn().mockRejectedValue(new Error("Storage write failed"));
      storage.addDocumentOperations = fn;

      const executorWithFailingStorage = new SimpleJobExecutor(
        registry,
        storage as IDocumentStorage,
        storage as IDocumentOperationStorage,
      );

      // Create a valid job
      const job: Job = {
        id: "job-1",
        documentId: document.header.id,
        scope: "global",
        branch: "main",
        operation: {
          action: {
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
          index: 0,
          timestampUtcMs: Date.now().toString(),
          hash: "test-hash",
          skip: 0,
        },
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
      expect(unchangedDocument.operations.global).toHaveLength(0);
      const globalState = unchangedDocument.state.global;
      expect(globalState).toBeDefined();
      expect(globalState.nodes).toBeDefined();
      expect(globalState.nodes).toHaveLength(0);
    });
  });
});
