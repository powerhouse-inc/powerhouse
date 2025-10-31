import type { BaseDocumentDriveServer } from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  addFile,
  driveDocumentModelModule,
} from "document-drive";
import type { Action, DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it, vi } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/types.js";
import { Reactor } from "../../../src/core/reactor.js";
import type { BatchMutationRequest } from "../../../src/core/types.js";
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
import { v4 as uuidv4 } from "uuid";

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
              const errorMessage = status.error?.message ?? "unknown error";
              throw new Error(`createDrive failed: ${errorMessage}`);
            }
            return status.status === JobStatus.COMPLETED;
          });
        } else if (name === "addDriveAction") {
          console.log(`Adding drive action: ${args.driveAction.type}`);
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
                const errorMessage = status.error?.message ?? "unknown error";
                throw new Error(
                  `Failed to create child document: ${errorMessage}`,
                );
              }
              return status.status === JobStatus.COMPLETED;
            });

            const fileAction = addFile({
              id: driveAction.input.id,
              name: driveAction.input.name,
              documentType: driveAction.input.documentType,
              parentFolder: driveAction.input.parentFolder || null,
            });

            const addRelationshipAction = {
              id: uuidv4(),
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: new Date().toISOString(),
              input: {
                sourceId: driveId,
                targetId: driveAction.input.id,
                relationshipType: "child",
              },
            };

            const batchRequest: BatchMutationRequest = {
              jobs: [
                {
                  key: "addFile",
                  documentId: driveId,
                  scope: "global",
                  branch: "main",
                  actions: [fileAction],
                  dependsOn: [],
                },
                {
                  key: "linkChild",
                  documentId: driveId,
                  scope: "document",
                  branch: "main",
                  actions: [addRelationshipAction],
                  dependsOn: ["addFile"],
                },
              ],
            };

            const result = await reactor.mutateBatch(batchRequest);

            await vi.waitUntil(async () => {
              const addFileStatus = await reactor.getJobStatus(
                result.jobs.addFile.id,
              );
              const linkChildStatus = await reactor.getJobStatus(
                result.jobs.linkChild.id,
              );
              if (addFileStatus.status === JobStatus.FAILED) {
                const errorMessage =
                  addFileStatus.error?.message ?? "unknown error";
                throw new Error(`ADD_FILE action failed: ${errorMessage}`);
              }
              if (linkChildStatus.status === JobStatus.FAILED) {
                const errorMessage =
                  linkChildStatus.error?.message ?? "unknown error";
                throw new Error(
                  `ADD_RELATIONSHIP action failed: ${errorMessage}`,
                );
              }
              return (
                addFileStatus.status === JobStatus.COMPLETED &&
                linkChildStatus.status === JobStatus.COMPLETED
              );
            });
          } else {
            const cleanedAction = removeSynchronizationUnits(
              driveAction,
            ) as Action;

            const jobInfo = await reactor.mutate(driveId, [cleanedAction]);
            await vi.waitUntil(async () => {
              const status = await reactor.getJobStatus(jobInfo.id);
              if (status.status === JobStatus.FAILED) {
                const errorMessage = status.error?.message ?? "unknown error";
                throw new Error(`addDriveAction failed: ${errorMessage}`);
              }
              return status.status === JobStatus.COMPLETED;
            });
          }
        } else if (name === "addAction") {
          console.log(`Adding action: ${args.action.type}`);

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
                `addAction failed: ${status.error?.message ?? "unknown error"}: ${status.error?.stack ?? "unknown stack"}`,
              );
            }
            return status.status === JobStatus.COMPLETED;
          });
        }
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
    async ({ expect }) => {
      storage = new MemoryStorage();

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

          const { id, name, slug } = args;
          await driveServer.addDrive({
            id,
            slug,
            global: {
              name,
              icon: "",
            },
            local: {
              availableOffline: false,
              sharingType: "PUBLIC",
              listeners: [],
              triggers: [],
            },
          });

          const drive = await driveServer.getDrive(id);
          expect(drive).toBeDefined();
          expect(drive.header.id).toBe(id);
        } else if (name === "addDriveAction") {
          console.log(`Adding drive action: ${args.driveAction.type}`);
          const { driveId, driveAction } = args;

          if (driveAction.type === "ADD_FILE") {
            const docType = driveAction.input.documentType;
            const modules = driveServer.getDocumentModelModules();
            const module = modules.find(
              (m: DocumentModelModule) => m.documentModel.global.id === docType,
            );

            if (!module) {
              throw new Error(`Document model not found for type: ${docType}`);
            }

            const fileDoc = module.utils.createDocument();
            fileDoc.header.id = driveAction.input.id;
            fileDoc.header.name = driveAction.input.name;

            await driveServer.addDocument(fileDoc);

            const fileAction = addFile({
              id: driveAction.input.id,
              name: driveAction.input.name,
              documentType: driveAction.input.documentType,
              parentFolder: driveAction.input.parentFolder || null,
            });

            const addFileResult = await driveServer.addDriveAction(
              driveId,
              fileAction,
            );

            if (addFileResult.status !== "SUCCESS") {
              throw new Error(
                `ADD_FILE action failed: ${addFileResult.error?.message ?? "unknown error"}`,
              );
            }

            const addRelationshipAction = {
              id: uuidv4(),
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: new Date().toISOString(),
              input: {
                sourceId: driveId,
                targetId: driveAction.input.id,
                relationshipType: "child",
              },
            };

            const relationshipResult = await driveServer.addDriveAction(
              driveId,
              addRelationshipAction as any,
            );

            if (relationshipResult.status !== "SUCCESS") {
              throw new Error(
                `ADD_RELATIONSHIP action failed: ${relationshipResult.error?.message ?? "unknown error"}`,
              );
            }
          } else {
            const cleanedAction = removeSynchronizationUnits(
              driveAction,
            ) as Action;

            const result = await driveServer.addDriveAction(
              driveId,
              cleanedAction,
            );

            if (result.status !== "SUCCESS") {
              throw new Error(
                `addDriveAction failed: ${result.error?.message ?? "unknown error"}`,
              );
            }
          }
        } else if (name === "addAction") {
          console.log(`Adding action: ${args.action.type}`);

          const { docId, action } = args;
          const cleanedAction = removeSynchronizationUnits(action) as Action;

          const result = await driveServer.addAction(docId, cleanedAction);

          if (result.status !== "SUCCESS") {
            throw new Error(
              `addAction failed: ${result.error?.message ?? "unknown error"}`,
            );
          }
        }
      }

      console.log(
        "All operations processed successfully using base-server API",
      );
    },
    { timeout: 100000 },
  );
});
