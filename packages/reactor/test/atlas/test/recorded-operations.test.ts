import type { BaseDocumentDriveServer } from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder as DriveReactorBuilder,
} from "document-drive";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "vitest";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { ReactorSetup } from "../../../src/core/types.js";

import type { Kysely } from "kysely";
import path from "node:path";
import {
  type RecordedOperation,
  getDocumentModels,
  processBaseServerMutation,
  processReactorMutation,
} from "./recorded-operations-helpers.js";

type Database = StorageDatabase & DocumentViewDatabase;

describe("Atlas Recorded Operations Reactor Test", () => {
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

  beforeEach(async () => {
    storage = new MemoryStorage();
    registry = new DocumentModelRegistry();

    const documentModels = getDocumentModels();
    registry.registerModules(...documentModels);

    const builder = new ReactorBuilder(documentModels).withStorage(storage);
    driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);

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
      storage,
      storage,
      operationStore,
      eventBus,
      writeCache,
    );

    const documentView = new KyselyDocumentView(db, operationStore);
    await documentView.init();
    readModelCoordinator = new ReadModelCoordinator(eventBus, [documentView]);

    const jobTracker = createTestJobTracker();

    executorManager = new SimpleJobExecutorManager(
      () => executor,
      eventBus,
      queue,
      jobTracker,
    );

    await executorManager.start(1);

    reactor = new Reactor(
      driveServer,
      storage,
      queue,
      jobTracker,
      readModelCoordinator,
    );
  });

  it(
    "should process all recorded operations without errors using Reactor",
    async () => {
      const recordedOpsContent = readFileSync(
        path.join(__dirname, "recorded-operations.json"),
        "utf-8",
      );
      const operations: RecordedOperation[] = JSON.parse(recordedOpsContent);
      const mutations = operations.filter((op) => op.type === "mutation");

      console.log(`Processing ${mutations.length} mutations...`);

      for (const mutation of mutations) {
        await processReactorMutation(mutation, reactor);
      }
    },
    { timeout: 100000 },
  );
});

describe("Atlas Recorded Operations Base Server Test", () => {
  let driveServer: BaseDocumentDriveServer;
  let storage: MemoryStorage;

  it(
    "should process all recorded operations without errors using base-server",
    async () => {
      storage = new MemoryStorage();
      const documentModels = getDocumentModels();

      const builder = new ReactorBuilder(documentModels).withStorage(storage);
      driveServer = builder.build() as unknown as BaseDocumentDriveServer;
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
  let setup1: ReactorSetup;
  let setup2: ReactorSetup;
  let baseServerDriveServer: BaseDocumentDriveServer;
  let baseServerStorage: MemoryStorage;
  let driveIds: string[];
  let driveIds2: string[];

  it(
    "should produce identical final state in both Reactor and BaseDocumentDriveServer",
    async ({ expect }) => {
      driveIds = [];
      driveIds2 = [];

      const documentModels = getDocumentModels();

      // Setup reactor 1 (with legacy storage enabled)
      setup1 = await new ReactorBuilder()
        .withDocumentModels(documentModels)
        .withDocumentView()
        .build();

      // Setup reactor 2 (with legacy storage disabled)
      setup2 = await new ReactorBuilder()
        .withDocumentModels(documentModels)
        .withFeatures({ legacyStorageEnabled: false })
        .withDocumentView()
        .build();

      // Setup base server for comparison
      baseServerStorage = new MemoryStorage();
      const baseServerBuilder = new DriveReactorBuilder(
        documentModels,
      ).withStorage(baseServerStorage);
      baseServerDriveServer =
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
          .filter((node: any) => node.kind === "file")
          .map((node: any) => node.id);

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
