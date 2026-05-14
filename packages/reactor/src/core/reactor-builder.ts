import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { CollectionMembershipCache } from "../cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../cache/write-cache-types.js";
import { EventBus } from "../events/event-bus.js";
import type { IEventBus } from "../events/interfaces.js";
import {
  KyselyExecutionScope,
  type IExecutionScope,
} from "../executor/execution-scope.js";
import type { IJobExecutorManager } from "../executor/interfaces.js";
import { SimpleJobExecutorManager } from "../executor/simple-job-executor-manager.js";
import { SimpleJobExecutor } from "../executor/simple-job-executor.js";
import type { JobExecutorConfig } from "../executor/types.js";
import { InMemoryJobTracker } from "../job-tracker/in-memory-job-tracker.js";
import { ProcessorManager } from "../processors/processor-manager.js";
import type { IQueue } from "../queue/interfaces.js";
import { InMemoryQueue } from "../queue/queue.js";
import { ReadModelCoordinator } from "../read-models/coordinator.js";
import { KyselyDocumentView } from "../read-models/document-view.js";
import type {
  IReadModel,
  IReadModelCoordinator,
} from "../read-models/interfaces.js";
import {
  DocumentModelResolver,
  NullDocumentModelResolver,
} from "../registry/document-model-resolver.js";
import { DocumentModelRegistry } from "../registry/implementation.js";
import type { IDocumentModelLoader } from "../registry/interfaces.js";
import { ConsistencyTracker } from "../shared/consistency-tracker.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import {
  KyselyDocumentIndexer,
  type IndexerDatabase,
} from "../storage/kysely/document-indexer.js";
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
import { GqlRequestChannelFactory } from "../sync/channels/gql-request-channel-factory.js";
import { GqlResponseChannelFactory } from "../sync/channels/gql-response-channel-factory.js";
import { SyncBuilder } from "../sync/sync-builder.js";
import type { JwtHandler } from "../sync/types.js";
import { ChannelScheme } from "../sync/types.js";
import { createDefaultDatabase } from "./create-default-database.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "./drive-container-types.js";
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
  private shutdownHooks: Array<() => Promise<void>> = [];
  private driveContainerTypes: ReadonlySet<string> =
    DEFAULT_DRIVE_CONTAINER_TYPES;

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

  withDriveContainerTypes(types: string[]): this {
    this.driveContainerTypes = new Set(types);
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

  /**
   * Register an async cleanup hook to run during graceful shutdown. Hooks fire
   * after `reactor.kill()` resolves and before `database.destroy()`, so callers
   * that depend on the reactor (e.g. an HTTP API layered on top) can drain
   * cleanly before the underlying kysely instance is torn down. Hook errors are
   * logged and otherwise ignored — one bad hook cannot strand the rest of the
   * shutdown chain.
   */
  withShutdownHook(hook: () => Promise<void>): this {
    this.shutdownHooks.push(hook);
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
      const results = documentModelRegistry.registerUpgradeManifests(
        ...this.upgradeManifests,
      );
      for (const result of results) {
        if (result.status === "error") {
          this.logger.error(
            "Failed to register upgrade manifest: @error",
            result.error.message,
          );
        }
      }
    }
    if (this.documentModels.length > 0) {
      const results = documentModelRegistry.registerModules(
        ...this.documentModels,
      );
      for (const result of results) {
        if (result.status === "error") {
          this.logger.error(
            "Failed to register document model: @error",
            result.error.message,
          );
        }
      }
    }

    const baseDatabase = this.kyselyInstance ?? (await createDefaultDatabase());

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
    const resolver = this.documentModelLoader
      ? new DocumentModelResolver(
          documentModelRegistry,
          this.documentModelLoader,
        )
      : new NullDocumentModelResolver(documentModelRegistry);
    const queue = this.queueInstance ?? new InMemoryQueue(eventBus, resolver);
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

    const executionScope: IExecutionScope = new KyselyExecutionScope(
      database as unknown as Kysely<StorageDatabase>,
      operationStore,
      operationIndex,
      keyframeStore,
      writeCache,
      documentMetaCache,
      collectionMembershipCache,
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
            this.driveContainerTypes,
            this.executorConfig,
            this.signatureVerifier,
            executionScope,
          ),
        eventBus,
        queue,
        jobTracker,
        this.logger,
        resolver,
        this.executorConfig.jobTimeoutMs,
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
      database as unknown as Kysely<IndexerDatabase>,
      operationIndex,
      writeCache,
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
      this.logger!,
      this.driveContainerTypes,
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
        this.driveContainerTypes,
      );
      await syncModule.syncManager.startup();
    } else if (this.syncBuilder) {
      syncModule = this.syncBuilder.buildModule(
        reactor,
        this.logger,
        operationIndex,
        eventBus,
        database as unknown as Kysely<StorageDatabase>,
        this.driveContainerTypes,
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
    const realExit = nodeProcess.exit.bind(nodeProcess);
    let shutdownInProgress = false;
    let pendingExitCode: number | undefined;

    // While our async cleanup runs, swap process.exit for a recording shim so
    // peer SIGINT handlers (notably vite's bindCLIShortcuts handler, default
    // enabled) cannot terminate the process before reactor.kill() and
    // database.destroy() finish. Without this guard the process exits during
    // the first microtask of our async chain, leaving e.g. PGlite's WAL dirty
    // and the data-dir lock held.
    const handler = async (signal: string) => {
      if (shutdownInProgress) {
        this.logger!.warn(
          `Received ${signal} again, continuing graceful shutdown...`,
        );
        return;
      }

      shutdownInProgress = true;
      nodeProcess.exit = ((code?: number) => {
        pendingExitCode ??= code ?? 0;
        return undefined as never;
      }) as typeof nodeProcess.exit;

      this.logger!.info(`Received ${signal}, starting graceful shutdown...`);

      const status = module.reactor.kill();

      try {
        await status.completed;
      } catch (error) {
        this.logger!.error("Shutdown failed waiting for reactor:", error);
        nodeProcess.exit = realExit;
        realExit(1);
        return;
      }

      for (const hook of this.shutdownHooks) {
        try {
          await hook();
        } catch (error) {
          this.logger!.error("Shutdown hook failed:", error);
        }
      }

      try {
        await module.database.destroy();
      } catch (error) {
        this.logger!.error("Shutdown failed destroying database:", error);
        nodeProcess.exit = realExit;
        realExit(1);
        return;
      }

      this.logger!.info("Shutdown complete");
      nodeProcess.exit = realExit;
      realExit(pendingExitCode ?? 0);
    };

    nodeProcess.prependListener("SIGINT", () => void handler("SIGINT"));
    nodeProcess.prependListener("SIGTERM", () => void handler("SIGTERM"));
  }
}
