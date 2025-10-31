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
        const { name, args } = mutation;
        if (name === "createDrive") {
          console.log(`Creating drive: ${args.name}`);
        } else if (name === "addDriveAction") {
          console.log(`Adding drive action: ${args.driveAction.type}`);
        } else if (name === "addAction") {
          console.log(`Adding action: ${args.action.type}`);
        }

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
        const { name, args } = mutation;
        if (name === "createDrive") {
          console.log(`Creating drive: ${args.name}`);
        } else if (name === "addDriveAction") {
          console.log(`Adding drive action: ${args.driveAction.type}`);
        } else if (name === "addAction") {
          console.log(`Adding action: ${args.action.type}`);
        }

        await processBaseServerMutation(mutation, driveServer);
      }

      console.log(
        "All operations processed successfully using base-server API",
      );
    },
    { timeout: 100000 },
  );
});

describe("Atlas Recorded Operations State Comparison Test", () => {
  let reactorDriveServer: BaseDocumentDriveServer;
  let reactorStorage: MemoryStorage;
  let reactor: Reactor;
  let baseServerDriveServer: BaseDocumentDriveServer;
  let baseServerStorage: MemoryStorage;
  let driveIds: string[];

  it(
    "should produce identical final state in both Reactor and BaseDocumentDriveServer",
    async ({ expect }) => {
      reactorStorage = new MemoryStorage();
      baseServerStorage = new MemoryStorage();
      driveIds = [];

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
        `Processing ${mutations.length} mutations through both systems...`,
      );

      for (const mutation of mutations) {
        const { name, args } = mutation;
        if (name === "createDrive") {
          console.log(`Creating drive: ${args.name}`);
          driveIds.push(args.id);
        } else if (name === "addDriveAction") {
          console.log(`Adding drive action: ${args.driveAction.type}`);
        } else if (name === "addAction") {
          console.log(`Adding action: ${args.action.type}`);
        }

        await processReactorMutation(mutation, reactor, driveIds);
        await processBaseServerMutation(mutation, baseServerDriveServer);
      }

      console.log("All operations completed. Comparing final states...");

      for (const driveId of driveIds) {
        console.log(`Comparing drive: ${driveId}`);

        const reactorDrive = await reactorDriveServer.getDrive(driveId);
        const baseServerDrive = await baseServerDriveServer.getDrive(driveId);

        expect(reactorDrive.state).toEqual(baseServerDrive.state);

        const reactorChildIds = await reactorStorage.getChildren(driveId);
        const baseServerChildIds = await baseServerStorage.getChildren(driveId);

        expect(reactorChildIds.sort()).toEqual(baseServerChildIds.sort());

        console.log(
          `Drive ${driveId} has ${reactorChildIds.length} child documents`,
        );

        for (const childId of reactorChildIds) {
          console.log(`Comparing document: ${childId}`);

          const reactorDoc = await reactorStorage.get(childId);
          const baseServerDoc = await baseServerStorage.get(childId);

          expect(reactorDoc.state).toEqual(baseServerDoc.state);
          expect(reactorDoc.header).toEqual(baseServerDoc.header);
        }
      }

      console.log(
        "All states match between Reactor and BaseDocumentDriveServer!",
      );
    },
    { timeout: 200000 },
  );
});
