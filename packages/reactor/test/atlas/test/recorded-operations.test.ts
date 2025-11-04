import type { BaseDocumentDriveServer } from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder as DriveReactorBuilder,
} from "document-drive";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import { EventBus } from "../../../src/events/event-bus.js";
import { SimpleJobExecutorManager } from "../../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../../../src/executor/simple-job-executor.js";
import { InMemoryJobTracker } from "../../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../../src/read-models/coordinator.js";
import { KyselyDocumentView } from "../../../src/read-models/document-view.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import { KyselyDocumentIndexer } from "../../../src/storage/kysely/document-indexer.js";
import { Reactor } from "../../../src/core/reactor.js";
import type {
  IDocumentStorage,
  IDocumentOperationStorage,
} from "document-drive";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/types.js";
import { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import type { DocumentIndexerDatabase } from "../../../src/storage/kysely/types.js";
import {
  type RecordedOperation,
  getDocumentModels,
  processBaseServerMutation,
  processReactorMutation,
} from "./recorded-operations-helpers.js";

type Database = StorageDatabase &
  DocumentViewDatabase &
  DocumentIndexerDatabase;

type ReactorTestSetup = {
  reactor: Reactor;
  driveServer: BaseDocumentDriveServer;
  storage: IDocumentStorage & IDocumentOperationStorage;
  documentView?: KyselyDocumentView;
  cleanup: () => Promise<void>;
};

async function createReactorSetup(
  legacyStorageEnabled: boolean,
  includeDocumentView: boolean,
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

  await db.schema
    .createTable("Operation")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("jobId", "text", (col) => col.notNull())
    .addColumn("opId", "text", (col) => col.notNull().unique())
    .addColumn("prevOpId", "text", (col) => col.notNull())
    .addColumn("writeTimestampUtcMs", "timestamptz", (col) =>
      col.notNull().defaultTo(new Date()),
    )
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("timestampUtcMs", "timestamptz", (col) => col.notNull())
    .addColumn("index", "integer", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("skip", "integer", (col) => col.notNull())
    .addColumn("error", "text")
    .addColumn("hash", "text", (col) => col.notNull())
    .addUniqueConstraint("unique_revision", [
      "documentId",
      "scope",
      "branch",
      "index",
    ])
    .execute();

  await db.schema
    .createIndex("streamOperations")
    .on("Operation")
    .columns(["documentId", "scope", "branch", "id"])
    .execute();

  await db.schema
    .createIndex("branchlessStreamOperations")
    .on("Operation")
    .columns(["documentId", "scope", "id"])
    .execute();

  await db.schema
    .createTable("Keyframe")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("revision", "integer", (col) => col.notNull())
    .addColumn("document", "text", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(new Date()),
    )
    .addUniqueConstraint("unique_keyframe", [
      "documentId",
      "scope",
      "branch",
      "revision",
    ])
    .execute();

  await db.schema
    .createIndex("keyframe_lookup")
    .on("Keyframe")
    .columns(["documentId", "scope", "branch", "revision"])
    .execute();

  const operationStore = new KyselyOperationStore(
    db as unknown as Kysely<StorageDatabase>,
  );
  const keyframeStore = new KyselyKeyframeStore(
    db as unknown as Kysely<StorageDatabase>,
  );

  const eventBus = new EventBus();
  const queue = new InMemoryQueue(eventBus);
  const jobTracker = new InMemoryJobTracker();

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

  const executor = new SimpleJobExecutor(
    registry,
    storage,
    storage,
    operationStore,
    eventBus,
    writeCache,
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

  if (includeDocumentView) {
    const consistencyTracker = new ConsistencyTracker();
    // @ts-expect-error - Database type is a superset that includes all required tables
    documentView = new KyselyDocumentView(
      db,
      operationStore,
      consistencyTracker,
    );
    await documentView.init();
    readModels.push(documentView);

    // @ts-expect-error - Database type is a superset that includes all required tables
    const documentIndexer = new KyselyDocumentIndexer(db, operationStore);
    await documentIndexer.init();
    readModels.push(documentIndexer);
  }

  const readModelCoordinator = new ReadModelCoordinator(eventBus, readModels);
  readModelCoordinator.start();

  const reactor = new Reactor(
    driveServer,
    storage,
    queue,
    jobTracker,
    readModelCoordinator,
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
  it(
    "should process all recorded operations without errors using Reactor",
    async () => {
      const setup = await createReactorSetup(true, true);

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
    },
    { timeout: 100000 },
  );
});

describe("Atlas Recorded Operations Base Server Test", () => {
  it(
    "should process all recorded operations without errors using base-server",
    async () => {
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

      console.log(
        "All operations processed successfully using base-server API",
      );

      const driveId = "atlas_20251027_1647";
      const children = await storage.getChildren(driveId);
      console.log(
        `BaseServer standalone test - total children: ${children.length}`,
      );
    },
    { timeout: 100000 },
  );
});

describe("Atlas Recorded Operations State Comparison Test", () => {
  it(
    "should produce identical final state in both Reactor and BaseDocumentDriveServer",
    async ({ expect }) => {
      const driveIds: string[] = [];
      const driveIds2: string[] = [];

      const documentModels = getDocumentModels();

      // Setup reactor 1 (with legacy storage enabled)
      const setup1 = await createReactorSetup(true, true);

      // Setup reactor 2 (with legacy storage disabled)
      const setup2 = await createReactorSetup(false, true);

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
        `Processing ${mutations.length} mutations through all three systems...`,
      );

      for (const mutation of mutations) {
        await processReactorMutation(mutation, setup1.reactor, driveIds);
        await processReactorMutation(mutation, setup2.reactor, driveIds2);
        await processBaseServerMutation(mutation, baseServerDriveServer);
      }

      console.log("All operations completed. Comparing final states...");

      expect(driveIds).toEqual(driveIds2);

      for (let i = 0; i < driveIds.length; i++) {
        const driveId = driveIds[i];
        const driveId2 = driveIds2[i];

        const reactorDrive = await setup1.driveServer.getDrive(driveId);
        const reactor2Drive = await setup2.documentView!.get(driveId2);
        const baseServerDrive = await baseServerDriveServer.getDrive(driveId);

        expect(reactorDrive.state).toEqual(baseServerDrive.state);
        expect(reactor2Drive.state).toEqual(baseServerDrive.state);

        const fileIds = reactorDrive.state.global.nodes
          .filter((node: unknown) => (node as { kind: string }).kind === "file")
          .map((node: unknown) => (node as { id: string }).id);

        console.log(`Drive ${driveId} has ${fileIds.length} file documents`);

        for (const childId of fileIds) {
          const reactorDoc = await setup1.storage.get(childId);
          const reactor2Doc = await setup2.documentView!.get(childId);
          const baseServerDoc = await baseServerStorage.get(childId);

          expect(reactorDoc.state).toEqual(baseServerDoc.state);
          expect(reactor2Doc.state).toEqual(baseServerDoc.state);
        }
      }

      // Cleanup
      await setup1.cleanup();
      await setup2.cleanup();

      console.log(
        "All states match between Reactor (legacy reads), Reactor (documentView reads), and BaseDocumentDriveServer!",
      );
    },
    { timeout: 200000 },
  );
});
