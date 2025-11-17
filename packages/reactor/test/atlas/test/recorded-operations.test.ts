import type {
  BaseDocumentDriveServer,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import {
  ReactorBuilder as DriveReactorBuilder,
  MemoryStorage,
} from "document-drive";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/write-cache-types.js";
import { Reactor } from "../../../src/core/reactor.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { SimpleJobExecutorManager } from "../../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../../../src/executor/simple-job-executor.js";
import { InMemoryJobTracker } from "../../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../../src/read-models/coordinator.js";
import { KyselyDocumentView } from "../../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import { JobStatus } from "../../../src/shared/types.js";
import { KyselyDocumentIndexer } from "../../../src/storage/kysely/document-indexer.js";
import { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type {
  DocumentIndexerDatabase,
  Database as StorageDatabase,
} from "../../../src/storage/kysely/types.js";
import { runMigrations } from "../../../src/storage/migrations/migrator.js";
import {
  type RecordedOperation,
  getDocumentModels,
  processBaseServerMutation,
  processReactorMutation,
  submitAllMutationsWithQueueHints,
} from "./recorded-operations-helpers.js";

type Database = StorageDatabase &
  DocumentViewDatabase &
  DocumentIndexerDatabase;

type ReactorTestSetup = {
  reactor: Reactor;
  driveServer: BaseDocumentDriveServer;
  storage: IDocumentStorage & IDocumentOperationStorage;
  documentView: KyselyDocumentView;
  cleanup: () => Promise<void>;
};

async function createReactorSetup(
  legacyStorageEnabled: boolean,
): Promise<ReactorTestSetup> {
  const documentModels = getDocumentModels();
  const storage = new MemoryStorage();
  const registry = new DocumentModelRegistry();
  registry.registerModules(...documentModels);

  const builder = new DriveReactorBuilder(documentModels).withStorage(storage);
  const driveServer = builder.build() as unknown as BaseDocumentDriveServer;
  await driveServer.initialize();

  const kyselyPGlite = await KyselyPGlite.create();
  const db = new Kysely<Database>({
    dialect: kyselyPGlite.dialect,
  });

  const migrationResult = await runMigrations(db);
  if (!migrationResult.success) {
    throw new Error(
      `Failed to run migrations: ${migrationResult.error?.message}`,
    );
  }

  const operationStore = new KyselyOperationStore(
    db as unknown as Kysely<StorageDatabase>,
  );
  const keyframeStore = new KyselyKeyframeStore(
    db as unknown as Kysely<StorageDatabase>,
  );

  const eventBus = new EventBus();
  const queue = new InMemoryQueue(eventBus);
  const jobTracker = new InMemoryJobTracker(eventBus);

  const writeCacheConfig: WriteCacheConfig = {
    maxDocuments: 100,
    ringBufferSize: 10,
    keyframeInterval: 10,
  };

  const writeCache = new KyselyWriteCache(
    keyframeStore,
    operationStore,
    registry,
    writeCacheConfig,
  );
  await writeCache.startup();

  const operationIndex = new KyselyOperationIndex(
    db as unknown as Kysely<StorageDatabase>,
  );

  const executor = new SimpleJobExecutor(
    registry,
    storage,
    storage,
    operationStore,
    eventBus,
    writeCache,
    operationIndex,
    { legacyStorageEnabled },
  );

  const executorManager = new SimpleJobExecutorManager(
    () => executor,
    eventBus,
    queue,
    jobTracker,
  );

  await executorManager.start(1);

  const readModels = [];
  let documentView: KyselyDocumentView | undefined;
  let documentIndexer: KyselyDocumentIndexer | undefined;

  const documentViewConsistencyTracker = new ConsistencyTracker();
  documentView = new KyselyDocumentView(
    db as any,
    operationStore,
    documentViewConsistencyTracker,
  );
  await documentView.init();
  readModels.push(documentView);

  const documentIndexerConsistencyTracker = new ConsistencyTracker();
  documentIndexer = new KyselyDocumentIndexer(
    db as any,
    operationStore,
    documentIndexerConsistencyTracker,
  );
  await documentIndexer.init();
  readModels.push(documentIndexer);

  const readModelCoordinator = new ReadModelCoordinator(eventBus, readModels);

  const reactor = new Reactor(
    driveServer,
    storage,
    queue,
    jobTracker,
    readModelCoordinator,
    { legacyStorageEnabled },
    documentView,
    documentIndexer,
    operationStore,
  );

  const cleanup = async () => {
    await executorManager.stop();
    readModelCoordinator.stop();
    await writeCache.shutdown();
    writeCache.clear();
    try {
      await db.destroy();
    } catch {
      // Ignore cleanup errors
    }
  };

  return {
    reactor,
    driveServer,
    storage,
    documentView,
    cleanup,
  };
}

describe("Atlas Recorded Operations Reactor Test", () => {
  it("should process all recorded operations without errors using Reactor", async () => {
    const setup = await createReactorSetup(true);

    const recordedOpsContent = readFileSync(
      path.join(__dirname, "recorded-operations.json"),
      "utf-8",
    );
    const operations: RecordedOperation[] = JSON.parse(recordedOpsContent);
    const mutations = operations.filter((op) => op.type === "mutation");

    console.log(`Processing ${mutations.length} mutations...`);

    for (const mutation of mutations) {
      await processReactorMutation(mutation, setup.reactor);
    }

    await setup.cleanup();
  }, 10000);

  it("should submit all mutations with queue hints and process them correctly", async () => {
    const setup = await createReactorSetup(true);

    const recordedOpsContent = readFileSync(
      path.join(__dirname, "recorded-operations.json"),
      "utf-8",
    );
    const operations: RecordedOperation[] = JSON.parse(recordedOpsContent);
    const mutations = operations.filter((op) => op.type === "mutation");

    console.log(`Submitting ${mutations.length} mutations with queue hints...`);

    const batchResult = await submitAllMutationsWithQueueHints(
      mutations,
      setup.reactor,
    );

    const jobIds = Object.values(batchResult.jobs).map((job) => job.id);
    console.log(`Submitted ${jobIds.length} jobs`);

    const waitForAllJobs = async (): Promise<void> => {
      const timeout = 100000;
      const interval = 100;
      const startTime = Date.now();

      for (;;) {
        const statuses = await Promise.all(
          jobIds.map((jobId) => setup.reactor.getJobStatus(jobId)),
        );

        const allCompleted = statuses.every(
          (status) => status.status === JobStatus.READ_MODELS_READY,
        );
        const anyFailed = statuses.some(
          (status) => status.status === JobStatus.FAILED,
        );

        if (anyFailed) {
          const failedJobs = statuses.filter(
            (status) => status.status === JobStatus.FAILED,
          );
          throw new Error(
            `Some jobs failed: ${failedJobs.map((job) => `${job.id}: ${job.error?.message}`).join(", ")}`,
          );
        }

        if (allCompleted) {
          console.log("All jobs completed successfully");
          return;
        }

        if (Date.now() - startTime > timeout) {
          throw new Error("Timeout waiting for all jobs to complete");
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    };

    await waitForAllJobs();
    await setup.cleanup();
  }, 10000);
});

describe("Atlas Recorded Operations Base Server Test", () => {
  it("should process all recorded operations without errors using base-server", async () => {
    const storage = new MemoryStorage();
    const documentModels = getDocumentModels();

    const builder = new DriveReactorBuilder(documentModels).withStorage(
      storage,
    );
    const driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    const recordedOpsContent = readFileSync(
      path.join(__dirname, "recorded-operations.json"),
      "utf-8",
    );
    const operations: RecordedOperation[] = JSON.parse(recordedOpsContent);
    const mutations = operations.filter((op) => op.type === "mutation");

    console.log(`Processing ${mutations.length} mutations...`);

    for (const mutation of mutations) {
      await processBaseServerMutation(mutation, driveServer);
    }

    console.log("All operations processed successfully using base-server API");

    const driveId = "atlas_20251027_1647";
    const children = await storage.getChildren(driveId);
    console.log(
      `BaseServer standalone test - total children: ${children.length}`,
    );
  }, 10000);
});

describe("Atlas Recorded Operations State Comparison Test", () => {
  it("should produce identical final state in both Reactor and BaseDocumentDriveServer", async ({
    expect,
  }) => {
    const driveIds: string[] = [];
    const driveIds2: string[] = [];

    const documentModels = getDocumentModels();

    // Setup reactor 1 (with legacy storage enabled)
    const setup1 = await createReactorSetup(true);

    // Setup reactor 2 (with legacy storage disabled)
    const setup2 = await createReactorSetup(false);

    // Setup reactor 3 (with batch submission via queue hints)
    const setup3 = await createReactorSetup(true);

    // Setup base server for comparison
    const baseServerStorage = new MemoryStorage();
    const baseServerBuilder = new DriveReactorBuilder(
      documentModels,
    ).withStorage(baseServerStorage);
    const baseServerDriveServer =
      baseServerBuilder.build() as unknown as BaseDocumentDriveServer;
    await baseServerDriveServer.initialize();

    const recordedOpsContent = readFileSync(
      path.join(__dirname, "recorded-operations.json"),
      "utf-8",
    );
    const operations: RecordedOperation[] = JSON.parse(recordedOpsContent);
    const mutations = operations.filter((op) => op.type === "mutation");

    console.log(
      `Processing ${mutations.length} mutations through all four systems...`,
    );

    const batchResult = await submitAllMutationsWithQueueHints(
      mutations,
      setup3.reactor,
    );
    const batchJobIds = Object.values(batchResult.jobs).map((job) => job.id);
    console.log(
      `Reactor 3 (batch): Submitted ${batchJobIds.length} jobs with queue hints`,
    );

    for (const mutation of mutations) {
      await processReactorMutation(mutation, setup1.reactor);
      await processReactorMutation(mutation, setup2.reactor);
      await processBaseServerMutation(mutation, baseServerDriveServer);
    }

    console.log("Waiting for batch jobs to complete...");
    const waitForBatchJobs = async (): Promise<void> => {
      const timeout = 200000;
      const interval = 100;
      const startTime = Date.now();

      for (;;) {
        const statuses = await Promise.all(
          batchJobIds.map((jobId) => setup3.reactor.getJobStatus(jobId)),
        );

        const allCompleted = statuses.every(
          (status) => status.status === JobStatus.READ_MODELS_READY,
        );
        const anyFailed = statuses.some(
          (status) => status.status === JobStatus.FAILED,
        );

        if (anyFailed) {
          const failedJobs = statuses.filter(
            (status) => status.status === JobStatus.FAILED,
          );
          throw new Error(
            `Batch jobs failed: ${failedJobs.map((job) => `${job.id}: ${job.error?.message}`).join(", ")}`,
          );
        }

        if (allCompleted) {
          console.log("All batch jobs completed successfully");
          break;
        }

        if (Date.now() - startTime > timeout) {
          throw new Error("Timeout waiting for batch jobs to complete");
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    };

    await waitForBatchJobs();

    console.log("All operations completed. Comparing final states...");

    expect(driveIds).toEqual(driveIds2);

    for (let i = 0; i < driveIds.length; i++) {
      const driveId = driveIds[i];
      const driveId2 = driveIds2[i];

      const reactorDrive = await setup1.driveServer.getDrive(driveId);
      const reactor2Drive = await setup2.documentView.get(driveId2);
      const reactor3Drive = await setup3.driveServer.getDrive(driveId);
      const baseServerDrive = await baseServerDriveServer.getDrive(driveId);

      expect(reactorDrive.state).toEqual(baseServerDrive.state);
      expect(reactor2Drive.state).toEqual(baseServerDrive.state);
      expect(reactor3Drive.state).toEqual(baseServerDrive.state);

      const fileIds = reactorDrive.state.global.nodes
        .filter((node: unknown) => (node as { kind: string }).kind === "file")
        .map((node: unknown) => (node as { id: string }).id);

      console.log(`Drive ${driveId} has ${fileIds.length} file documents`);

      for (const childId of fileIds) {
        const reactorDoc = await setup1.storage.get(childId);
        const reactor2Doc = await setup2.documentView.get(childId);
        const reactor3Doc = await setup3.storage.get(childId);
        const baseServerDoc = await baseServerStorage.get(childId);

        expect(reactorDoc.state).toEqual(baseServerDoc.state);
        expect(reactor2Doc.state).toEqual(baseServerDoc.state);
        expect(reactor3Doc.state).toEqual(baseServerDoc.state);
      }
    }

    // Cleanup
    await setup1.cleanup();
    await setup2.cleanup();
    await setup3.cleanup();

    console.log(
      "All states match between Reactor (legacy reads), Reactor (documentView reads), Reactor (batch with queue hints), and BaseDocumentDriveServer!",
    );
  }, 60000);
});
