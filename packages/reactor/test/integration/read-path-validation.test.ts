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
import { KyselyDocumentView } from "../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import { JobStatus } from "../../src/shared/types.js";
import type {
  IDocumentView,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import {
  createMockReadModelCoordinator,
  createTestOperationStore,
} from "../factories.js";

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

    // Create reactor
    const readModelCoordinator = createMockReadModelCoordinator();
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
    await db.destroy();
  });

  describe("reactor.create() validation", () => {
    it("should create document visible in legacy storage", async () => {
      // Create the document through the Reactor interface
      const document = driveDocumentModelModule.utils.createDocument();
      const documentId = document.header.id;
      const jobInfo = await reactor.create(document);

      // Wait for job to complete
      await vi.waitUntil(async () => {
        const jobStatus = await reactor.getJobStatus(jobInfo.id);
        return jobStatus.status === JobStatus.COMPLETED;
      });

      // Verify document is exactly the same in both legacy storage and the document view
      const legacyDoc =
        await legacyStorage.get<DocumentDriveDocument>(documentId);
      const documents = await documentView.getMany([documentId]);
      expect(documents).toHaveLength(1);
      expect(documents[0]).toEqual(legacyDoc);
    });
  });
});
