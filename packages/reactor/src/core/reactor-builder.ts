import { PGlite } from "@electric-sql/pglite";
import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import type { DocumentModelModule, UpgradeManifest } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { CollectionMembershipCache } from "../cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../cache/write-cache-types.js";
import { EventBus } from "../events/event-bus.js";
import type { IEventBus } from "../events/interfaces.js";
import type { IJobExecutorManager } from "../executor/interfaces.js";
import { SimpleJobExecutorManager } from "../executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../executor/simple-job-executor.js";
import type { JobExecutorConfig } from "../executor/types.js";
import { InMemoryJobTracker } from "../job-tracker/in-memory-job-tracker.js";
import { ConsoleLogger } from "../logging/console.js";
import type { ILogger } from "../logging/types.js";
import { ProcessorManager } from "../processors/processor-manager.js";
import type { IQueue } from "../queue/interfaces.js";
import { InMemoryQueue } from "../queue/queue.js";
import { ReadModelCoordinator } from "../read-models/coordinator.js";
import { KyselyDocumentView } from "../read-models/document-view.js";
import type {
  IReadModel,
  IReadModelCoordinator,
} from "../read-models/interfaces.js";
import { DocumentModelRegistry } from "../registry/implementation.js";
import type { IDocumentModelLoader } from "../registry/interfaces.js";
import { ConsistencyTracker } from "../shared/consistency-tracker.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import { GqlRequestChannelFactory } from "../sync/channels/gql-request-channel-factory.js";
import { GqlResponseChannelFactory } from "../sync/channels/gql-response-channel-factory.js";
import { ChannelScheme } from "../sync/types.js";
import type { JwtHandler } from "../sync/types.js";
import { KyselyDocumentIndexer } from "../storage/kysely/document-indexer.js";
import { KyselyKeyframeStore } from "../storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../storage/kysely/store.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../storage/migrations/migrator.js";
import type { MigrationStrategy } from "../storage/migrations/types.js";
import { DefaultSubscriptionErrorHandler } from "../subs/default-error-handler.js";
import { ReactorSubscriptionManager } from "../subs/react-subscription-manager.js";
import { SubscriptionNotificationReadModel } from "../subs/subscription-notification-read-model.js";
import { SyncBuilder } from "../sync/sync-builder.js";
import { Reactor } from "./reactor.js";
import type {
  Database,
  IReactor,
  ReactorFeatures,
  ReactorModule,
  SyncModule,
} from "./types.js";

export class ReactorBuilder {
  private logger?: ILogger;
  private documentModels: DocumentModelModule<any>[] = [];
  private upgradeManifests: UpgradeManifest<readonly number[]>[] = [];
  private storage?: IDocumentStorage & IDocumentOperationStorage;
  private features: ReactorFeatures = { legacyStorageEnabled: false };
  private readModels: IReadModel[] = [];
  private executorManager: IJobExecutorManager | undefined;
  private executorConfig: JobExecutorConfig = {};
  private writeCacheConfig?: Partial<WriteCacheConfig>;
  private migrationStrategy: MigrationStrategy = "auto";
  private syncBuilder?: SyncBuilder;
  private eventBus?: IEventBus;
  private readModelCoordinator?: IReadModelCoordinator;
  private signatureVerifier?: SignatureVerificationHandler;
  private kyselyInstance?: Kysely<Database>;
  private signalHandlersEnabled = false;
  private queueInstance?: IQueue;
  private channelScheme?: ChannelScheme;
  private jwtHandler?: JwtHandler;
  private documentModelLoader?: IDocumentModelLoader;

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

  withExecutorConfig(config: Partial<JobExecutorConfig>): this {
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

  withQueue(queue: IQueue): this {
    this.queueInstance = queue;
    return this;
  }

  withChannelScheme(scheme: ChannelScheme): this {
    this.channelScheme = scheme;
    return this;
  }

  withJwtHandler(handler: JwtHandler): this {
    this.jwtHandler = handler;
    return this;
  }

  withDocumentModelLoader(loader: IDocumentModelLoader): this {
    this.documentModelLoader = loader;
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

    const documentModelRegistry = new DocumentModelRegistry();
    if (this.upgradeManifests.length > 0) {
      documentModelRegistry.registerUpgradeManifests(...this.upgradeManifests);
    }
    if (this.documentModels.length > 0) {
      documentModelRegistry.registerModules(...this.documentModels);
    }

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
    const queue =
      this.queueInstance ??
      new InMemoryQueue(
        eventBus,
        documentModelRegistry,
        this.documentModelLoader,
      );
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

    const collectionMembershipCache = new CollectionMembershipCache(
      operationIndex,
    );

    let executorManager = this.executorManager;
    if (!executorManager) {
      executorManager = new SimpleJobExecutorManager(
        () =>
          new SimpleJobExecutor(
            this.logger!,
            documentModelRegistry,
            operationStore,
            eventBus,
            writeCache,
            operationIndex,
            documentMetaCache,
            collectionMembershipCache,
            this.executorConfig,
            this.signatureVerifier,
          ),
        eventBus,
        queue,
        jobTracker,
        this.logger,
      );
    }

    await executorManager.start(this.executorConfig.maxConcurrency ?? 1);

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
    if (this.channelScheme) {
      const factory =
        this.channelScheme === ChannelScheme.CONNECT
          ? new GqlRequestChannelFactory(this.logger, this.jwtHandler, queue)
          : new GqlResponseChannelFactory(this.logger);

      const syncBuilder = new SyncBuilder().withChannelFactory(factory);
      syncModule = syncBuilder.buildModule(
        reactor,
        this.logger,
        operationIndex,
        eventBus,
        database as unknown as Kysely<StorageDatabase>,
      );
      await syncModule.syncManager.startup();
    } else if (this.syncBuilder) {
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
    if (
      typeof globalThis === "undefined" ||
      !("process" in globalThis) ||
      typeof globalThis.process.on !== "function"
    ) {
      return;
    }

    const nodeProcess = globalThis.process;
    let shutdownInProgress = false;

    const handler = async (signal: string) => {
      if (shutdownInProgress) {
        this.logger!.warn(`Received ${signal} again, forcing exit`);
        nodeProcess.exit(1);
      }

      shutdownInProgress = true;
      this.logger!.info(`Received ${signal}, starting graceful shutdown...`);

      const status = module.reactor.kill();

      try {
        await status.completed;
      } catch (error) {
        this.logger!.error("Shutdown failed waiting for reactor:", error);
        nodeProcess.exit(1);
        return;
      }

      try {
        await module.database.destroy();
      } catch (error) {
        this.logger!.error("Shutdown failed destroying database:", error);
        nodeProcess.exit(1);
        return;
      }

      this.logger!.info("Shutdown complete");
      nodeProcess.exit(0);
    };

    nodeProcess.on("SIGINT", () => void handler("SIGINT"));
    nodeProcess.on("SIGTERM", () => void handler("SIGTERM"));
  }
}
