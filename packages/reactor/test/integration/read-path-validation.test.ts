import type { IJobExecutorManager, IReactor } from "#index.js";
import type {
  BaseDocumentDriveServer,
  DocumentDriveDocument,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  addFile,
  addFolder,
  driveDocumentModelModule,
  setDriveName,
  updateNode,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reactor } from "../../src/core/reactor.js";
import { EventBus } from "../../src/events/event-bus.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import { KyselyDocumentView } from "../../src/read-models/document-view.js";
import type { IReadModelCoordinator } from "../../src/read-models/interfaces.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import { JobStatus } from "../../src/shared/types.js";
import type {
  IDocumentView,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../factories.js";

// Combined database type
type Database = StorageDatabase & DocumentViewDatabase;

/**
 * These tests validate the entire pipeline:
 * 1. Operations go through Reactor interface (create, mutate, delete)
 * 2. Jobs flow through Queue -> Executor with dual-writing
 * 3. Compare results from legacy storage vs IDocumentView
 *
 * This proves the full integration works correctly end-to-end.
 */
describe("Legacy Storage vs IDocumentView", () => {
  let reactor: IReactor;
  let legacyStorage: MemoryStorage;
  let documentView: IDocumentView;
  let db: Kysely<Database>;
  let operationStore: IOperationStore;
  let executorManager: IJobExecutorManager;
  let driveServer: BaseDocumentDriveServer;
  let readModelCoordinator: IReadModelCoordinator;

  beforeEach(async () => {
    // Set up legacy storage
    legacyStorage = new MemoryStorage();

    // Set up registry
    const registry = new DocumentModelRegistry();
    registry.registerModules(driveDocumentModelModule);

    // Create real drive server
    const builder = new ReactorBuilder([
      driveDocumentModelModule,
    ] as DocumentModelModule<any>[])
      .withStorage(legacyStorage)
      .withOptions({
        featureFlags: {
          enableDualActionCreate: true,
        },
      });
    driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;
    operationStore = setup.store;

    // Create document view and initialize
    documentView = new KyselyDocumentView(db, operationStore);
    await documentView.init();

    // Create dependencies
    const eventBus = new EventBus();
    const queue = new InMemoryQueue(eventBus);
    const jobTracker = new InMemoryJobTracker();
    const executor = new SimpleJobExecutor(
      registry,
      legacyStorage as IDocumentStorage,
      legacyStorage as IDocumentOperationStorage,
      operationStore,
      eventBus,
    );
    executorManager = new SimpleJobExecutorManager(
      () => executor,
      eventBus,
      queue,
      jobTracker,
    );

    await executorManager.start(1);

    // Create real read model coordinator with document view
    readModelCoordinator = new ReadModelCoordinator(eventBus, [documentView]);
    readModelCoordinator.start();

    // Create reactor
    reactor = new Reactor(
      driveServer,
      legacyStorage as IDocumentStorage,
      queue,
      jobTracker,
      readModelCoordinator,
    );
  });

  afterEach(async () => {
    await executorManager.stop();
    readModelCoordinator.stop();
    await db.destroy();
  });

  describe("reactor.create() validation", () => {
    it("should create document visible in both legacy storage and document view", async () => {
      // Create the document through the Reactor interface
      const document = driveDocumentModelModule.utils.createDocument();
      const documentId = document.header.id;
      const jobInfo = await reactor.create(document);

      // Wait for job to complete
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Wait for the document to be fully indexed in the document view (with all scopes)
      await vi.waitUntil(async () => {
        try {
          const viewDoc =
            await documentView.get<DocumentDriveDocument>(documentId);
          // Check that all expected scopes are present
          return (
            viewDoc.state.global !== undefined &&
            viewDoc.state.local !== undefined
          );
        } catch {
          return false;
        }
      });

      // Get documents from both storage systems
      const viewDoc = await documentView.get<DocumentDriveDocument>(documentId);
      const legacyDoc =
        await legacyStorage.get<DocumentDriveDocument>(documentId);

      // Compare the meaningful document data
      expect(viewDoc.header).toEqual(legacyDoc.header);
      expect(viewDoc.state).toEqual(legacyDoc.state);
      expect(viewDoc.initialState).toEqual(legacyDoc.initialState);
    });
  });

  describe("reactor.mutate() validation", () => {
    it.skip("should maintain equivalent documents in both stores after multiple mutations", async () => {
      // Create the document through the Reactor interface
      const document = driveDocumentModelModule.utils.createDocument();
      const documentId = document.header.id;
      const createJobInfo = await reactor.create(document);

      // Wait for create job to complete
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(createJobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Wait for the document to be fully indexed in the document view (with all scopes)
      await vi.waitUntil(async () => {
        try {
          const viewDoc =
            await documentView.get<DocumentDriveDocument>(documentId);
          // Check that all expected scopes are present
          return (
            viewDoc.state.global !== undefined &&
            viewDoc.state.local !== undefined
          );
        } catch {
          return false;
        }
      });

      // Perform multiple mutations
      const folder1Id = generateId();
      const folder2Id = generateId();
      const fileId = generateId();

      // First mutation: set drive name and add folders
      const mutation1Actions = [
        setDriveName({ name: "Test Drive" }),
        addFolder({
          id: folder1Id,
          name: "Documents",
          parentFolder: null,
        }),
        addFolder({
          id: folder2Id,
          name: "Images",
          parentFolder: null,
        }),
      ];

      const mutation1JobInfo = await reactor.mutate(
        documentId,
        mutation1Actions,
      );

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(mutation1JobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Second mutation: add a file
      const mutation2Actions = [
        addFile({
          id: fileId,
          name: "test.txt",
          documentType: "text/plain",
          parentFolder: folder1Id,
        }),
      ];

      const mutation2JobInfo = await reactor.mutate(
        documentId,
        mutation2Actions,
      );

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(mutation2JobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Third mutation: update folder name
      const mutation3Actions = [
        updateNode({
          id: folder2Id,
          name: "Photos",
        }),
      ];

      const mutation3JobInfo = await reactor.mutate(
        documentId,
        mutation3Actions,
      );

      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(mutation3JobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Wait a bit for document view to be fully updated
      await vi.waitUntil(async () => {
        try {
          const viewDoc =
            await documentView.get<DocumentDriveDocument>(documentId);
          // Check that the document has the expected number of nodes
          return viewDoc.state.global.nodes.length === 3;
        } catch {
          return false;
        }
      });

      // Get documents from both storage systems
      const viewDoc = await documentView.get<DocumentDriveDocument>(documentId);
      const legacyDoc =
        await legacyStorage.get<DocumentDriveDocument>(documentId);

      // Compare the meaningful document data
      expect(viewDoc.header).toEqual(legacyDoc.header);
      expect(viewDoc.state).toEqual(legacyDoc.state);
      expect(viewDoc.initialState).toEqual(legacyDoc.initialState);

      // Verify specific mutations were applied correctly in both stores
      expect(viewDoc.state.global.name).toBe("Test Drive");
      expect(legacyDoc.state.global.name).toBe("Test Drive");

      expect(viewDoc.state.global.nodes).toHaveLength(3);
      expect(legacyDoc.state.global.nodes).toHaveLength(3);

      // Find specific nodes in both stores
      const viewFolder1 = viewDoc.state.global.nodes.find(
        (n) => n.id === folder1Id,
      );
      const legacyFolder1 = legacyDoc.state.global.nodes.find(
        (n) => n.id === folder1Id,
      );
      expect(viewFolder1).toEqual(legacyFolder1);
      expect(viewFolder1?.name).toBe("Documents");

      const viewFolder2 = viewDoc.state.global.nodes.find(
        (n) => n.id === folder2Id,
      );
      const legacyFolder2 = legacyDoc.state.global.nodes.find(
        (n) => n.id === folder2Id,
      );
      expect(viewFolder2).toEqual(legacyFolder2);
      expect(viewFolder2?.name).toBe("Photos"); // Should be updated name

      const viewFile = viewDoc.state.global.nodes.find((n) => n.id === fileId);
      const legacyFile = legacyDoc.state.global.nodes.find(
        (n) => n.id === fileId,
      );
      expect(viewFile).toEqual(legacyFile);
      expect(viewFile?.name).toBe("test.txt");
      expect(viewFile?.parentFolder).toBe(folder1Id);
    });
  });
});
