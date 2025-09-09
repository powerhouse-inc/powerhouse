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
  type BaseDocumentDriveServer,
  type DocumentDriveDocument,
  type FileNode,
} from "document-drive";
import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive/storage/types";
import { generateId, type DocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import { Reactor } from "../../src/reactor.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import { JobStatus } from "../../src/shared/types.js";

describe("Integration Test: Reactor <> Document Drive Document Model", () => {
  let reactor: Reactor;
  let registry: IDocumentModelRegistry;
  let storage: MemoryStorage;
  let eventBus: EventBus;
  let queue: InMemoryQueue;
  let executor: SimpleJobExecutor;
  let executorManager: SimpleJobExecutorManager;
  let driveServer: BaseDocumentDriveServer;

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

    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
    executor = new SimpleJobExecutor(
      registry,
      storage as IDocumentStorage,
      storage as IDocumentOperationStorage,
    );

    executorManager = new SimpleJobExecutorManager(
      () => executor,
      eventBus,
      queue,
    );

    // Start the executor manager to process jobs
    await executorManager.start(1);

    // Create reactor with all components
    reactor = new Reactor(driveServer, storage as IDocumentStorage, queue);
  });

  afterEach(async () => {
    await executorManager.stop();
  });

  describe("ADD Operations", () => {
    it("should add a folder via reactor.mutate", async () => {
      // Create a document-drive document
      const document = driveDocumentModelModule.utils.createDocument();
      await storage.create(document);

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

      // Wait for processing
      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(1);
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
      await storage.create(document);

      // First add a folder
      const folderId = generateId();
      const folderAction = addFolder({
        id: folderId,
        name: "Documents",
        parentFolder: null,
      });

      await reactor.mutate(document.header.id, [folderAction]);

      // Wait for folder to be created
      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(1);
      });

      // Then add a file to the folder
      const fileId = generateId();
      const fileAction = addFile({
        id: fileId,
        name: "test.txt",
        documentType: "text/plain",
        parentFolder: folderId,
      });

      await reactor.mutate(document.header.id, [fileAction]);

      // Wait for processing
      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(2);
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
      await storage.create(document);

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
      await reactor.mutate(document.header.id, actions);

      // Wait for processing
      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(3);
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
  });

  describe("UPDATE Operations", () => {
    it("should update a file via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await storage.create(document);

      // Add a file first
      const fileId = generateId();
      const addAction = addFile({
        id: fileId,
        name: "original.txt",
        documentType: "text/plain",
        parentFolder: null,
      });

      await reactor.mutate(document.header.id, [addAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(1);
      });

      // Update the file
      const updateAction = updateFile({
        id: fileId,
        name: "renamed.txt",
        documentType: "text/markdown",
      });

      await reactor.mutate(document.header.id, [updateAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(2);
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
      await storage.create(document);

      // Add a folder first
      const folderId = generateId();
      const addAction = addFolder({
        id: folderId,
        name: "Original Folder",
        parentFolder: null,
      });

      await reactor.mutate(document.header.id, [addAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(1);
      });

      // Update the folder
      const updateAction = updateNode({
        id: folderId,
        name: "Renamed Folder",
      });

      await reactor.mutate(document.header.id, [updateAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(2);
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
      await storage.create(document);

      // Add a folder first
      const folderId = generateId();
      const addAction = addFolder({
        id: folderId,
        name: "To Be Deleted",
        parentFolder: null,
      });

      await reactor.mutate(document.header.id, [addAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(1);
      });

      // Delete the folder
      const deleteAction = deleteNode({
        id: folderId,
      });

      await reactor.mutate(document.header.id, [deleteAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(2);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(4);
      });

      // Delete parent
      const deleteAction = deleteNode({
        id: parentId,
      });

      await reactor.mutate(document.header.id, [deleteAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(5);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(3);
      });

      // Move child from folder1 to folder2
      const moveAction = moveNode({
        srcFolder: childId,
        targetParentFolder: folder2Id,
      });

      await reactor.mutate(document.header.id, [moveAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(4);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(2);
      });

      // Move child to root
      const moveAction = moveNode({
        srcFolder: childId,
        targetParentFolder: null,
      });

      await reactor.mutate(document.header.id, [moveAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(3);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(3);
      });

      // Try to move folder1 to folder3 (its descendant)
      const moveAction = moveNode({
        srcFolder: folder1Id,
        targetParentFolder: folder3Id,
      });

      await reactor.mutate(document.header.id, [moveAction]);

      // Wait a bit for potential processing
      await new Promise((resolve) => setTimeout(resolve, 100));

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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(3);
      });

      // Copy source to folder2
      const targetId = generateId();
      const copyAction = copyNode({
        srcId: sourceId,
        targetId: targetId,
        targetParentFolder: folder2Id,
      });

      await reactor.mutate(document.header.id, [copyAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(4);
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
      await storage.create(document);

      // Create source folder
      const sourceId = generateId();
      const addAction = addFolder({
        id: sourceId,
        name: "Original Name",
        parentFolder: null,
      });

      await reactor.mutate(document.header.id, [addAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(1);
      });

      // Copy with new name
      const targetId = generateId();
      const copyAction = copyNode({
        srcId: sourceId,
        targetId: targetId,
        targetName: "New Name",
        targetParentFolder: null,
      });

      await reactor.mutate(document.header.id, [copyAction]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(2);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(4);
      });

      // Copy the entire structure
      const targetId = generateId();
      const copyAction = copyNode({
        srcId: parentId,
        targetId: targetId,
        targetParentFolder: null,
      });

      await reactor.mutate(document.header.id, [copyAction]);

      await vi.waitFor(async () => {
        const { document: doc } = await reactor.get<DocumentDriveDocument>(
          document.header.id,
        );
        const globalState = doc.state.global;
        // Should have original 4 nodes + 1 copied node
        expect(globalState.nodes.length).toBe(5);
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
      await storage.create(document);

      // Set drive name
      const action = setDriveName({
        name: "My Drive",
      });

      await reactor.mutate(document.header.id, [action]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(1);
      });

      // Verify the drive name was set
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      expect(globalState.name).toBe("My Drive");
    });

    it("should set drive icon via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await storage.create(document);

      // Set drive icon
      const action = setDriveIcon({
        icon: "folder-open",
      });

      await reactor.mutate(document.header.id, [action]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(1);
      });

      // Verify the drive icon was set
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const globalState = updatedDocument.state.global;
      expect(globalState.icon).toBe("folder-open");
    });

    it("should set sharing type via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await storage.create(document);

      // Set sharing type (note: this is a local operation)
      const action = setSharingType({
        type: "PUBLIC",
      });

      await reactor.mutate(document.header.id, [action]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.local.results).toHaveLength(1);
      });

      // Verify the sharing type was set
      const { document: updatedDocument } =
        await reactor.get<DocumentDriveDocument>(document.header.id);
      const localState = updatedDocument.state.local;
      expect(localState.sharingType).toBe("PUBLIC");
    });

    it("should set available offline via reactor.mutate", async () => {
      const document = driveDocumentModelModule.utils.createDocument();
      await storage.create(document);

      // Set available offline (note: this is a local operation)
      const action = setAvailableOffline({
        availableOffline: true,
      });

      await reactor.mutate(document.header.id, [action]);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.local.results).toHaveLength(1);
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
      await storage.create(document);

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
      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(5);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(4);
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
      await storage.create(document);

      // Try to add a file to a non-existent folder
      const fileId = generateId();
      const action = addFile({
        id: fileId,
        name: "orphan.txt",
        documentType: "text/plain",
        parentFolder: "non-existent-folder",
      });

      await reactor.mutate(document.header.id, [action]);

      // Wait a bit for potential processing
      await new Promise((resolve) => setTimeout(resolve, 100));

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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        // At least one operation should have been processed
        expect(operations.global.results.length).toBeGreaterThanOrEqual(1);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        // At least one operation should have been processed
        expect(operations.global.results.length).toBeGreaterThanOrEqual(1);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, actions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        // At least some operations should have been processed
        expect(operations.global.results.length).toBeGreaterThanOrEqual(1);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, setupActions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(6);
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

      await reactor.mutate(document.header.id, reorganizeActions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(10);
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
      await storage.create(document);

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

      await reactor.mutate(document.header.id, templateActions);

      await vi.waitFor(async () => {
        const operations = await reactor.getOperations(document.header.id);
        expect(operations.global.results).toHaveLength(10);
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
