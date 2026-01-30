import type {
  BaseDocumentDriveServer,
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import {
  ReactorBuilder as DriveReactorBuilder,
  MemoryStorage,
} from "document-drive";
import type { DocumentModelModule, UpgradeManifest } from "document-model";
import { DocumentMetaCache } from "../cache/document-meta-cache.js";
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
import type {
  IReadModel,
  IReadModelCoordinator,
} from "../read-models/interfaces.js";
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
import { ConsoleLogger } from "#logging/console.js";
import type { ILogger } from "#logging/types.js";
import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import type { IEventBus } from "../events/interfaces.js";
import { ProcessorManager } from "../processors/processor-manager.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../storage/migrations/migrator.js";
import type { MigrationStrategy } from "../storage/migrations/types.js";
import { DefaultSubscriptionErrorHandler } from "../subs/default-error-handler.js";
import { ReactorSubscriptionManager } from "../subs/react-subscription-manager.js";
import { SubscriptionNotificationReadModel } from "../subs/subscription-notification-read-model.js";

export class ReactorBuilder {
  private logger?: ILogger;
  private documentModels: DocumentModelModule<any>[] = [];
  private upgradeManifests: UpgradeManifest<readonly number[]>[] = [];
  private storage?: IDocumentStorage & IDocumentOperationStorage;
  private features: ReactorFeatures = { legacyStorageEnabled: false };
  private readModels: IReadModel[] = [];
  private executorManager: IJobExecutorManager | undefined;
  private executorConfig: ExecutorConfig = { count: 1 };
  private writeCacheConfig?: Partial<WriteCacheConfig>;
  private migrationStrategy: MigrationStrategy = "auto";
  private syncBuilder?: SyncBuilder;
  private eventBus?: IEventBus;
  private readModelCoordinator?: IReadModelCoordinator;
  private signatureVerifier?: SignatureVerificationHandler;
  private kyselyInstance?: Kysely<Database>;
  private signalHandlersEnabled = false;

  withLogger(logger: ILogger): this {
    this.logger = logger;
    return this;
  }

  withDocumentModels(models: DocumentModelModule<any>[]): this {
    this.documentModels = models;
    return this;
  }

  withUpgradeManifests(manifests: UpgradeManifest<readonly number[]>[]): this {
    this.upgradeManifests = manifests;
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

  withReadModelCoordinator(readModelCoordinator: IReadModelCoordinator): this {
    this.readModelCoordinator = readModelCoordinator;
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

  withMigrationStrategy(strategy: MigrationStrategy): this {
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

  withSignatureVerifier(verifier: SignatureVerificationHandler): this {
    this.signatureVerifier = verifier;
    return this;
  }

  withKysely(kysely: Kysely<Database>): this {
    this.kyselyInstance = kysely;
    return this;
  }

  withSignalHandlers(): this {
    this.signalHandlersEnabled = true;
    return this;
  }

  async build(): Promise<IReactor> {
    const module = await this.buildModule();
    return module.reactor;
  }

  async buildModule(): Promise<ReactorModule> {
    if (!this.logger) {
      this.logger = new ConsoleLogger(["reactor"]);
    }

    const storage = this.storage || new MemoryStorage();

    const documentModelRegistry = new DocumentModelRegistry();
    if (this.upgradeManifests.length > 0) {
      documentModelRegistry.registerUpgradeManifests(...this.upgradeManifests);
    }
    if (this.documentModels.length > 0) {
      documentModelRegistry.registerModules(...this.documentModels);
    }

    const builder = new DriveReactorBuilder(this.documentModels).withStorage(
      storage as MemoryStorage,
    );
    const driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    const baseDatabase =
      this.kyselyInstance ??
      new Kysely<Database>({
        dialect: new PGliteDialect(new PGlite()),
      });

    if (this.migrationStrategy === "auto") {
      const result = await runMigrations(baseDatabase, REACTOR_SCHEMA);
      if (!result.success && result.error) {
        throw new Error(`Database migration failed: ${result.error.message}`);
      }
    }

    const database = baseDatabase.withSchema(REACTOR_SCHEMA);

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

    const documentMetaCache = new DocumentMetaCache(operationStore, {
      maxDocuments: 1000,
    });
    await documentMetaCache.startup();

    let executorManager = this.executorManager;
    if (!executorManager) {
      executorManager = new SimpleJobExecutorManager(
        () =>
          new SimpleJobExecutor(
            this.logger!,
            documentModelRegistry,
            storage,
            storage,
            operationStore,
            eventBus,
            writeCache,
            operationIndex,
            documentMetaCache,
            { legacyStorageEnabled: this.features.legacyStorageEnabled },
            this.signatureVerifier,
          ),
        eventBus,
        queue,
        jobTracker,
        this.logger,
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
      operationIndex,
      writeCache,
      documentViewConsistencyTracker,
    );

    try {
      await documentView.init();
    } catch (error) {
      console.error("Error initializing document view", error);
    }

    readModelInstances.push(documentView);

    const documentIndexerConsistencyTracker = new ConsistencyTracker();
    const documentIndexer = new KyselyDocumentIndexer(
      // @ts-expect-error - Database type is a superset that includes all required tables
      database,
      operationStore,
      documentIndexerConsistencyTracker,
    );

    try {
      await documentIndexer.init();
    } catch (error) {
      console.error("Error initializing document indexer", error);
    }

    readModelInstances.push(documentIndexer);

    const subscriptionManager = new ReactorSubscriptionManager(
      new DefaultSubscriptionErrorHandler(),
    );

    const subscriptionNotificationReadModel =
      new SubscriptionNotificationReadModel(subscriptionManager, documentView);

    const processorManagerConsistencyTracker = new ConsistencyTracker();
    const processorManager = new ProcessorManager(
      // @ts-expect-error - Database type is a superset that includes all required tables
      database,
      operationIndex,
      writeCache,
      processorManagerConsistencyTracker,
    );

    try {
      await processorManager.init();
    } catch (error) {
      console.error("Error initializing processor manager", error);
    }

    const readModelCoordinator = this.readModelCoordinator
      ? this.readModelCoordinator
      : new ReadModelCoordinator(eventBus, readModelInstances, [
          subscriptionNotificationReadModel,
          processorManager,
        ]);

    const reactor = new Reactor(
      this.logger,
      documentModelRegistry,
      queue,
      jobTracker,
      readModelCoordinator,
      this.features,
      documentView,
      documentIndexer,
      operationStore,
      eventBus,
      executorManager,
    );

    let syncModule: SyncModule | undefined = undefined;
    if (this.syncBuilder) {
      syncModule = this.syncBuilder.buildModule(
        reactor,
        this.logger,
        operationIndex,
        eventBus,
        database as unknown as Kysely<StorageDatabase>,
      );
      await syncModule.syncManager.startup();
    }

    const module: ReactorModule = {
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
      subscriptionManager,
      processorManager,
      processorManagerConsistencyTracker,
      syncModule,
      reactor,
    };

    if (this.signalHandlersEnabled) {
      this.attachSignalHandlers(module);
    }

    return module;
  }

  private attachSignalHandlers(module: ReactorModule): void {
    let shutdownInProgress = false;

    const handler = async (signal: string) => {
      if (shutdownInProgress) {
        this.logger!.warn(`Received ${signal} again, forcing exit`);
        process.exit(1);
      }

      shutdownInProgress = true;
      this.logger!.info(`Received ${signal}, starting graceful shutdown...`);

      const status = module.reactor.kill();

      try {
        await status.completed;
        await module.database.destroy();
        this.logger!.info("Shutdown complete");
        process.exit(0);
      } catch (error) {
        this.logger!.error("Shutdown failed:", error);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => void handler("SIGINT"));
    process.on("SIGTERM", () => void handler("SIGTERM"));
  }
}
