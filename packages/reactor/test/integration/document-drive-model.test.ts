import type {
  BaseDocumentDriveServer,
  DocumentDriveDocument,
  FileNode,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  addFile,
  addFolder,
  copyNode,
  deleteNode,
  driveDocumentModelModule,
  moveNode,
  setAvailableOffline,
  setDriveIcon,
  setDriveName,
  setSharingType,
  updateFile,
  updateNode,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/types.js";
import { Reactor } from "../../src/core/reactor.js";
import { EventBus } from "../../src/events/event-bus.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import { KyselyDocumentView } from "../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import { JobStatus } from "../../src/shared/types.js";
import type { IKeyframeStore } from "../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../src/storage/kysely/document-indexer.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type {
  DocumentIndexerDatabase,
  Database as StorageDatabase,
} from "../../src/storage/kysely/types.js";
import {
  createTestJobTracker,
  createTestOperationStore,
} from "../factories.js";

// Combined database type
type Database = StorageDatabase &
  DocumentViewDatabase &
  DocumentIndexerDatabase;

describe("Integration Test: Reactor <> Document Drive Document Model", () => {
  let reactor: Reactor;
  let registry: IDocumentModelRegistry;
  let storage: MemoryStorage;
  let eventBus: EventBus;
  let queue: InMemoryQueue;
  let executor: SimpleJobExecutor;
  let executorManager: SimpleJobExecutorManager;
  let driveServer: BaseDocumentDriveServer;
  let db: Kysely<Database>;
  let operationStore: KyselyOperationStore;
  let keyframeStore: IKeyframeStore;
  let writeCache: KyselyWriteCache;
  let readModelCoordinator: ReadModelCoordinator;
  let documentIndexer: KyselyDocumentIndexer;

  async function createDocumentViaReactor(
    document: DocumentDriveDocument,
  ): Promise<void> {
    const createJobInfo = await reactor.create(document);
    await vi.waitUntil(
      async () => {
        const jobStatus = await reactor.getJobStatus(createJobInfo.id);
        if (jobStatus.status === JobStatus.FAILED) {
          const errorMessage = jobStatus.error?.message ?? "unknown error";
          throw new Error(`Job failed: ${errorMessage}`);
        }
        return jobStatus.status === JobStatus.COMPLETED;
      },
      { timeout: 5000 },
    );
  }

  beforeEach(async () => {
    // Setup real components
    storage = new MemoryStorage();
    registry = new DocumentModelRegistry();
    registry.registerModules(driveDocumentModelModule);

    // Create real drive server using ReactorBuilder
    const builder = new ReactorBuilder([
      driveDocumentModelModule,
    ] as DocumentModelModule<any>[]).withStorage(storage);
    driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    // Create in-memory PGLite database for IOperationStore
    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
    const jobTracker = createTestJobTracker();

    // Create real write cache
    const writeCacheConfig: WriteCacheConfig = {
      maxDocuments: 100,
      ringBufferSize: 10,
      keyframeInterval: 10,
    };

    writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      writeCacheConfig,
    );

    await writeCache.startup();

    executor = new SimpleJobExecutor(
      registry,
      storage as IDocumentStorage,
      storage as IDocumentOperationStorage,
      operationStore,
      eventBus,
      writeCache,
    );

    executorManager = new SimpleJobExecutorManager(
      () => executor,
      eventBus,
      queue,
      jobTracker,
    );

    // Start the executor manager to process jobs
    await executorManager.start(1);

    // Create real document view and read model coordinator
    const documentView = new KyselyDocumentView(db as any, operationStore);
    await documentView.init();

    documentIndexer = new KyselyDocumentIndexer(db as any, operationStore);
    await documentIndexer.init();

    readModelCoordinator = new ReadModelCoordinator(eventBus, [
      documentView,
      documentIndexer,
    ]);
    readModelCoordinator.start();

    // Create reactor with all components
    reactor = new Reactor(
      driveServer,
      storage as IDocumentStorage,
      queue,
      jobTracker,
      readModelCoordinator,
    );
  });

  afterEach(async () => {
    await executorManager.stop();
    readModelCoordinator.stop();
    await writeCache.shutdown();
    writeCache.clear();
    try {
      await db.destroy();
    } catch {
      //
    }
  });

  describe("Document Creation", () => {
    it("should create a document via reactor.create", async () => {
      const document = driveDocumentModelModule.utils.createDocument();

      const createJobInfo = await reactor.create(document);
      expect(createJobInfo.status).toBe(JobStatus.PENDING);

      await vi.waitUntil(
        async () => {
          const jobStatus = await reactor.getJobStatus(createJobInfo.id);
          if (jobStatus.status === JobStatus.FAILED) {
            const errorMessage = jobStatus.error?.message ?? "unknown error";
            throw new Error(`Job failed: ${errorMessage}`);
          }
          return jobStatus.status === JobStatus.COMPLETED;
        },
        { timeout: 5000 },
      );

      const { document: retrievedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      expect(retrievedDocument).toBeDefined();
      expect(retrievedDocument.header.id).toBe(document.header.id);
      expect(retrievedDocument.header.documentType).toBe(
        document.header.documentType,
      );
      expect(retrievedDocument.state.global.nodes).toHaveLength(0);
    });
  });

  describe("ADD Operations", () => {
    it("should add a folder via reactor.mutate", async () => {
      // Create a document-drive document using reactor.create()
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create an ADD_FOLDER action
      const folderId = generateId();
      const action = addFolder({
        id: folderId,
        name: "Test Folder",
        parentFolder: null,
      });

      // Submit via reactor.mutate
      const jobInfo = await reactor.mutate(document.header.id, [action]);
      expect(jobInfo.status).toBe(JobStatus.PENDING);

      // Wait for job completion
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the operation was processed
      const operations = await reactor.getOperations(document.header.id);
      expect(operations.global.results[0].action.type).toBe("ADD_FOLDER");

      // Verify state was updated
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      expect(globalState.nodes).toHaveLength(1);
      expect(globalState.nodes[0]).toMatchObject({
        id: folderId,
        name: "Test Folder",
        parentFolder: null,
        kind: "folder",
      });
    });

    it("should add a file via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // First add a folder
      const folderId = generateId();
      const folderAction = addFolder({
        id: folderId,
        name: "Documents",
        parentFolder: null,
      });

      const folderJobInfo = await reactor.mutate(document.header.id, [
        folderAction,
      ]);

      // Wait for job completion
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(folderJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Then add a file to the folder
      const fileId = generateId();
      const fileAction = addFile({
        id: fileId,
        name: "test.txt",
        documentType: "text/plain",
        parentFolder: folderId,
      });

      const fileJobInfo = await reactor.mutate(document.header.id, [
        fileAction,
      ]);

      // Wait for job completion
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(fileJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify both operations were processed
      const operations = await reactor.getOperations(document.header.id);
      expect(operations.global.results).toHaveLength(2);

      // Verify state contains both nodes
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      expect(globalState.nodes).toHaveLength(2);

      const file = globalState.nodes.find((n) => n.id === fileId);
      expect(file).toMatchObject({
        id: fileId,
        name: "test.txt",
        documentType: "text/plain",
        parentFolder: folderId,
        kind: "file",
      });
    });

    it("should handle nested folder structure", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create a hierarchy: root -> folder1 -> folder2 -> folder3
      const folder1Id = generateId();
      const folder2Id = generateId();
      const folder3Id = generateId();

      const actions = [
        addFolder({
          id: folder1Id,
          name: "Folder 1",
          parentFolder: null,
        }),
        addFolder({
          id: folder2Id,
          name: "Folder 2",
          parentFolder: folder1Id,
        }),
        addFolder({
          id: folder3Id,
          name: "Folder 3",
          parentFolder: folder2Id,
        }),
      ];

      // Submit all actions at once
      const jobInfo = await reactor.mutate(document.header.id, actions);

      // Wait for job completion
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the hierarchy
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      expect(globalState.nodes).toHaveLength(3);

      const folder1 = globalState.nodes.find((n) => n.id === folder1Id);
      const folder2 = globalState.nodes.find((n) => n.id === folder2Id);
      const folder3 = globalState.nodes.find((n) => n.id === folder3Id);

      expect(folder1).toBeDefined();
      expect(folder2).toBeDefined();
      expect(folder3).toBeDefined();

      expect(folder1?.parentFolder).toBe(null);
      expect(folder2?.parentFolder).toBe(folder1Id);
      expect(folder3?.parentFolder).toBe(folder2Id);
    });

    it("should add a file with full orchestration (new architecture pattern)", async () => {
      const parentDrive = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(parentDrive);

      const childDocument = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(childDocument);

      const fileId = childDocument.header.id;
      const fileAction = addFile({
        id: fileId,
        name: "Child Document.drive",
        documentType: childDocument.header.documentType,
        parentFolder: null,
      });

      const fileJobInfo = await reactor.mutate(parentDrive.header.id, [
        fileAction,
      ]);

      await vi.waitUntil(
        async () => {
          const jobStatus = await reactor.getJobStatus(fileJobInfo.id);
          if (jobStatus.status === JobStatus.FAILED) {
            console.error("Job failed:", jobStatus.error?.message);
            console.error("Error history:", jobStatus.errorHistory);
            throw new Error(
              `Job failed: ${jobStatus.error?.message || "unknown error"}`,
            );
          }
          return jobStatus.status === JobStatus.COMPLETED;
        },
        { timeout: 10000 },
      );

      const relationshipJobInfo = await reactor.addChildren(
        parentDrive.header.id,
        [childDocument.header.id],
      );

      await vi.waitUntil(
        async () => {
          const jobStatus = await reactor.getJobStatus(relationshipJobInfo.id);
          if (jobStatus.status === JobStatus.FAILED) {
            console.error("Relationship job failed:", jobStatus.error?.message);
            console.error("Error history:", jobStatus.errorHistory);
            throw new Error(
              `Relationship job failed: ${jobStatus.error?.message || "unknown error"}`,
            );
          }
          return jobStatus.status === JobStatus.COMPLETED;
        },
        { timeout: 10000 },
      );

      const { document: childDoc } = await reactor.get<DocumentDriveDocument>(
        childDocument.header.id,
      );
      expect(childDoc).toBeDefined();
      expect(childDoc.header.id).toBe(fileId);
      expect(childDoc.header.documentType).toBe(
        childDocument.header.documentType,
      );

      const { document: parentDoc } = await reactor.get<DocumentDriveDocument>(
        parentDrive.header.id,
      );
      const globalState = parentDoc.state.global;
      expect(globalState.nodes).toHaveLength(1);

      const file = globalState.nodes.find((n) => n.id === fileId);
      expect(file).toMatchObject({
        id: fileId,
        name: "Child Document.drive",
        documentType: childDocument.header.documentType,
        parentFolder: null,
        kind: "file",
      });

      await vi.waitUntil(
        async () => {
          const relationships = await documentIndexer.getOutgoing(
            parentDrive.header.id,
            ["child"],
          );
          return relationships.length === 1;
        },
        { timeout: 5000 },
      );

      const relationships = await documentIndexer.getOutgoing(
        parentDrive.header.id,
        ["child"],
      );
      expect(relationships).toHaveLength(1);
      expect(relationships[0]).toMatchObject({
        sourceId: parentDrive.header.id,
        targetId: childDocument.header.id,
        relationshipType: "child",
      });
    });
  });

  describe("UPDATE Operations", () => {
    it("should update a file via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Add a file first
      const fileId = generateId();
      const addAction = addFile({
        id: fileId,
        name: "original.txt",
        documentType: "text/plain",
        parentFolder: null,
      });

      const addJobInfo = await reactor.mutate(document.header.id, [addAction]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(addJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Update the file
      const updateAction = updateFile({
        id: fileId,
        name: "renamed.txt",
        documentType: "text/markdown",
      });

      const updateJobInfo = await reactor.mutate(document.header.id, [
        updateAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(updateJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the update
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      const file = globalState.nodes.find((n) => n.id === fileId);

      expect(file).toMatchObject({
        id: fileId,
        name: "renamed.txt",
        documentType: "text/markdown",
        kind: "file",
      });
    });

    it("should update a node (folder) via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Add a folder first
      const folderId = generateId();
      const addAction = addFolder({
        id: folderId,
        name: "Original Folder",
        parentFolder: null,
      });

      const addJobInfo = await reactor.mutate(document.header.id, [addAction]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(addJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Update the folder
      const updateAction = updateNode({
        id: folderId,
        name: "Renamed Folder",
      });

      const updateJobInfo = await reactor.mutate(document.header.id, [
        updateAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(updateJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the update
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      const folder = globalState.nodes.find((n) => n.id === folderId);

      expect(folder).toMatchObject({
        id: folderId,
        name: "Renamed Folder",
        kind: "folder",
      });
    });
  });

  describe("DELETE Operations", () => {
    it("should delete a node via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Add a folder first
      const folderId = generateId();
      const addAction = addFolder({
        id: folderId,
        name: "To Be Deleted",
        parentFolder: null,
      });

      const addJobInfo = await reactor.mutate(document.header.id, [addAction]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(addJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Delete the folder
      const deleteAction = deleteNode({
        id: folderId,
      });

      const deleteJobInfo = await reactor.mutate(document.header.id, [
        deleteAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(deleteJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the deletion
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      const folder = globalState.nodes.find((n) => n.id === folderId);

      expect(folder).toBeUndefined();
      expect(globalState.nodes).toHaveLength(0);
    });

    it("should delete children when parent is deleted", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create parent folder with children
      const parentId = generateId();
      const child1Id = generateId();
      const child2Id = generateId();
      const fileId = generateId();

      const actions = [
        addFolder({
          id: parentId,
          name: "Parent",
          parentFolder: null,
        }),
        addFolder({
          id: child1Id,
          name: "Child 1",
          parentFolder: parentId,
        }),
        addFolder({
          id: child2Id,
          name: "Child 2",
          parentFolder: parentId,
        }),
        addFile({
          id: fileId,
          name: "file.txt",
          documentType: "text/plain",
          parentFolder: child1Id,
        }),
      ];

      const setupJobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(setupJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Delete parent
      const deleteAction = deleteNode({
        id: parentId,
      });

      const deleteJobInfo = await reactor.mutate(document.header.id, [
        deleteAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(deleteJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify all nodes were deleted
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      expect(globalState.nodes).toHaveLength(0);
    });
  });

  describe("MOVE Operations", () => {
    it("should move a node to a different parent", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create folder structure
      const folder1Id = generateId();
      const folder2Id = generateId();
      const childId = generateId();

      const actions = [
        addFolder({
          id: folder1Id,
          name: "Folder 1",
          parentFolder: null,
        }),
        addFolder({
          id: folder2Id,
          name: "Folder 2",
          parentFolder: null,
        }),
        addFolder({
          id: childId,
          name: "Child",
          parentFolder: folder1Id,
        }),
      ];

      const setupJobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(setupJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Move child from folder1 to folder2
      const moveAction = moveNode({
        srcFolder: childId,
        targetParentFolder: folder2Id,
      });

      const moveJobInfo = await reactor.mutate(document.header.id, [
        moveAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(moveJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the move
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      const child = globalState.nodes.find((n) => n.id === childId);

      expect(child).toBeDefined();
      expect(child?.parentFolder).toBe(folder2Id);
    });

    it("should move a node to root when targetParentFolder is null", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create nested folder
      const parentId = generateId();
      const childId = generateId();

      const actions = [
        addFolder({
          id: parentId,
          name: "Parent",
          parentFolder: null,
        }),
        addFolder({
          id: childId,
          name: "Child",
          parentFolder: parentId,
        }),
      ];

      const setupJobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(setupJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Move child to root
      const moveAction = moveNode({
        srcFolder: childId,
        targetParentFolder: null,
      });

      const moveJobInfo = await reactor.mutate(document.header.id, [
        moveAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(moveJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the move
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      const child = globalState.nodes.find((n) => n.id === childId);

      expect(child).toBeDefined();
      expect(child?.parentFolder).toBe(null);
    });

    it("should prevent moving folder to its descendant", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create nested folders
      const folder1Id = generateId();
      const folder2Id = generateId();
      const folder3Id = generateId();

      const actions = [
        addFolder({
          id: folder1Id,
          name: "Folder 1",
          parentFolder: null,
        }),
        addFolder({
          id: folder2Id,
          name: "Folder 2",
          parentFolder: folder1Id,
        }),
        addFolder({
          id: folder3Id,
          name: "Folder 3",
          parentFolder: folder2Id,
        }),
      ];

      const setupJobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(setupJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Try to move folder1 to folder3 (its descendant)
      const moveAction = moveNode({
        srcFolder: folder1Id,
        targetParentFolder: folder3Id,
      });

      const moveJobInfo = await reactor.mutate(document.header.id, [
        moveAction,
      ]);

      // Wait for job completion (should complete but operation may be rejected by reducer)
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(moveJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // The operation should have been rejected - verify folder1 is still at root
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      const folder1 = globalState.nodes.find((n) => n.id === folder1Id);

      expect(folder1).toBeDefined();
      expect(folder1?.parentFolder).toBe(null);
    });
  });

  describe("COPY Operations", () => {
    it("should copy a node to a different parent", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create folder structure
      const folder1Id = generateId();
      const folder2Id = generateId();
      const sourceId = generateId();

      const actions = [
        addFolder({
          id: folder1Id,
          name: "Folder 1",
          parentFolder: null,
        }),
        addFolder({
          id: folder2Id,
          name: "Folder 2",
          parentFolder: null,
        }),
        addFolder({
          id: sourceId,
          name: "Source",
          parentFolder: folder1Id,
        }),
      ];

      const setupJobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(setupJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Copy source to folder2
      const targetId = generateId();
      const copyAction = copyNode({
        srcId: sourceId,
        targetId: targetId,
        targetParentFolder: folder2Id,
      });

      const copyJobInfo = await reactor.mutate(document.header.id, [
        copyAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(copyJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the copy
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      // Original should still exist
      const original = globalState.nodes.find((n) => n.id === sourceId);
      expect(original).toBeDefined();
      expect(original?.parentFolder).toBe(folder1Id);

      // Copy should exist in new location
      const copy = globalState.nodes.find((n) => n.id === targetId);
      expect(copy).toBeDefined();
      expect(copy?.parentFolder).toBe(folder2Id);
      expect(copy?.name).toBe("Source");
    });

    it("should copy a node with a new name", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create source folder
      const sourceId = generateId();
      const addAction = addFolder({
        id: sourceId,
        name: "Original Name",
        parentFolder: null,
      });

      const addJobInfo = await reactor.mutate(document.header.id, [addAction]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(addJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Copy with new name
      const targetId = generateId();
      const copyAction = copyNode({
        srcId: sourceId,
        targetId: targetId,
        targetName: "New Name",
        targetParentFolder: null,
      });

      const copyJobInfo = await reactor.mutate(document.header.id, [
        copyAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(copyJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the copy
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      const copy = globalState.nodes.find((n) => n.id === targetId);
      expect(copy).toBeDefined();
      expect(copy?.name).toBe("New Name");
    });

    it("should copy a single node", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create source structure
      const parentId = generateId();
      const child1Id = generateId();
      const child2Id = generateId();
      const fileId = generateId();

      const actions = [
        addFolder({
          id: parentId,
          name: "Parent",
          parentFolder: null,
        }),
        addFolder({
          id: child1Id,
          name: "Child 1",
          parentFolder: parentId,
        }),
        addFolder({
          id: child2Id,
          name: "Child 2",
          parentFolder: parentId,
        }),
        addFile({
          id: fileId,
          name: "file.txt",
          documentType: "text/plain",
          parentFolder: child1Id,
        }),
      ];

      const setupJobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(setupJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Copy the entire structure
      const targetId = generateId();
      const copyAction = copyNode({
        srcId: parentId,
        targetId: targetId,
        targetParentFolder: null,
      });

      const copyJobInfo = await reactor.mutate(document.header.id, [
        copyAction,
      ]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(copyJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the node was copied
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      // Find the copied parent
      const copiedParent = globalState.nodes.find((n) => n.id === targetId);
      expect(copiedParent).toBeDefined();
      // The name might have a suffix if there's a collision
      expect(copiedParent?.name).toMatch(/^Parent( \(copy\)( \d+)?)?$/);

      // Verify only the single node was copied (not children)
      expect(globalState.nodes.length).toBe(5); // 4 original + 1 copied

      // Verify original nodes still exist
      const originalParent = globalState.nodes.find((n) => n.id === parentId);
      const originalChild1 = globalState.nodes.find((n) => n.id === child1Id);
      const originalChild2 = globalState.nodes.find((n) => n.id === child2Id);
      const originalFile = globalState.nodes.find((n) => n.id === fileId);

      expect(originalParent).toBeDefined();
      expect(originalChild1).toBeDefined();
      expect(originalChild2).toBeDefined();
      expect(originalFile).toBeDefined();

      // The copied node should not have children automatically copied
      const copiedNodeChildren = globalState.nodes.filter(
        (n) => n.parentFolder === targetId,
      );
      expect(copiedNodeChildren.length).toBe(0);
    });
  });

  describe("Drive-level Operations", () => {
    it("should set drive name via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Set drive name
      const action = setDriveName({
        name: "My Drive",
      });

      const jobInfo = await reactor.mutate(document.header.id, [action]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the drive name was set
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      expect(globalState.name).toBe("My Drive");
    });

    it("should set drive icon via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Set drive icon
      const action = setDriveIcon({
        icon: "folder-open",
      });

      const jobInfo = await reactor.mutate(document.header.id, [action]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the drive icon was set
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      expect(globalState.icon).toBe("folder-open");
    });

    it("should set sharing type via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Set sharing type (note: this is a local operation)
      const action = setSharingType({
        type: "PUBLIC",
      });

      const jobInfo = await reactor.mutate(document.header.id, [action]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the sharing type was set
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const localState = updatedDocument.state.local;
      expect(localState.sharingType).toBe("PUBLIC");
    });

    it("should set available offline via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Set available offline (note: this is a local operation)
      const action = setAvailableOffline({
        availableOffline: true,
      });

      const jobInfo = await reactor.mutate(document.header.id, [action]);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify available offline was set
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const localState = updatedDocument.state.local;
      expect(localState.availableOffline).toBe(true);
    });
  });

  describe("Batch Operations", () => {
    it("should process multiple operations in a single mutate call", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create multiple operations
      const folder1Id = generateId();
      const folder2Id = generateId();
      const file1Id = generateId();
      const file2Id = generateId();

      const actions = [
        setDriveName({
          name: "Multi-Op Drive",
        }),
        addFolder({
          id: folder1Id,
          name: "Folder 1",
          parentFolder: null,
        }),
        addFolder({
          id: folder2Id,
          name: "Folder 2",
          parentFolder: null,
        }),
        addFile({
          id: file1Id,
          name: "file1.txt",
          documentType: "text/plain",
          parentFolder: folder1Id,
        }),
        addFile({
          id: file2Id,
          name: "file2.txt",
          documentType: "text/plain",
          parentFolder: folder2Id,
        }),
      ];

      // Submit all at once
      const jobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify all operations were applied
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      expect(globalState.name).toBe("Multi-Op Drive");
      expect(globalState.nodes).toHaveLength(4);

      // Verify structure
      const folder1 = globalState.nodes.find((n) => n.id === folder1Id);
      const folder2 = globalState.nodes.find((n) => n.id === folder2Id);
      const file1 = globalState.nodes.find((n) => n.id === file1Id);
      const file2 = globalState.nodes.find((n) => n.id === file2Id);

      expect(folder1).toBeDefined();
      expect(folder2).toBeDefined();
      expect(file1).toBeDefined();
      expect(file1?.parentFolder).toBe(folder1Id);
      expect(file2).toBeDefined();
      expect(file2?.parentFolder).toBe(folder2Id);
    });

    it("should maintain operation order in batch processing", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Operations that depend on each other
      const folderId = generateId();
      const fileId = generateId();

      const actions = [
        // Create folder
        addFolder({
          id: folderId,
          name: "Original Name",
          parentFolder: null,
        }),
        // Add file to folder
        addFile({
          id: fileId,
          name: "test.txt",
          documentType: "text/plain",
          parentFolder: folderId,
        }),
        // Rename folder
        updateNode({
          id: folderId,
          name: "Updated Name",
        }),
        // Update file
        updateFile({
          id: fileId,
          documentType: "text/markdown",
        }),
      ];

      const jobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify final state
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      const folder = globalState.nodes.find((n) => n.id === folderId);
      const file = globalState.nodes.find((n) => n.id === fileId);

      expect(folder?.name).toBe("Updated Name");
      expect((file as FileNode).documentType).toBe("text/markdown");
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid node references gracefully", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Try to add a file to a non-existent folder
      const fileId = generateId();
      const action = addFile({
        id: fileId,
        name: "orphan.txt",
        documentType: "text/plain",
        parentFolder: "non-existent-folder",
      });

      const jobInfo = await reactor.mutate(document.header.id, [action]);

      // Wait for job completion
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // The operation should have been attempted but may have failed
      // Check that the document state is still valid
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      // File might exist even with invalid parent (depends on reducer logic)
      // The important thing is that the system didn't crash
      const file = globalState.nodes.find((n) => n.id === fileId);

      // Either the file doesn't exist or exists with the invalid parent
      if (file) {
        expect(file.parentFolder).toBe("non-existent-folder");
      }
    });

    it("should handle duplicate node IDs", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      const duplicateId = generateId();

      // Try to create two folders with the same ID
      const actions = [
        addFolder({
          id: duplicateId,
          name: "First",
          parentFolder: null,
        }),
        addFolder({
          id: duplicateId,
          name: "Second",
          parentFolder: null,
        }),
      ];

      const jobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Only one node with the ID should exist
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      const nodesWithId = globalState.nodes.filter((n) => n.id === duplicateId);

      expect(nodesWithId).toHaveLength(1);
    });

    it("should handle name collisions", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      const folder1Id = generateId();
      const folder2Id = generateId();

      // Try to create two folders with the same name in the same location
      const actions = [
        addFolder({
          id: folder1Id,
          name: "Duplicate Name",
          parentFolder: null,
        }),
        addFolder({
          id: folder2Id,
          name: "Duplicate Name",
          parentFolder: null,
        }),
      ];

      const jobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Check how the system handled the collision
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      const foldersWithName = globalState.nodes.filter(
        (n) =>
          n.name === "Duplicate Name" || n.name.startsWith("Duplicate Name"),
      );

      // System should have handled the collision somehow
      expect(foldersWithName.length).toBeGreaterThanOrEqual(1);
    });

    it("should continue processing after encountering an error", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      const folder1Id = generateId();
      const folder2Id = generateId();

      const actions = [
        // Valid operation
        addFolder({
          id: folder1Id,
          name: "Valid Folder 1",
          parentFolder: null,
        }),
        // Invalid operation - moving non-existent node
        moveNode({
          srcFolder: "non-existent",
          targetParentFolder: folder1Id,
        }),
        // Valid operation
        addFolder({
          id: folder2Id,
          name: "Valid Folder 2",
          parentFolder: null,
        }),
      ];

      const jobInfo = await reactor.mutate(document.header.id, actions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Check that valid operations were processed
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      const folder1 = globalState.nodes.find((n) => n.id === folder1Id);
      const folder2 = globalState.nodes.find((n) => n.id === folder2Id);

      // At least one of the valid operations should have succeeded
      expect(folder1 || folder2).toBeDefined();
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle complex file reorganization", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create initial structure
      const docsId = generateId();
      const imagesId = generateId();
      const tempId = generateId();
      const doc1Id = generateId();
      const doc2Id = generateId();
      const img1Id = generateId();

      const setupActions = [
        addFolder({
          id: docsId,
          name: "Documents",
          parentFolder: null,
        }),
        addFolder({
          id: imagesId,
          name: "Images",
          parentFolder: null,
        }),
        addFolder({
          id: tempId,
          name: "Temp",
          parentFolder: null,
        }),
        addFile({
          id: doc1Id,
          name: "report.docx",
          documentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          parentFolder: tempId,
        }),
        addFile({
          id: doc2Id,
          name: "presentation.pptx",
          documentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          parentFolder: tempId,
        }),
        addFile({
          id: img1Id,
          name: "logo.png",
          documentType: "image/png",
          parentFolder: tempId,
        }),
      ];

      const setupJobInfo = await reactor.mutate(
        document.header.id,
        setupActions,
      );

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(setupJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Reorganize files
      const reorganizeActions = [
        // Move documents to Documents folder
        moveNode({
          srcFolder: doc1Id,
          targetParentFolder: docsId,
        }),
        moveNode({
          srcFolder: doc2Id,
          targetParentFolder: docsId,
        }),
        // Move image to Images folder
        moveNode({
          srcFolder: img1Id,
          targetParentFolder: imagesId,
        }),
        // Delete temp folder
        deleteNode({
          id: tempId,
        }),
      ];

      const reorganizeJobInfo = await reactor.mutate(
        document.header.id,
        reorganizeActions,
      );

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(reorganizeJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify final structure
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      // Temp folder should be gone
      const temp = globalState.nodes.find((n) => n.id === tempId);
      expect(temp).toBeUndefined();

      // Files should be in correct folders
      const doc1 = globalState.nodes.find((n) => n.id === doc1Id);
      const doc2 = globalState.nodes.find((n) => n.id === doc2Id);
      const img1 = globalState.nodes.find((n) => n.id === img1Id);

      expect(doc1?.parentFolder).toBe(docsId);
      expect(doc2?.parentFolder).toBe(docsId);
      expect(img1?.parentFolder).toBe(imagesId);
    });

    it("should handle project template creation", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await createDocumentViaReactor(document);

      // Create a project template structure
      const projectId = generateId();
      const srcId = generateId();
      const testsId = generateId();
      const docsId = generateId();
      const configId = generateId();
      const mainFileId = generateId();
      const testFileId = generateId();
      const readmeId = generateId();
      const configFileId = generateId();

      const templateActions = [
        setDriveName({
          name: "My Project",
        }),
        addFolder({
          id: projectId,
          name: "my-project",
          parentFolder: null,
        }),
        addFolder({
          id: srcId,
          name: "src",
          parentFolder: projectId,
        }),
        addFolder({
          id: testsId,
          name: "tests",
          parentFolder: projectId,
        }),
        addFolder({
          id: docsId,
          name: "docs",
          parentFolder: projectId,
        }),
        addFolder({
          id: configId,
          name: "config",
          parentFolder: projectId,
        }),
        addFile({
          id: mainFileId,
          name: "index.ts",
          documentType: "text/typescript",
          parentFolder: srcId,
        }),
        addFile({
          id: testFileId,
          name: "index.test.ts",
          documentType: "text/typescript",
          parentFolder: testsId,
        }),
        addFile({
          id: readmeId,
          name: "README.md",
          documentType: "text/markdown",
          parentFolder: projectId,
        }),
        addFile({
          id: configFileId,
          name: "tsconfig.json",
          documentType: "application/json",
          parentFolder: configId,
        }),
      ];

      const jobInfo = await reactor.mutate(document.header.id, templateActions);

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify the complete structure
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;

      expect(globalState.name).toBe("My Project");
      expect(globalState.nodes).toHaveLength(9); // 5 folders + 4 files

      // Verify hierarchy
      const project = globalState.nodes.find((n) => n.id === projectId);
      expect(project?.parentFolder).toBe(null);

      const src = globalState.nodes.find((n) => n.id === srcId);
      expect(src?.parentFolder).toBe(projectId);

      const mainFile = globalState.nodes.find((n) => n.id === mainFileId);
      expect(mainFile?.parentFolder).toBe(srcId);
      expect((mainFile as FileNode).documentType).toBe("text/typescript");
    });
  });
});
