import type { BaseDocumentDriveServer } from "document-drive";
import { MemoryStorage, ReactorBuilder } from "document-drive";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bench, describe } from "vitest";
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
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import {
  createMockDocumentIndexer,
  createMockReactorFeatures,
  createTestJobTracker,
  createTestOperationStore,
} from "../../../test/factories.js";

import type { Kysely } from "kysely";
import {
  type RecordedOperation,
  getDocumentModels,
  processBaseServerMutation,
  processReactorMutation,
} from "../test/recorded-operations-helpers.js";

type Database = StorageDatabase & DocumentViewDatabase;

const recordedOpsContent = readFileSync(
  path.join(__dirname, "../test/recorded-operations.json"),
  "utf-8",
);
const operations: RecordedOperation[] = JSON.parse(recordedOpsContent);
const mutations = operations.filter((op) => op.type === "mutation");

async function setupReactor() {
  const reactorStorage = new MemoryStorage();
  const documentModels = getDocumentModels();

  const reactorBuilder = new ReactorBuilder(documentModels).withStorage(
    reactorStorage,
  );
  const reactorDriveServer =
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

  const consistencyTracker = new ConsistencyTracker();
  const documentView = new KyselyDocumentView(
    db,
    operationStore,
    consistencyTracker,
  );
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

  const reactor = new Reactor(
    reactorDriveServer,
    reactorStorage,
    queue,
    jobTracker,
    readModelCoordinator,
    createMockReactorFeatures(),
    documentView,
    createMockDocumentIndexer(),
    operationStore,
  );

  return { reactor, executorManager };
}

async function setupBaseServer() {
  const baseServerStorage = new MemoryStorage();
  const documentModels = getDocumentModels();

  const baseServerBuilder = new ReactorBuilder(documentModels).withStorage(
    baseServerStorage,
  );
  const baseServerDriveServer =
    baseServerBuilder.build() as unknown as BaseDocumentDriveServer;
  await baseServerDriveServer.initialize();

  return { baseServerDriveServer };
}

describe("Atlas Operations Processing", () => {
  bench(
    "Reactor - Process all operations",
    async () => {
      const { reactor, executorManager } = await setupReactor();
      const driveIds: string[] = [];

      for (const mutation of mutations) {
        await processReactorMutation(mutation, reactor, driveIds);
      }

      await executorManager.stop();
    },
    { time: 60000 },
  );

  bench(
    "BaseServer - Process all operations",
    async () => {
      const { baseServerDriveServer } = await setupBaseServer();

      for (const mutation of mutations) {
        await processBaseServerMutation(mutation, baseServerDriveServer);
      }
    },
    { time: 60000 },
  );
});
