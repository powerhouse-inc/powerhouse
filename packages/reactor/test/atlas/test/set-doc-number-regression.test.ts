import type { BaseDocumentDriveServer } from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  driveDocumentModelModule,
} from "document-drive";
import type { Action, DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

type Database = StorageDatabase & DocumentViewDatabase;

describe("Atlas regression: SET_DOC_NUMBER", () => {
  let reactor: Reactor;
  let storage: MemoryStorage;
  let registry: IDocumentModelRegistry;
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
      atlasModels.AtlasScope,
      atlasModels.AtlasFoundation,
      atlasModels.AtlasGrounding,
      atlasModels.AtlasExploratory,
      atlasModels.AtlasMultiParent,
      atlasModels.AtlasSet,
      atlasModels.AtlasFeedbackIssues,
    ]
      .map((m) => m as any)
      .map((module) =>
        module.documentModel?.global?.id
          ? module
          : {
              ...module,
              documentModel: {
                ...module.documentModel,
                global: module.documentModel,
              },
            },
      );

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

    const jobTracker = createTestJobTracker();
    executorManager = new SimpleJobExecutorManager(
      () => executor,
      eventBus,
      queue,
      jobTracker,
    );
    await executorManager.start(1);

    const documentView = new KyselyDocumentView(db, operationStore);
    await documentView.init();
    readModelCoordinator = new ReadModelCoordinator(eventBus, [documentView]);

    reactor = new Reactor(
      driveServer,
      storage,
      queue,
      jobTracker,
      readModelCoordinator,
    );
  });

  it("currently fails when applying SET_DOC_NUMBER to an Atlas Scope document", async () => {
    const modules = await reactor.getDocumentModels();

    const driveModule = modules.results.find(
      (m: DocumentModelModule) =>
        m.documentModel.global.id === "powerhouse/document-drive",
    );
    if (!driveModule) {
      throw new Error("Drive document model not found");
    }

    const driveId = "atlas-regression-drive";
    const driveDoc = driveModule.utils.createDocument();
    driveDoc.header.id = driveId;
    driveDoc.header.name = "Atlas Regression Drive";
    driveDoc.header.slug = driveId;

    const driveJob = await reactor.create(driveDoc);
    await vi.waitUntil(
      async () => {
        const status = await reactor.getJobStatus(driveJob.id);
        if (status.status === JobStatus.FAILED) {
          throw new Error(
            `Drive creation failed: ${status.error?.message ?? "unknown error"}`,
          );
        }
        return status.status === JobStatus.COMPLETED;
      },
      { timeout: 5000 },
    );

    const scopeModule = modules.results.find(
      (m: DocumentModelModule) =>
        m.documentModel.global.id === "sky/atlas-scope",
    );
    if (!scopeModule) {
      throw new Error("Atlas Scope document model not found");
    }

    const atlasDocId = "atlas-scope-doc";
    const scopeDoc = scopeModule.utils.createDocument();
    scopeDoc.header.id = atlasDocId;
    scopeDoc.header.name = "Atlas Scope Doc";

    const scopeJob = await reactor.create(scopeDoc);
    await vi.waitUntil(
      async () => {
        const status = await reactor.getJobStatus(scopeJob.id);
        if (status.status === JobStatus.FAILED) {
          throw new Error(
            `Scope creation failed: ${status.error?.message ?? "unknown error"}`,
          );
        }
        return status.status === JobStatus.COMPLETED;
      },
      { timeout: 5000 },
    );

    const setDocNumber: Action = {
      id: "set-doc-number-action",
      type: "SET_DOC_NUMBER",
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
      input: { docNo: "A.1" },
    };

    const mutationJob = await reactor.mutate(atlasDocId, [setDocNumber]);

    await vi.waitUntil(
      async () => {
        const status = await reactor.getJobStatus(mutationJob.id);
        return status.status === JobStatus.FAILED;
      },
      { timeout: 5000 },
    );

    const failedStatus = await reactor.getJobStatus(mutationJob.id);
    expect(failedStatus.status).toBe(JobStatus.FAILED);
    const combinedMessages = [
      failedStatus.error?.message,
      ...(failedStatus.errorHistory?.map((error) => error.message) ?? []),
    ]
      .filter(Boolean)
      .join("\n");
    expect(combinedMessages).toContain(
      "Cannot read properties of undefined (reading 'slice')",
    );
  });
});
