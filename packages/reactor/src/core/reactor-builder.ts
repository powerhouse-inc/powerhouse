import type { UpgradeManifest } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import type {
  DbConfig,
  ModelManifestEntry,
  SignatureVerifierSpec,
  WorkerPoolConfig,
} from "../executor/worker/protocol.js";
import { WorkerPoolJobExecutorManager } from "../executor/worker-pool-job-executor-manager.js";
import type { WorkerFactory } from "../executor/worker-pool-job-executor-manager.js";
import { CollectionMembershipCache } from "../cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../cache/kysely-write-cache.js";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { WriteCacheConfig } from "../cache/write-cache-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import { EventBus } from "../events/event-bus.js";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes } from "../events/types.js";
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
import type {
  BuiltInReadModelKind,
  ProjectionWorkerFactory,
} from "../projection/index.js";
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
import {
  ConsistencyTracker,
  type IConsistencyTracker,
} from "../shared/consistency-tracker.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import {
  KyselyDocumentIndexer,
  type IndexerDatabase,
} from "../storage/kysely/document-indexer.js";
import { KyselyKeyframeStore } from "../storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../storage/kysely/store.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import {
  createForwardingPoolInstrumentation,
  instrumentPgPool,
  type ForwardingPoolInstrumentation,
  type PoolInstrumentation,
} from "../storage/pool-instrumentation.js";
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
import { resolveModelSources } from "./model-sources.js";
import type { DocumentModelSource } from "./model-sources.js";
import { Reactor } from "./reactor.js";
import type {
  Database,
  InProcessReactorModule,
  InProcessSyncModule,
  IReactor,
  ReactorFeatures,
} from "./types.js";

/**
 * Dependencies provided to read-model factories registered via
 * `withReadModelFactory`. These are constructed inside `buildModule()`, which
 * is why factory-based registration is needed for read models that depend on
 * them (`BaseReadModel` subclasses, in particular).
 */
export interface ReadModelFactoryDeps {
  operationIndex: IOperationIndex;
  writeCache: IWriteCache;
  processorManagerConsistencyTracker: IConsistencyTracker;
}

/**
 * Factory that builds a pre-ready read model from internal reactor
 * dependencies once they are available. Awaited during `buildModule()`.
 */
export type ReadModelFactory = (
  deps: ReadModelFactoryDeps,
) => IReadModel | Promise<IReadModel>;

export type {
  DocumentModelSource,
  FileModelSource,
  PackageModelSource,
  ResolvedModelSources,
} from "./model-sources.js";

type WorkerPoolBase = {
  /** Number of worker threads to spawn; also the sticky-routing modulus. */
  numWorkers: number;
  /**
   * Factory spec the default transport's workers import to instantiate
   * their signature verifier. Omitted = no executor-side verification,
   * parity with the in-process executor's default.
   */
  verifier?: SignatureVerifierSpec;
};

/**
 * Executor worker-pool configuration. Either `db` (default thread
 * transport; each worker opens its own Postgres pool) or a custom
 * `factory` transport is required by construction — an enabled pool
 * without connection info is unrepresentable.
 */
export type WorkerPoolOptions =
  | (WorkerPoolBase & { db: DbConfig; factory?: WorkerFactory })
  | (WorkerPoolBase & { db?: DbConfig; factory: WorkerFactory });

/**
 * Caller-facing config for {@link ReactorBuilder.withProjectionShards}.
 * When set, the builder replaces the in-process
 * {@link ReadModelCoordinator} with a {@link ProjectionShardManager} that
 * fans JOB_WRITE_READY events to N projection workers sharded by
 * documentId.
 *
 * @see Sharded projection workers sub-feature brief
 *   (Powerhouse board wiki id: eb26f01f-8f68-4918-a6f6-ac7a4679b533)
 */
export type ProjectionShardBuilderConfig = {
  shardCount: number;
  preReadyKinds: BuiltInReadModelKind[];
  postReadyKinds: BuiltInReadModelKind[];
  /**
   * Connection info for the projection workers' own pools. Falls back to
   * the executor worker pool's `db` when {@link ReactorBuilder.withWorkerPool}
   * is configured with one.
   */
  db?: DbConfig;
  poolSize?: number;
  initTimeoutMs?: number;
  shutdownGraceMs?: number;
  drainTimeoutMs?: number;
  chainDepthReportIntervalMs?: number;
};

