import type {
  BaseDocumentDriveServer,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import {
  ReactorBuilder as DriveReactorBuilder,
  MemoryStorage,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { KyselyWriteCache } from "../cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../cache/types.js";
import { EventBus } from "../events/event-bus.js";
import { SimpleJobExecutorManager } from "../executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../executor/simple-job-executor.js";
import { InMemoryJobTracker } from "../job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../queue/queue.js";
import { ReadModelCoordinator } from "../read-models/coordinator.js";
import { KyselyDocumentView } from "../read-models/document-view.js";
import type { IReadModel } from "../read-models/interfaces.js";
import { DocumentModelRegistry } from "../registry/implementation.js";
import { ConsistencyTracker } from "../shared/consistency-tracker.js";
import { KyselyDocumentIndexer } from "../storage/kysely/document-indexer.js";
import { KyselyKeyframeStore } from "../storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../storage/kysely/store.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import { Reactor } from "./reactor.js";
import type {
  Database,
  ExecutorConfig,
  IReactor,
  ReactorFeatures,
} from "./types.js";

import type { IJobExecutorManager } from "#executor/interfaces.js";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";

export class ReactorBuilder {
  private documentModels: DocumentModelModule[] = [];
  private storage?: IDocumentStorage & IDocumentOperationStorage;
  private features: ReactorFeatures = { legacyStorageEnabled: true };
  private readModels: IReadModel[] = [];
  private executorManager: IJobExecutorManager | undefined;
  private executorConfig: ExecutorConfig = { count: 1 };
  private writeCacheConfig?: Partial<WriteCacheConfig>;

  withDocumentModels(models: DocumentModelModule[]): this {
    this.documentModels = models;
    return this;
  }

  withLegacyStorage(
    storage: IDocumentStorage & IDocumentOperationStorage,
  ): this {
    this.storage = storage;
    return this;
  }

  withFeatures(features: ReactorFeatures): this {
    this.features = { ...this.features, ...features };
    return this;
  }

  withReadModel(readModel: IReadModel): this {
    this.readModels.push(readModel);
    return this;
  }

  withExecutor(executor: IJobExecutorManager): this {
    this.executorManager = executor;
    return this;
  }

  withExecutorConfig(config: Partial<ExecutorConfig>): this {
    this.executorConfig = { ...this.executorConfig, ...config };
    return this;
  }

  withWriteCacheConfig(config: Partial<WriteCacheConfig>): this {
    this.writeCacheConfig = config;
    return this;
  }

  async build(): Promise<IReactor> {
    const storage = this.storage || new MemoryStorage();

    const registry = new DocumentModelRegistry();
    if (this.documentModels.length > 0) {
      registry.registerModules(...this.documentModels);
    }

    const builder = new DriveReactorBuilder(this.documentModels).withStorage(
      storage as MemoryStorage,
    );
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

    const cacheConfig: WriteCacheConfig = {
      maxDocuments: this.writeCacheConfig?.maxDocuments ?? 100,
      ringBufferSize: this.writeCacheConfig?.ringBufferSize ?? 10,
      keyframeInterval: this.writeCacheConfig?.keyframeInterval ?? 10,
    };

    const writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      cacheConfig,
    );
    await writeCache.startup();

    if (!this.executorManager) {
      this.executorManager = new SimpleJobExecutorManager(
        () =>
          new SimpleJobExecutor(
            registry,
            storage,
            storage,
            operationStore,
            eventBus,
            writeCache,
            { legacyStorageEnabled: this.features.legacyStorageEnabled },
          ),
        eventBus,
        queue,
        jobTracker,
      );
    }

    await this.executorManager.start(this.executorConfig.count);

    const readModelInstances: IReadModel[] = Array.from(
      new Set([...this.readModels]),
    );

    const documentViewConsistencyTracker = new ConsistencyTracker();
    const documentView = new KyselyDocumentView(
      // @ts-expect-error - Database type is a superset that includes all required tables
      db,
      operationStore,
      documentViewConsistencyTracker,
    );
    await documentView.init();
    readModelInstances.push(documentView);

    const documentIndexerConsistencyTracker = new ConsistencyTracker();
    const documentIndexer = new KyselyDocumentIndexer(
      // @ts-expect-error - Database type is a superset that includes all required tables
      db,
      operationStore,
      documentIndexerConsistencyTracker,
    );
    await documentIndexer.init();
    readModelInstances.push(documentIndexer);

    const readModelCoordinator = new ReadModelCoordinator(
      eventBus,
      readModelInstances,
    );
    readModelCoordinator.start();

    return new Reactor(
      driveServer,
      storage,
      queue,
      jobTracker,
      readModelCoordinator,
      this.features,
      documentView,
      documentIndexer,
      operationStore,
    );
  }
}
