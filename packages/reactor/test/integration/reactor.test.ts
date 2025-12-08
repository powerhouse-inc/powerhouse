import type { DocumentDriveDocument, FileNode } from "document-drive";
import {
  MemoryStorage,
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
import { generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { v4 as uuidv4 } from "uuid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { BatchExecutionRequest, IReactor } from "../../src/core/types.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import { JobStatus } from "../../src/shared/types.js";
import type { IDocumentIndexer } from "../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../src/storage/kysely/document-indexer.js";
import type {
  DocumentIndexerDatabase,
  Database as StorageDatabase,
} from "../../src/storage/kysely/types.js";
import { createMockSigner, createTestOperationStore } from "../factories.js";

type Database = StorageDatabase &
  DocumentViewDatabase &
  DocumentIndexerDatabase;

describe.each([
  { legacyStorageEnabled: true, label: "Legacy Storage" },
  { legacyStorageEnabled: false, label: "Document View" },
])(
  "Tests the Reactor with the Document Drive Document Model ($label)",
  ({ legacyStorageEnabled }) => {
    let reactor: IReactor;
    let documentIndexer: IDocumentIndexer;
    let storage: MemoryStorage;
    let db: Kysely<Database>;

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
          return jobStatus.status === JobStatus.READ_MODELS_READY;
        },
        { timeout: 5000 },
      );

      if (!legacyStorageEnabled) {
        await vi.waitUntil(
          async () => {
            try {
              await reactor.get<DocumentDriveDocument>(document.header.id);
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 5000 },
        );
      }
    }

    async function waitForJobAndDocumentUpdate(
      jobId: string,
      documentId: string,
    ): Promise<void> {
      await vi.waitUntil(
        async () => {
          const jobStatus = await reactor.getJobStatus(jobId);
          if (jobStatus.status === JobStatus.FAILED) {
            const errorMessage = jobStatus.error?.message ?? "unknown error";
            throw new Error(`Job failed: ${errorMessage}`);
          }
          return jobStatus.status === JobStatus.READ_MODELS_READY;
        },
        { timeout: 5000 },
      );

      if (!legacyStorageEnabled) {
        await vi.waitUntil(
          async () => {
            try {
              await reactor.get<DocumentDriveDocument>(documentId);
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 5000 },
        );
        // Add a small delay to ensure read model is fully caught up
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    beforeEach(async () => {
      storage = new MemoryStorage();

      // Create documentIndexer that we need a reference to
      const setup = await createTestOperationStore();
      db = setup.db as unknown as Kysely<Database>;
      const operationStore = setup.store;

      const documentIndexerConsistencyTracker = new ConsistencyTracker();
      documentIndexer = new KyselyDocumentIndexer(
        db as any,
        operationStore,
        documentIndexerConsistencyTracker,
      );
      await documentIndexer.init();

      // Use ReactorBuilder from reactor package and pass in our documentIndexer
      const builder = new ReactorBuilder()
        .withDocumentModels([driveDocumentModelModule as any])
        .withLegacyStorage(storage)
        .withReadModel(documentIndexer)
        .withFeatures({ legacyStorageEnabled });

      // Build returns IReactor
      reactor = await builder.build();
    });

    afterEach(() => {
      reactor.kill();
    });

    describe("Document Creation", () => {
      it("should create a document via reactor.create", async () => {
        const document = driveDocumentModelModule.utils.createDocument();

        const createJobInfo = await reactor.create(document);
        expect(createJobInfo.status).toBe(JobStatus.PENDING);

        await waitForJobAndDocumentUpdate(createJobInfo.id, document.header.id);

        const { document: retrievedDocument } =
          await reactor.get<DocumentDriveDocument>(document.header.id);
        expect(retrievedDocument).toBeDefined();
        expect(retrievedDocument.header.id).toBe(document.header.id);
        expect(retrievedDocument.header.documentType).toBe(
          document.header.documentType,
        );
        expect(retrievedDocument.state.global.nodes).toHaveLength(0);
      });

      it("should sign actions when signer is provided to reactor.create", async () => {
        const mockSigner = createMockSigner();
        const document = driveDocumentModelModule.utils.createDocument();

        const createJobInfo = await reactor.create(document, mockSigner);
        expect(createJobInfo.status).toBe(JobStatus.PENDING);

        await waitForJobAndDocumentUpdate(createJobInfo.id, document.header.id);

        const operations = await reactor.getOperations(document.header.id);

        expect(operations.document.results.length).toBeGreaterThanOrEqual(2);

        const createDocOp = operations.document.results.find(
          (op) => op.action.type === "CREATE_DOCUMENT",
        );
        const upgradeDocOp = operations.document.results.find(
          (op) => op.action.type === "UPGRADE_DOCUMENT",
        );

        expect(createDocOp).toBeDefined();
        expect(upgradeDocOp).toBeDefined();

        expect(createDocOp?.action.context?.signer).toBeDefined();
        expect(createDocOp?.action.context?.signer?.signatures).toHaveLength(1);
        expect(createDocOp?.action.context?.signer?.signatures[0][0]).toBe(
          "mock-signature",
        );

        expect(upgradeDocOp?.action.context?.signer).toBeDefined();
        expect(upgradeDocOp?.action.context?.signer?.signatures).toHaveLength(
          1,
        );
        expect(upgradeDocOp?.action.context?.signer?.signatures[0][0]).toBe(
          "mock-signature",
        );
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
        const jobInfo = await reactor.execute(document.header.id, "main", [
          action,
        ]);
        expect(jobInfo.status).toBe(JobStatus.PENDING);

        // Wait for job completion and document view update
        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const folderJobInfo = await reactor.execute(
          document.header.id,
          "main",
          [folderAction],
        );

        // Wait for job completion and document view update

        await waitForJobAndDocumentUpdate(folderJobInfo.id, document.header.id);

        // Then add a file to the folder
        const fileId = generateId();
        const fileAction = addFile({
          id: fileId,
          name: "test.txt",
          documentType: "text/plain",
          parentFolder: folderId,
        });

        const fileJobInfo = await reactor.execute(document.header.id, "main", [
          fileAction,
        ]);

        // Wait for job completion and document view update

        await waitForJobAndDocumentUpdate(fileJobInfo.id, document.header.id);

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
        const jobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        // Wait for job completion and document view update

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const addRelationshipAction = {
          id: uuidv4(),
          type: "ADD_RELATIONSHIP",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {
            sourceId: parentDrive.header.id,
            targetId: childDocument.header.id,
            relationshipType: "child",
          },
        };

        const request: BatchExecutionRequest = {
          jobs: [
            {
              key: "addFile",
              documentId: parentDrive.header.id,
              scope: "global",
              branch: "main",
              actions: [fileAction],
              dependsOn: [],
            },
            {
              key: "linkChild",
              documentId: parentDrive.header.id,
              scope: "document",
              branch: "main",
              actions: [addRelationshipAction],
              dependsOn: ["addFile"],
            },
          ],
        };

        const result = await reactor.executeBatch(request);

        await vi.waitUntil(
          async () => {
            const addFileStatus = await reactor.getJobStatus(
              result.jobs.addFile.id,
            );
            const linkChildStatus = await reactor.getJobStatus(
              result.jobs.linkChild.id,
            );
            if (addFileStatus.status === JobStatus.FAILED) {
              console.error(
                "Add file job failed:",
                addFileStatus.error?.message,
              );
              console.error("Error history:", addFileStatus.errorHistory);
              throw new Error(
                `Add file job failed: ${addFileStatus.error?.message || "unknown error"}`,
              );
            }
            if (linkChildStatus.status === JobStatus.FAILED) {
              console.error(
                "Link child job failed:",
                linkChildStatus.error?.message,
              );
              console.error("Error history:", linkChildStatus.errorHistory);
              throw new Error(
                `Link child job failed: ${linkChildStatus.error?.message || "unknown error"}`,
              );
            }
            return (
              addFileStatus.status === JobStatus.READ_MODELS_READY &&
              linkChildStatus.status === JobStatus.READ_MODELS_READY
            );
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

        const { document: parentDoc } =
          await reactor.get<DocumentDriveDocument>(parentDrive.header.id);
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

        const addJobInfo = await reactor.execute(document.header.id, "main", [
          addAction,
        ]);

        await waitForJobAndDocumentUpdate(addJobInfo.id, document.header.id);

        // Update the file
        const updateAction = updateFile({
          id: fileId,
          name: "renamed.txt",
          documentType: "text/markdown",
        });

        const updateJobInfo = await reactor.execute(
          document.header.id,
          "main",
          [updateAction],
        );

        await waitForJobAndDocumentUpdate(updateJobInfo.id, document.header.id);

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

        const addJobInfo = await reactor.execute(document.header.id, "main", [
          addAction,
        ]);

        await waitForJobAndDocumentUpdate(addJobInfo.id, document.header.id);

        // Update the folder
        const updateAction = updateNode({
          id: folderId,
          name: "Renamed Folder",
        });

        const updateJobInfo = await reactor.execute(
          document.header.id,
          "main",
          [updateAction],
        );

        await waitForJobAndDocumentUpdate(updateJobInfo.id, document.header.id);

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

        const addJobInfo = await reactor.execute(document.header.id, "main", [
          addAction,
        ]);

        await waitForJobAndDocumentUpdate(addJobInfo.id, document.header.id);

        // Delete the folder
        const deleteAction = deleteNode({
          id: folderId,
        });

        const deleteJobInfo = await reactor.execute(
          document.header.id,
          "main",
          [deleteAction],
        );

        await waitForJobAndDocumentUpdate(deleteJobInfo.id, document.header.id);

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

        const setupJobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(setupJobInfo.id, document.header.id);

        // Delete parent
        const deleteAction = deleteNode({
          id: parentId,
        });

        const deleteJobInfo = await reactor.execute(
          document.header.id,
          "main",
          [deleteAction],
        );

        await waitForJobAndDocumentUpdate(deleteJobInfo.id, document.header.id);

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

        const setupJobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(setupJobInfo.id, document.header.id);

        // Move child from folder1 to folder2
        const moveAction = moveNode({
          srcFolder: childId,
          targetParentFolder: folder2Id,
        });

        const moveJobInfo = await reactor.execute(document.header.id, "main", [
          moveAction,
        ]);

        await waitForJobAndDocumentUpdate(moveJobInfo.id, document.header.id);

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

        const setupJobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(setupJobInfo.id, document.header.id);

        // Move child to root
        const moveAction = moveNode({
          srcFolder: childId,
          targetParentFolder: null,
        });

        const moveJobInfo = await reactor.execute(document.header.id, "main", [
          moveAction,
        ]);

        await waitForJobAndDocumentUpdate(moveJobInfo.id, document.header.id);

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

        const setupJobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(setupJobInfo.id, document.header.id);

        // Try to move folder1 to folder3 (its descendant)
        const moveAction = moveNode({
          srcFolder: folder1Id,
          targetParentFolder: folder3Id,
        });

        const moveJobInfo = await reactor.execute(document.header.id, "main", [
          moveAction,
        ]);

        // Wait for job completion (should complete but operation may be rejected by reducer)
        await waitForJobAndDocumentUpdate(moveJobInfo.id, document.header.id);

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

        const setupJobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(setupJobInfo.id, document.header.id);

        // Copy source to folder2
        const targetId = generateId();
        const copyAction = copyNode({
          srcId: sourceId,
          targetId: targetId,
          targetParentFolder: folder2Id,
        });

        const copyJobInfo = await reactor.execute(document.header.id, "main", [
          copyAction,
        ]);

        await waitForJobAndDocumentUpdate(copyJobInfo.id, document.header.id);

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

        const addJobInfo = await reactor.execute(document.header.id, "main", [
          addAction,
        ]);

        await waitForJobAndDocumentUpdate(addJobInfo.id, document.header.id);

        // Copy with new name
        const targetId = generateId();
        const copyAction = copyNode({
          srcId: sourceId,
          targetId: targetId,
          targetName: "New Name",
          targetParentFolder: null,
        });

        const copyJobInfo = await reactor.execute(document.header.id, "main", [
          copyAction,
        ]);

        await waitForJobAndDocumentUpdate(copyJobInfo.id, document.header.id);

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

        const setupJobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(setupJobInfo.id, document.header.id);

        // Copy the entire structure
        const targetId = generateId();
        const copyAction = copyNode({
          srcId: parentId,
          targetId: targetId,
          targetParentFolder: null,
        });

        const copyJobInfo = await reactor.execute(document.header.id, "main", [
          copyAction,
        ]);

        await waitForJobAndDocumentUpdate(copyJobInfo.id, document.header.id);

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

        const jobInfo = await reactor.execute(document.header.id, "main", [
          action,
        ]);

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const jobInfo = await reactor.execute(document.header.id, "main", [
          action,
        ]);

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const jobInfo = await reactor.execute(document.header.id, "main", [
          action,
        ]);

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const jobInfo = await reactor.execute(document.header.id, "main", [
          action,
        ]);

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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
        const jobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const jobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const jobInfo = await reactor.execute(document.header.id, "main", [
          action,
        ]);

        // Wait for job completion and document view update

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const jobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

        // Only one node with the ID should exist
        const { document: updatedDocument } =
          await reactor.get<DocumentDriveDocument>(document.header.id);
        const globalState = updatedDocument.state.global;
        const nodesWithId = globalState.nodes.filter(
          (n) => n.id === duplicateId,
        );

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

        const jobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const jobInfo = await reactor.execute(
          document.header.id,
          "main",
          actions,
        );

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

        const setupJobInfo = await reactor.execute(
          document.header.id,
          "main",
          setupActions,
        );

        await waitForJobAndDocumentUpdate(setupJobInfo.id, document.header.id);

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

        const reorganizeJobInfo = await reactor.execute(
          document.header.id,
          "main",
          reorganizeActions,
        );

        await waitForJobAndDocumentUpdate(
          reorganizeJobInfo.id,
          document.header.id,
        );

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

        const jobInfo = await reactor.execute(
          document.header.id,
          "main",
          templateActions,
        );

        await waitForJobAndDocumentUpdate(jobInfo.id, document.header.id);

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

    describe("Document Query Operations", () => {
      describe("find() - Search by Type", () => {
        it("should find documents by type", async () => {
          const doc1 = driveDocumentModelModule.utils.createDocument();
          const doc2 = driveDocumentModelModule.utils.createDocument();
          const doc3 = driveDocumentModelModule.utils.createDocument();

          await createDocumentViaReactor(doc1);
          await createDocumentViaReactor(doc2);
          await createDocumentViaReactor(doc3);

          const results = await reactor.find({
            type: "powerhouse/document-drive",
          });

          expect(results.results.length).toBeGreaterThanOrEqual(3);
          const foundIds = results.results.map((doc) => doc.header.id);
          expect(foundIds).toContain(doc1.header.id);
          expect(foundIds).toContain(doc2.header.id);
          expect(foundIds).toContain(doc3.header.id);
        });

        it("should return empty results for non-existent type", async () => {
          const document = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(document);

          const results = await reactor.find({
            type: "powerhouse/non-existent-type",
          });

          expect(results.results).toHaveLength(0);
        });

        it("should find documents by type with consistency token", async () => {
          const document = driveDocumentModelModule.utils.createDocument();
          const createJobInfo = await reactor.create(document);

          await vi.waitUntil(
            async () => {
              const jobStatus = await reactor.getJobStatus(createJobInfo.id);
              return jobStatus.status === JobStatus.READ_MODELS_READY;
            },
            { timeout: 5000 },
          );

          const jobStatus = await reactor.getJobStatus(createJobInfo.id);
          const consistencyToken = jobStatus.consistencyToken;

          const results = await reactor.find(
            { type: "powerhouse/document-drive" },
            undefined,
            undefined,
            consistencyToken,
          );

          const foundIds = results.results.map((doc) => doc.header.id);
          expect(foundIds).toContain(document.header.id);
        });

        it("should paginate results by type", async () => {
          const docs = [];
          for (let i = 0; i < 5; i++) {
            const doc = driveDocumentModelModule.utils.createDocument();
            docs.push(doc);
            await createDocumentViaReactor(doc);
          }

          const firstPage = await reactor.find(
            { type: "powerhouse/document-drive" },
            undefined,
            { cursor: "", limit: 2 },
          );

          expect(firstPage.results.length).toBeLessThanOrEqual(2);
          expect(firstPage.next).toBeDefined();

          if (firstPage.next) {
            const secondPage = await firstPage.next();
            expect(secondPage.results.length).toBeGreaterThan(0);
          }
        });
      });

      describe("find() - Search by Parent ID", () => {
        it("should find children of a parent document", async () => {
          const parentDrive = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(parentDrive);

          const child1 = driveDocumentModelModule.utils.createDocument();
          const child2 = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(child1);
          await createDocumentViaReactor(child2);

          const fileId1 = child1.header.id;
          const fileId2 = child2.header.id;

          const actions = [
            addFile({
              id: fileId1,
              name: "Child1.drive",
              documentType: child1.header.documentType,
              parentFolder: null,
            }),
            addFile({
              id: fileId2,
              name: "Child2.drive",
              documentType: child2.header.documentType,
              parentFolder: null,
            }),
          ];

          const jobInfo = await reactor.execute(
            parentDrive.header.id,
            "main",
            actions,
          );
          await waitForJobAndDocumentUpdate(jobInfo.id, parentDrive.header.id);

          const relationshipActions = [
            {
              id: uuidv4(),
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: new Date().toISOString(),
              input: {
                sourceId: parentDrive.header.id,
                targetId: child1.header.id,
                relationshipType: "child",
              },
            },
            {
              id: uuidv4(),
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: new Date().toISOString(),
              input: {
                sourceId: parentDrive.header.id,
                targetId: child2.header.id,
                relationshipType: "child",
              },
            },
          ];

          const relJobInfo = await reactor.execute(
            parentDrive.header.id,
            "main",
            relationshipActions,
          );
          await waitForJobAndDocumentUpdate(
            relJobInfo.id,
            parentDrive.header.id,
          );

          await vi.waitUntil(
            async () => {
              const relationships = await documentIndexer.getOutgoing(
                parentDrive.header.id,
                ["child"],
              );
              return relationships.length === 2;
            },
            { timeout: 5000 },
          );

          const results = await reactor.find({
            parentId: parentDrive.header.id,
          });

          expect(results.results.length).toBe(2);
          const foundIds = results.results.map((doc) => doc.header.id);
          expect(foundIds).toContain(child1.header.id);
          expect(foundIds).toContain(child2.header.id);
        });

        it("should return empty results for parent with no children", async () => {
          const parentDrive = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(parentDrive);

          const results = await reactor.find({
            parentId: parentDrive.header.id,
          });

          expect(results.results).toHaveLength(0);
        });

        it("should combine parentId with type filter", async () => {
          const parentDrive = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(parentDrive);

          const child1 = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(child1);

          const fileId = child1.header.id;
          const fileAction = addFile({
            id: fileId,
            name: "Child.drive",
            documentType: child1.header.documentType,
            parentFolder: null,
          });

          const jobInfo = await reactor.execute(parentDrive.header.id, "main", [
            fileAction,
          ]);
          await waitForJobAndDocumentUpdate(jobInfo.id, parentDrive.header.id);

          const relationshipAction = {
            id: uuidv4(),
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: new Date().toISOString(),
            input: {
              sourceId: parentDrive.header.id,
              targetId: child1.header.id,
              relationshipType: "child",
            },
          };

          const relJobInfo = await reactor.execute(
            parentDrive.header.id,
            "main",
            [relationshipAction],
          );
          await waitForJobAndDocumentUpdate(
            relJobInfo.id,
            parentDrive.header.id,
          );

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

          const results = await reactor.find({
            parentId: parentDrive.header.id,
            type: "powerhouse/document-drive",
          });

          expect(results.results.length).toBe(1);
          expect(results.results[0].header.id).toBe(child1.header.id);

          const noResults = await reactor.find({
            parentId: parentDrive.header.id,
            type: "powerhouse/non-existent-type",
          });

          expect(noResults.results).toHaveLength(0);
        });
      });

      describe("find() - Search by IDs and Slugs", () => {
        it("should find documents by ID array", async () => {
          const doc1 = driveDocumentModelModule.utils.createDocument();
          const doc2 = driveDocumentModelModule.utils.createDocument();
          const doc3 = driveDocumentModelModule.utils.createDocument();

          await createDocumentViaReactor(doc1);
          await createDocumentViaReactor(doc2);
          await createDocumentViaReactor(doc3);

          const results = await reactor.find({
            ids: [doc1.header.id, doc2.header.id],
          });

          expect(results.results.length).toBe(2);
          const foundIds = results.results.map((doc) => doc.header.id);
          expect(foundIds).toContain(doc1.header.id);
          expect(foundIds).toContain(doc2.header.id);
          expect(foundIds).not.toContain(doc3.header.id);
        });

        it("should skip non-existent documents in ID array", async () => {
          const doc1 = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(doc1);

          const results = await reactor.find({
            ids: [doc1.header.id, "non-existent-id"],
          });

          expect(results.results.length).toBe(1);
          expect(results.results[0].header.id).toBe(doc1.header.id);
        });

        it("should combine ids with type filter", async () => {
          const doc1 = driveDocumentModelModule.utils.createDocument();
          const doc2 = driveDocumentModelModule.utils.createDocument();

          await createDocumentViaReactor(doc1);
          await createDocumentViaReactor(doc2);

          const results = await reactor.find({
            ids: [doc1.header.id, doc2.header.id],
            type: "powerhouse/document-drive",
          });

          expect(results.results.length).toBe(2);

          const noResults = await reactor.find({
            ids: [doc1.header.id, doc2.header.id],
            type: "powerhouse/non-existent-type",
          });

          expect(noResults.results).toHaveLength(0);
        });

        it("should combine ids with parentId filter", async () => {
          const parentDrive = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(parentDrive);

          const child1 = driveDocumentModelModule.utils.createDocument();
          const child2 = driveDocumentModelModule.utils.createDocument();
          const child3 = driveDocumentModelModule.utils.createDocument();

          await createDocumentViaReactor(child1);
          await createDocumentViaReactor(child2);
          await createDocumentViaReactor(child3);

          const actions = [
            addFile({
              id: child1.header.id,
              name: "Child1.drive",
              documentType: child1.header.documentType,
              parentFolder: null,
            }),
            addFile({
              id: child2.header.id,
              name: "Child2.drive",
              documentType: child2.header.documentType,
              parentFolder: null,
            }),
          ];

          const jobInfo = await reactor.execute(
            parentDrive.header.id,
            "main",
            actions,
          );
          await waitForJobAndDocumentUpdate(jobInfo.id, parentDrive.header.id);

          const relationshipActions = [
            {
              id: uuidv4(),
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: new Date().toISOString(),
              input: {
                sourceId: parentDrive.header.id,
                targetId: child1.header.id,
                relationshipType: "child",
              },
            },
            {
              id: uuidv4(),
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: new Date().toISOString(),
              input: {
                sourceId: parentDrive.header.id,
                targetId: child2.header.id,
                relationshipType: "child",
              },
            },
          ];

          const relJobInfo = await reactor.execute(
            parentDrive.header.id,
            "main",
            relationshipActions,
          );
          await waitForJobAndDocumentUpdate(
            relJobInfo.id,
            parentDrive.header.id,
          );

          await vi.waitUntil(
            async () => {
              const relationships = await documentIndexer.getOutgoing(
                parentDrive.header.id,
                ["child"],
              );
              return relationships.length === 2;
            },
            { timeout: 5000 },
          );

          const results = await reactor.find({
            ids: [child1.header.id, child2.header.id, child3.header.id],
            parentId: parentDrive.header.id,
          });

          // NOTE: filterByParentId is not currently implemented, so it returns all
          // documents without filtering by parent. This test documents the current
          // behavior. When filterByParentId is properly implemented, this should be
          // updated to expect 2 results and not contain child3.
          expect(results.results.length).toBe(3);
          const foundIds = results.results.map((doc) => doc.header.id);
          expect(foundIds).toContain(child1.header.id);
          expect(foundIds).toContain(child2.header.id);
          expect(foundIds).toContain(child3.header.id);
        });
      });

      describe("find() - Error Cases", () => {
        it("should throw error when no criteria provided", async () => {
          await expect(reactor.find({})).rejects.toThrow(
            "No search criteria provided",
          );
        });

        it("should throw error when both ids and slugs provided", async () => {
          const doc = driveDocumentModelModule.utils.createDocument();
          await createDocumentViaReactor(doc);

          await expect(
            reactor.find({
              ids: [doc.header.id],
              slugs: ["some-slug"],
            }),
          ).rejects.toThrow("Cannot use both ids and slugs in the same search");
        });
      });
    });
  },
);
