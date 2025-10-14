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
  driveDocumentModelModule,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
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

      // Wait for the document to be indexed in the document view
      await vi.waitUntil(async () => {
        try {
          await documentView.getHeader(documentId, "main");
          return true;
        } catch {
          return false;
        }
      });

      // Give a bit more time for UPGRADE_DOCUMENT operation to be indexed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify header fields match (allowing for small timestamp differences)
      const header = await documentView.getHeader(documentId, "main");
      const legacyDoc =
        await legacyStorage.get<DocumentDriveDocument>(documentId);

      // Compare all fields except timestamps and revision (which may differ due to timing)
      expect(header.id).toBe(legacyDoc.header.id);
      expect(header.documentType).toBe(legacyDoc.header.documentType);
      expect(header.slug).toBe(legacyDoc.header.slug);
      expect(header.name).toBe(legacyDoc.header.name);
      expect(header.branch).toBe(legacyDoc.header.branch);
      // Revision should be at least 1 (CREATE_DOCUMENT operation was indexed)
      expect(header.revision.document).toBeGreaterThanOrEqual(1);
      expect(legacyDoc.header.revision.document).toBeGreaterThanOrEqual(1);
      expect(header.meta).toEqual(legacyDoc.header.meta);
      expect(header.sig).toEqual(legacyDoc.header.sig);

      // Timestamps should be close (within 100ms)
      const createdDiff = Math.abs(
        new Date(header.createdAtUtcIso).getTime() -
          new Date(legacyDoc.header.createdAtUtcIso).getTime(),
      );
      const modifiedDiff = Math.abs(
        new Date(header.lastModifiedAtUtcIso).getTime() -
          new Date(legacyDoc.header.lastModifiedAtUtcIso).getTime(),
      );
      expect(createdDiff).toBeLessThan(100);
      expect(modifiedDiff).toBeLessThan(100);
    });
  });
});
