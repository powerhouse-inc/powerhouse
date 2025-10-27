import type { BaseDocumentDriveServer } from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  driveDocumentModelModule,
} from "document-drive";
import type { Action, DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it, vi } from "vitest";
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
import { JobStatus } from "../../../src/shared/types.js";
import type { IKeyframeStore } from "../../../src/storage/interfaces.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import {
  createTestJobTracker,
  createTestOperationStore,
} from "../../factories.js";

import * as atlasModels from "@sky-ph/atlas/document-models";
import type { Kysely } from "kysely";
import path from "node:path";

type Database = StorageDatabase & DocumentViewDatabase;

interface RecordedOperation {
  type: string;
  name: string;
  timestamp: string;
  args: Record<string, any>;
}

function wrapAtlasModule(module: any): DocumentModelModule<any> {
  if (module.documentModel?.global?.id) {
    return module;
  }

  return {
    ...module,
    documentModel: {
      ...module.documentModel,
      global: module.documentModel,
    },
  };
}

function removeSynchronizationUnits(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeSynchronizationUnits);
  }

  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "synchronizationUnits") {
        result[key] = removeSynchronizationUnits(value);
      }
    }
    return result;
  }

  return obj;
}

describe("Atlas Recorded Operations Integration Test", () => {
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

    const documentModels: DocumentModelModule[] = [
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      driveDocumentModelModule as unknown as DocumentModelModule,
      wrapAtlasModule(atlasModels.AtlasScope),
      wrapAtlasModule(atlasModels.AtlasFoundation),
      wrapAtlasModule(atlasModels.AtlasGrounding),
      wrapAtlasModule(atlasModels.AtlasExploratory),
      wrapAtlasModule(atlasModels.AtlasMultiParent),
      wrapAtlasModule(atlasModels.AtlasSet),
      wrapAtlasModule(atlasModels.AtlasFeedbackIssues),
    ];

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

  it("should process all recorded operations without errors", async () => {
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
        const { id, name, slug } = args;
        const modules = await reactor.getDocumentModels();
        const driveModule = modules.results.find(
          (m: DocumentModelModule) =>
            m.documentModel.global.id === "powerhouse/document-drive",
        );
        if (!driveModule) {
          throw new Error("Drive document model not found");
        }

        const driveDoc = driveModule.utils.createDocument();
        driveDoc.header.id = id;
        driveDoc.header.name = name;
        driveDoc.header.slug = slug;

        const jobInfo = await reactor.create(driveDoc);
        await vi.waitUntil(async () => {
          const status = await reactor.getJobStatus(jobInfo.id);
          if (status.status === JobStatus.FAILED) {
            throw new Error(
              `createDrive failed: ${status.error || "unknown error"}`,
            );
          }
          return status.status === JobStatus.COMPLETED;
        });
      } else if (name === "addDriveAction") {
        const { driveId, driveAction } = args;

        if (driveAction.type === "ADD_FILE") {
          const docType = driveAction.input.documentType;
          const modules = await reactor.getDocumentModels();
          const module = modules.results.find(
            (m: DocumentModelModule) => m.documentModel.global.id === docType,
          );

          if (!module) {
            throw new Error(`Document model not found for type: ${docType}`);
          }

          const fileDoc = module.utils.createDocument();
          fileDoc.header.id = driveAction.input.id;
          fileDoc.header.name = driveAction.input.name;

          const createJobInfo = await reactor.create(fileDoc);
          await vi.waitUntil(async () => {
            const status = await reactor.getJobStatus(createJobInfo.id);
            if (status.status === JobStatus.FAILED) {
              throw new Error(
                `Failed to create child document: ${status.error || "unknown error"}`,
              );
            }
            return status.status === JobStatus.COMPLETED;
          });

          const addFileAction: Action = {
            id: driveAction.id,
            type: "ADD_FILE",
            scope: driveAction.scope || "global",
            timestampUtcMs: driveAction.timestampUtcMs,
            input: {
              id: driveAction.input.id,
              name: driveAction.input.name,
              documentType: driveAction.input.documentType,
              parentFolder: driveAction.input.parentFolder || null,
            },
          };

          const jobInfo = await reactor.mutate(driveId, [addFileAction]);
          await vi.waitUntil(async () => {
            const status = await reactor.getJobStatus(jobInfo.id);
            if (status.status === JobStatus.FAILED) {
              throw new Error(
                `ADD_FILE action failed: ${status.error || "unknown error"}`,
              );
            }
            return status.status === JobStatus.COMPLETED;
          });
        } else {
          const cleanedAction = removeSynchronizationUnits(
            driveAction,
          ) as Action;

          const jobInfo = await reactor.mutate(driveId, [cleanedAction]);
          await vi.waitUntil(async () => {
            const status = await reactor.getJobStatus(jobInfo.id);
            if (status.status === JobStatus.FAILED) {
              throw new Error(
                `addDriveAction failed: ${status.error || "unknown error"}`,
              );
            }
            return status.status === JobStatus.COMPLETED;
          });
        }
      } else if (name === "addAction") {
        const { docId, action } = args;
        const cleanedAction = removeSynchronizationUnits(action) as Action;

        const jobInfo = await reactor.mutate(docId, [cleanedAction]);
        await vi.waitUntil(async () => {
          const status = await reactor.getJobStatus(jobInfo.id);
          if (status.status === JobStatus.FAILED) {
            status.errorHistory?.forEach((error, index) => {
              console.error(`[Attempt ${index + 1}] ${error.message}`);
              console.error(
                `[Attempt ${index + 1}] Stack trace:\n${error.stack}`,
              );
            });

            throw new Error(
              `addAction failed: ${status.error?.message ?? "unknown error"}`,
            );
          }
          return status.status === JobStatus.COMPLETED;
        });
      }
    }
  });
});