function sameDatabaseTarget(a: DbConfig, b: DbConfig): boolean {
  return a.host === b.host && a.port === b.port && a.database === b.database;
}

export class ReactorBuilder {
  private logger?: ILogger;
  private documentModelSources: DocumentModelSource[] = [];
  private upgradeManifests: UpgradeManifest<readonly number[]>[] = [];
  private features: ReactorFeatures = { legacyStorageEnabled: false };
  private readModels: IReadModel[] = [];
  private readModelFactories: ReadModelFactory[] = [];
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
  private workerPool?: WorkerPoolOptions;
  private resolvedModelManifest?: ModelManifestEntry[];
  private projectionShardConfig?: ProjectionShardBuilderConfig;
  private projectionWorkerFactory?: ProjectionWorkerFactory;
  private instrumentedPools: PoolInstrumentation[] = [];

  withLogger(logger: ILogger): this {
    this.logger = logger;
    return this;
  }

  /**
   * Register document-model sources: live modules, importable files, or
   * importable packages. Appends across calls. At `buildModule()` every
   * source is resolved host-side and registered on the registry; file and
   * package sources additionally form the worker manifest when the worker
   * pool is enabled (live modules cannot cross a thread boundary).
   */
  withDocumentModelSources(sources: DocumentModelSource[]): this {
    this.documentModelSources.push(...sources);
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

  /**
   * Register a factory that builds a pre-ready read model after the reactor's
   * internal `operationIndex`, `writeCache`, and processor-manager consistency
   * tracker are constructed. Use this for read models (e.g. `BaseReadModel`
   * subclasses) that need those dependencies and therefore cannot be built
   * before calling `buildModule()`.
   */
  withReadModelFactory(factory: ReadModelFactory): this {
    this.readModelFactories.push(factory);
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

  /**
   * Register an externally-constructed pg.Pool's {@link PoolInstrumentation}
   * so it surfaces through {@link ReactorModule.pools}. Use this when the
   * caller built the pool itself (e.g. the in-process bench host wiring) so
   * pool acquire-wait and pool-stat metrics still emit. The builder also
   * registers any pool it constructs internally via {@link createPostgresDatabase}.
   */
  withInstrumentedPool(instrumentation: PoolInstrumentation): this {
    this.instrumentedPools.push(instrumentation);
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

  /**
   * Enable the executor worker pool: N `node:worker_threads` workers with
   * sticky per-document routing, replacing the in-process executor. Calling
   * this enables the pool — there is no `enabled` flag. Provide `db`
   * (each worker opens its own Postgres pool; the parent database is built
   * from it too unless {@link withKysely} is set) or a custom `factory`
   * transport. `verifier` is imported by the default transport's workers;
   * omitted = no executor-side signature verification.
   */
  withWorkerPool(options: WorkerPoolOptions): this {
    this.workerPool = options;
    return this;
  }

  /**
   * Configure N sharded projection workers. When set, the builder replaces
   * the default in-process {@link ReadModelCoordinator} with a
   * {@link ProjectionShardManager}.
   *
   * Projection workers open their own Postgres pools from `config.db`,
   * falling back to the executor worker pool's `db` when
   * {@link withWorkerPool} is configured with one; only the `poolSize` is
   * overridden by {@link ProjectionShardBuilderConfig.poolSize}. The same
   * model manifest resolved from {@link withDocumentModelSources} is
   * forwarded.
   */
  withProjectionShards(config: ProjectionShardBuilderConfig): this {
    this.projectionShardConfig = config;
    return this;
  }

  /**
   * Inject a custom {@link ProjectionWorkerFactory}. When set, the builder
   * skips default thread-transport wiring for the projection shards and
   * hands the factory directly to {@link ProjectionShardManager}.
   */
  withProjectionWorkerFactory(factory: ProjectionWorkerFactory): this {
    this.projectionWorkerFactory = factory;
    return this;
  }

  getResolvedModelManifest(): ModelManifestEntry[] | undefined {
    return this.resolvedModelManifest;
  }

  async build(): Promise<IReactor> {
    const module = await this.buildModule();
    return module.reactor;
  }

  async buildModule(): Promise<InProcessReactorModule> {
    if (!this.logger) {
      this.logger = new ConsoleLogger(["reactor"]);
    }

    // One resolution pass feeds both sides: the host registry gets every
    // resolved module (in both executor modes), and importable sources form
    // the worker manifest.
    const resolvedSources = await resolveModelSources(
      this.documentModelSources,
    );
    if (this.workerPool) {
      if (resolvedSources.manifest.length === 0) {
        throw new Error(
          "withWorkerPool requires at least one worker-importable document-model source ({ filePath } or { packageName }).",
        );
      }
      if (resolvedSources.moduleOnlyKeys.length > 0) {
        throw new Error(
          `withWorkerPool requires worker-importable sources, but these models were registered only as live modules: ${resolvedSources.moduleOnlyKeys.join(", ")}. Provide a { filePath } or { packageName } source for each.`,
        );
      }
    }
    this.resolvedModelManifest =
      resolvedSources.manifest.length > 0
        ? resolvedSources.manifest
        : undefined;

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
    if (resolvedSources.modules.length > 0) {
      const results = documentModelRegistry.registerModules(
        ...resolvedSources.modules,
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

    const reactorDbConfig = this.resolveReactorDbConfig();
    const baseDatabase =
      this.kyselyInstance ??
      (reactorDbConfig
        ? await this.createPostgresDatabase(reactorDbConfig)
        : await createDefaultDatabase());

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
    if (resolver instanceof DocumentModelResolver) {
      resolver.setModelLoadedHook((documentType) =>
        eventBus.emit(ReactorEventTypes.MODEL_LOADED, { documentType }),
      );
    }
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
    let executorStartCount = this.executorConfig.maxConcurrency ?? 1;
    if (!executorManager) {
      if (this.workerPool) {
        const pool = this.workerPool;
        let factory = pool.factory;
        if (!factory) {
          if (pool.db === undefined) {
            throw new Error(
              "unreachable: worker pool configured without db or factory",
            );
          }
          factory = await this.createDefaultWorkerFactory(
            pool.numWorkers,
            pool.db,
            pool.verifier,
          );
        }
        const poolManager = new WorkerPoolJobExecutorManager(
          factory,
          eventBus,
          queue,
          jobTracker,
          this.logger,
          resolver,
          collectionMembershipCache,
          this.executorConfig.jobTimeoutMs,
        );
        executorManager = poolManager;
        executorStartCount = pool.numWorkers;
        if (resolver instanceof DocumentModelResolver) {
          resolver.setBroadcastHook((entry) => poolManager.loadModel(entry));
        }
      } else {
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
    }

    await executorManager.start(executorStartCount);

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

    for (const factory of this.readModelFactories) {
      const readModel = await factory({
        operationIndex,
        writeCache,
        processorManagerConsistencyTracker,
      });
      readModelInstances.push(readModel);
    }

    const readModelCoordinator = this.readModelCoordinator
      ? this.readModelCoordinator
      : this.projectionShardConfig
        ? await this.createProjectionShardManager(
            this.projectionShardConfig,
            eventBus,
          )
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

    let syncModule: InProcessSyncModule | undefined = undefined;
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

    const module: InProcessReactorModule = {
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
      pools: this.instrumentedPools,
    };

    if (this.signalHandlersEnabled) {
      this.attachSignalHandlers(module);
    }

    return module;
  }

  /**
   * The single Postgres config for the parent, executor workers, and
   * projection shards. They must share one physical database (the parent
   * writes operations; workers and shards read them), so divergent
   * worker/shard targets throw. `withKysely` overrides the parent and is not
   * validated against a worker/shard `db`.
   */
  private resolveReactorDbConfig(): DbConfig | undefined {
    const workerDb = this.workerPool?.db;
    const projectionDb = this.projectionShardConfig?.db;
    if (
      workerDb &&
      projectionDb &&
      !sameDatabaseTarget(workerDb, projectionDb)
    ) {
      throw new Error(
        "withWorkerPool({ db }) and withProjectionShards({ db }) must address the same Postgres database (same host, port, and database); the parent writes operations there and the projection shards read them.",
      );
    }
    return workerDb ?? projectionDb;
  }

  /**
   * Constructs a {@link ProjectionShardManager} bound to the host event
   * bus. Builds the default thread-transport factory unless one was
   * injected via {@link withProjectionWorkerFactory}. Calls
   * `manager.startup()` so all N workers reach READY before the reactor
   * is returned to the caller.
   */
  private async createProjectionShardManager(
    config: ProjectionShardBuilderConfig,
    eventBus: IEventBus,
  ): Promise<IReadModelCoordinator> {
    const baseDb = this.resolveReactorDbConfig();
    if (!baseDb) {
      throw new Error(
        "withProjectionShards requires a db (or an executor worker pool configured with one); projection workers need connection info to open their own pools.",
      );
    }
    const models = this.resolvedModelManifest ?? [];
    const db: DbConfig = {
      ...baseDb,
      poolSize: config.poolSize ?? baseDb.poolSize,
      applicationName: "reactor-projection-shard",
    };
    const factory =
      this.projectionWorkerFactory ??
      (await this.createDefaultProjectionWorkerFactory());
    const poolInstrumentations: ForwardingPoolInstrumentation[] = [];
    for (let i = 0; i < config.shardCount; i++) {
      const forwarder = createForwardingPoolInstrumentation(
        `projection-shard-${i}`,
      );
      poolInstrumentations.push(forwarder);
      this.instrumentedPools.push(forwarder);
    }
    const { ProjectionShardManager } =
      await import("../projection/projection-shard-manager.js");
    const manager = new ProjectionShardManager({
      shardCount: config.shardCount,
      db,
      models,
      preReadyKinds: config.preReadyKinds,
      postReadyKinds: config.postReadyKinds,
      factory,
      logger: this.logger!,
      hostBus: eventBus,
      initTimeoutMs: config.initTimeoutMs,
      shutdownGraceMs: config.shutdownGraceMs,
      drainTimeoutMs: config.drainTimeoutMs,
      chainDepthReportIntervalMs: config.chainDepthReportIntervalMs,
      poolInstrumentations,
    });
    await manager.startup();
    this.shutdownHooks.push(() => manager.shutdown());
    return manager;
  }

  private async createDefaultProjectionWorkerFactory(): Promise<ProjectionWorkerFactory> {
    const [{ createProjectionThreadTransport }, { projectionWorkerEntryPath }] =
      await Promise.all([
        import("../projection/transport.js"),
        import("../projection/projection-worker/index.js"),
      ]);
    return () => createProjectionThreadTransport(projectionWorkerEntryPath);
  }

  /**
   * Default {@link WorkerFactory} used when the pool options carry no
   * custom `factory`. Each worker spawns a real `node:worker_threads`
   * Worker pointing at the compiled `worker/entry.js`.
   */
  private async createDefaultWorkerFactory(
    numWorkers: number,
    db: DbConfig,
    signatureVerifier: SignatureVerifierSpec | undefined,
  ): Promise<WorkerFactory> {
    const [{ WorkerHandle }, { createThreadTransport }, { workerEntryPath }] =
      await Promise.all([
        import("../executor/worker/worker-handle.js"),
        import("../executor/worker/transport.js"),
        import("../executor/worker/index.js"),
      ]);
    // The wire protocol keeps its full shape; only "thread" is implemented.
    const poolConfig: WorkerPoolConfig = {
      enabled: true,
      numWorkers,
      workerType: "thread",
    };
    const models = this.resolvedModelManifest ?? [];
    const logger = this.logger!;
    return (index: number) => {
      const workerId = `reactor-worker-${index}`;
      const poolInstrumentation = createForwardingPoolInstrumentation(workerId);
      this.instrumentedPools.push(poolInstrumentation);
      return new WorkerHandle({
        workerId,
        index,
        transport: createThreadTransport(workerEntryPath),
        initPayload: {
          poolConfig,
          db,
          signatureVerifier,
          models,
        },
        logger,
        poolInstrumentation,
      });
    };
  }

  /**
   * Builds the parent Kysely instance against a real Postgres server using
   * the same {@link DbConfig} the workers receive at init. Used in the
   * worker-pool path so the parent reactor and each worker thread share
   * storage; PGlite cannot be shared across threads. The constructed pool
   * is wrapped with {@link instrumentPgPool} and the resulting
   * {@link PoolInstrumentation} is pushed onto {@link instrumentedPools} so
   * the reactor module exposes acquire-wait and pool-stat surfaces.
   */
  private async createPostgresDatabase(
    config: DbConfig,
  ): Promise<Kysely<Database>> {
    const { Kysely, PostgresDialect } = await import("kysely");
    const pgModule = await import("pg");
    const Pool = pgModule.default.Pool;
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      application_name: config.applicationName,
      max: config.poolSize,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      idleTimeoutMillis: config.idleTimeoutMillis,
    });
    this.instrumentedPools.push(
      instrumentPgPool(pool, config.applicationName ?? "reactor-host"),
    );
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  private attachSignalHandlers(module: InProcessReactorModule): void {
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
