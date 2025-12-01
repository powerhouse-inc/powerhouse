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
import { KyselyOperationIndex } from "../cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../cache/write-cache-types.js";
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
import type { SyncBuilder } from "../sync/sync-builder.js";
import { Reactor } from "./reactor.js";
import type {
  Database,
  ExecutorConfig,
  IReactor,
  ReactorFeatures,
  ReactorModule,
  SyncModule,
} from "./types.js";

import type { IJobExecutorManager } from "#executor/interfaces.js";
import type { IDocumentIndexer } from "#storage/interfaces.js";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import type { IEventBus } from "../events/interfaces.js";
import type { IReadModelCoordinator } from "../read-models/interfaces.js";
import { runMigrations } from "../storage/migrations/migrator.js";
import type { MigrationStrategy } from "../storage/migrations/types.js";

export type IReadModelCoordinatorFactory = (
  eventBus: IEventBus,
  readModels: IReadModel[],
) => IReadModelCoordinator;

export class ReactorBuilder {
  private documentModels: DocumentModelModule[] = [];
  private storage?: IDocumentStorage & IDocumentOperationStorage;
  private features: ReactorFeatures = { legacyStorageEnabled: true };
  private readModels: IReadModel[] = [];
  private executorManager: IJobExecutorManager | undefined;
  private executorConfig: ExecutorConfig = { count: 1 };
  private writeCacheConfig?: Partial<WriteCacheConfig>;
  private readModelCoordinatorFactory?: IReadModelCoordinatorFactory;
  private migrationStrategy: MigrationStrategy = "auto";
  private syncBuilder?: SyncBuilder;
  private eventBus?: IEventBus;
  public documentIndexer?: IDocumentIndexer;

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

  withReadModelCoordinatorFactory(factory: IReadModelCoordinatorFactory): this {
    this.readModelCoordinatorFactory = factory;
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

  setMigrationStrategy(strategy: MigrationStrategy): this {
    this.migrationStrategy = strategy;
    return this;
  }

  withSync(syncBuilder: SyncBuilder): this {
    this.syncBuilder = syncBuilder;
    return this;
  }

  withEventBus(eventBus: IEventBus): this {
    this.eventBus = eventBus;
    return this;
  }

  get events(): IEventBus | undefined {
    return this.eventBus;
  }

  async build(): Promise<IReactor> {
    const module = await this.buildModule();
    return module.reactor;
  }

  async buildModule(): Promise<ReactorModule> {
    const storage = this.storage || new MemoryStorage();

    const documentModelRegistry = new DocumentModelRegistry();
    if (this.documentModels.length > 0) {
      documentModelRegistry.registerModules(...this.documentModels);
    }

    const builder = new DriveReactorBuilder(this.documentModels).withStorage(
      storage as MemoryStorage,
    );
    const driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    const kyselyPGlite = await KyselyPGlite.create();
    const database = new Kysely<Database>({
      dialect: kyselyPGlite.dialect,
    });

    if (this.migrationStrategy === "auto") {
      const result = await runMigrations(database);
      if (!result.success && result.error) {
        throw new Error(`Database migration failed: ${result.error.message}`);
      }
    }

    const operationStore = new KyselyOperationStore(
      database as unknown as Kysely<StorageDatabase>,
    );
    const keyframeStore = new KyselyKeyframeStore(
      database as unknown as Kysely<StorageDatabase>,
    );

    const eventBus = this.eventBus || new EventBus();
    const queue = new InMemoryQueue(eventBus);
    const jobTracker = new InMemoryJobTracker(eventBus);

    const cacheConfig: WriteCacheConfig = {
      maxDocuments: this.writeCacheConfig?.maxDocuments ?? 100,
      ringBufferSize: this.writeCacheConfig?.ringBufferSize ?? 10,
      keyframeInterval: this.writeCacheConfig?.keyframeInterval ?? 10,
    };

    const writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      documentModelRegistry,
      cacheConfig,
    );
    await writeCache.startup();

    const operationIndex = new KyselyOperationIndex(
      database as unknown as Kysely<StorageDatabase>,
    );

    let executorManager = this.executorManager;
    if (!executorManager) {
      executorManager = new SimpleJobExecutorManager(
        () =>
          new SimpleJobExecutor(
            documentModelRegistry,
            storage,
            storage,
            operationStore,
            eventBus,
            writeCache,
            operationIndex,
            { legacyStorageEnabled: this.features.legacyStorageEnabled },
          ),
        eventBus,
        queue,
        jobTracker,
      );
    }

    await executorManager.start(this.executorConfig.count);

    const readModelInstances: IReadModel[] = Array.from(
      new Set([...this.readModels]),
    );

    const documentViewConsistencyTracker = new ConsistencyTracker();
    const documentView = new KyselyDocumentView(
      // @ts-expect-error - Database type is a superset that includes all required tables
      database,
      operationStore,
      documentViewConsistencyTracker,
    );
    await documentView.init();
    readModelInstances.push(documentView);

    const documentIndexerConsistencyTracker = new ConsistencyTracker();
    const documentIndexer = new KyselyDocumentIndexer(
      // @ts-expect-error - Database type is a superset that includes all required tables
      database,
      operationStore,
      documentIndexerConsistencyTracker,
    );
    await documentIndexer.init();
    readModelInstances.push(documentIndexer);
    this.documentIndexer = documentIndexer;

    const readModelCoordinator = this.readModelCoordinatorFactory
      ? this.readModelCoordinatorFactory(eventBus, readModelInstances)
      : new ReadModelCoordinator(eventBus, readModelInstances);

    const reactor = new Reactor(
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

    let syncModule: SyncModule | undefined = undefined;
    if (this.syncBuilder) {
      syncModule = this.syncBuilder.buildModule(
        reactor,
        operationIndex,
        eventBus,
        database as unknown as Kysely<StorageDatabase>,
      );
      await syncModule.syncManager.startup();
    }

    return {
      driveServer,
      storage,
      eventBus,
      documentModelRegistry,
      queue,
      jobTracker,
      executorManager,
      database,
      operationStore,
      keyframeStore,
      writeCache,
      operationIndex,
      documentView,
      documentViewConsistencyTracker,
      documentIndexer,
      documentIndexerConsistencyTracker,
      readModelCoordinator,
      syncModule,
      reactor,
    };
  }
}
