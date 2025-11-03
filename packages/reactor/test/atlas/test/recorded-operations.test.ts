import type { BaseDocumentDriveServer } from "document-drive";
import { MemoryStorage, ReactorBuilder } from "document-drive";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/types.js";
import { Reactor } from "../../../src/core/reactor.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { SimpleJobExecutorManager } from "../../../src/executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../../../src/executor/simple-job-executor.js";
import { InMemoryQueue } from "../../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../../src/read-models/coordinator.js";
import { KyselyDocumentView } from "../../../src/read-models/document-view.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import type { IKeyframeStore } from "../../../src/storage/interfaces.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import {
  createTestJobTracker,
  createTestOperationStore,
} from "../../factories.js";

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
  let reactorDriveServer: BaseDocumentDriveServer;
  let reactorStorage: MemoryStorage;
  let reactor: Reactor;
  let reactor2: Reactor;
  let baseServerDriveServer: BaseDocumentDriveServer;
  let baseServerStorage: MemoryStorage;
  let driveIds: string[];
  let driveIds2: string[];
  let reactorStorage2: MemoryStorage;
  let reactorDriveServer2: BaseDocumentDriveServer;
  let documentView2: KyselyDocumentView;
  let db2: Kysely<Database>;
  let operationStore2: KyselyOperationStore;

  it(
    "should produce identical final state in both Reactor and BaseDocumentDriveServer",
    async ({ expect }) => {
      reactorStorage = new MemoryStorage();
      baseServerStorage = new MemoryStorage();
      driveIds = [];
      driveIds2 = [];

      const documentModels = getDocumentModels();

      const reactorBuilder = new ReactorBuilder(documentModels).withStorage(
        reactorStorage,
      );
      reactorDriveServer =
        reactorBuilder.build() as unknown as BaseDocumentDriveServer;
      await reactorDriveServer.initialize();

      const setup = await createTestOperationStore();
      const db = setup.db as unknown as Kysely<Database>;
      const operationStore = setup.store;
      const keyframeStore = setup.keyframeStore;

      const eventBus = new EventBus();
      const queue = new InMemoryQueue(eventBus);

      const registry = new DocumentModelRegistry();
      registry.registerModules(...documentModels);

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
        reactorStorage,
        reactorStorage,
        operationStore,
        eventBus,
        writeCache,
      );

      const documentView = new KyselyDocumentView(db, operationStore);
      await documentView.init();
      const readModelCoordinator = new ReadModelCoordinator(eventBus, [
        documentView,
      ]);

      const jobTracker = createTestJobTracker();

      const executorManager = new SimpleJobExecutorManager(
        () => executor,
        eventBus,
        queue,
        jobTracker,
      );

      await executorManager.start(1);

      reactor = new Reactor(
        reactorDriveServer,
        reactorStorage,
        queue,
        jobTracker,
        readModelCoordinator,
      );

      reactorStorage2 = new MemoryStorage();
      const reactorBuilder2 = new ReactorBuilder(documentModels).withStorage(
        reactorStorage2,
      );
      reactorDriveServer2 =
        reactorBuilder2.build() as unknown as BaseDocumentDriveServer;
      await reactorDriveServer2.initialize();

      const setup2 = await createTestOperationStore();
      db2 = setup2.db as unknown as Kysely<Database>;
      operationStore2 = setup2.store;
      const keyframeStore2 = setup2.keyframeStore;

      const eventBus2 = new EventBus();
      const queue2 = new InMemoryQueue(eventBus2);

      const writeCacheConfig2: WriteCacheConfig = {
        maxDocuments: 100,
        ringBufferSize: 10,
        keyframeInterval: 10,
      };
      const writeCache2 = new KyselyWriteCache(
        keyframeStore2,
        operationStore2,
        registry,
        writeCacheConfig2,
      );
      await writeCache2.startup();

      const executor2 = new SimpleJobExecutor(
        registry,
        reactorStorage2,
        reactorStorage2,
        operationStore2,
        eventBus2,
        writeCache2,
        { legacyStorageEnabled: false },
      );

      documentView2 = new KyselyDocumentView(db2, operationStore2);
      await documentView2.init();
      const readModelCoordinator2 = new ReadModelCoordinator(eventBus2, [
        documentView2,
      ]);

      const jobTracker2 = createTestJobTracker();

      const executorManager2 = new SimpleJobExecutorManager(
        () => executor2,
        eventBus2,
        queue2,
        jobTracker2,
      );

      await executorManager2.start(1);

      reactor2 = new Reactor(
        reactorDriveServer2,
        reactorStorage2,
        queue2,
        jobTracker2,
        readModelCoordinator2,
      );

      const baseServerBuilder = new ReactorBuilder(documentModels).withStorage(
        baseServerStorage,
      );
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
        await processReactorMutation(mutation, reactor, driveIds);
        await processReactorMutation(mutation, reactor2, driveIds2);
        await processBaseServerMutation(mutation, baseServerDriveServer);
      }

      console.log("All operations completed. Comparing final states...");

      expect(driveIds).toEqual(driveIds2);

      for (let i = 0; i < driveIds.length; i++) {
        const driveId = driveIds[i];
        const driveId2 = driveIds2[i];

        const reactorDrive = await reactorDriveServer.getDrive(driveId);
        const reactor2Drive = await documentView2.get(driveId2);
        const baseServerDrive = await baseServerDriveServer.getDrive(driveId);

        expect(reactorDrive.state).toEqual(baseServerDrive.state);
        expect(reactor2Drive.state).toEqual(baseServerDrive.state);

        const fileIds = reactorDrive.state.global.nodes
          .filter((node: any) => node.kind === "file")
          .map((node: any) => node.id);

        console.log(`Drive ${driveId} has ${fileIds.length} file documents`);

        for (const childId of fileIds) {
          const reactorDoc = await reactorStorage.get(childId);
          const reactor2Doc = await documentView2.get(childId);
          const baseServerDoc = await baseServerStorage.get(childId);

          expect(reactorDoc.state).toEqual(baseServerDoc.state);
          expect(reactor2Doc.state).toEqual(baseServerDoc.state);
        }
      }

      console.log(
        "All states match between Reactor (legacy reads), Reactor (documentView reads), and BaseDocumentDriveServer!",
      );
    },
    { timeout: 200000 },
  );
});
