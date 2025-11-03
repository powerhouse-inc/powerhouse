import type { BaseDocumentDriveServer } from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder as DriveReactorBuilder,
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
import { DocumentModelRegistry } from "../registry/implementation.js";
import { KyselyDocumentIndexer } from "../storage/kysely/document-indexer.js";
import { KyselyKeyframeStore } from "../storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../storage/kysely/store.js";
import { Reactor } from "./reactor.js";
import type { Database, ReactorFeatures, ReactorSetup } from "./types.js";

import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";

/**
 * Builder for creating a complete Reactor setup with all dependencies.
 * Reduces test boilerplate from ~150 lines to ~10 lines.
 */
export class ReactorBuilder {
  private documentModels: DocumentModelModule<any>[] = [];
  private storage?: MemoryStorage;
  private features: ReactorFeatures = { legacyStorageEnabled: true };
  private includeDocumentView: boolean = false;
  private includeDocumentIndexer: boolean = false;
  private executorCount: number = 1;
  private writeCacheConfig?: Partial<WriteCacheConfig>;

  /**
   * Specify document model modules to register
   */
  withDocumentModels(models: DocumentModelModule<any>[]): this {
    this.documentModels = models;
    return this;
  }

  /**
   * Provide custom storage (defaults to new MemoryStorage())
   */
  withStorage(storage: MemoryStorage): this {
    this.storage = storage;
    return this;
  }

  /**
   * Configure feature flags
   */
  withFeatures(features: ReactorFeatures): this {
    this.features = { ...this.features, ...features };
    return this;
  }

  /**
   * Include document view in the setup
   */
  withDocumentView(): this {
    this.includeDocumentView = true;
    return this;
  }

  /**
   * Include document indexer in the setup
   */
  withDocumentIndexer(): this {
    this.includeDocumentIndexer = true;
    return this;
  }

  /**
   * Set number of executor instances
   */
  withExecutorCount(count: number): this {
    this.executorCount = count;
    return this;
  }

  /**
   * Configure write cache settings
   */
  withWriteCacheConfig(config: Partial<WriteCacheConfig>): this {
    this.writeCacheConfig = config;
    return this;
  }

  /**
   * Build and initialize the complete reactor setup
   */
  async build(): Promise<ReactorSetup> {
    const storage = this.storage || new MemoryStorage();

    const registry = new DocumentModelRegistry();
    if (this.documentModels.length > 0) {
      registry.registerModules(...this.documentModels);
    }

    const builder = new DriveReactorBuilder(this.documentModels).withStorage(
      storage,
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

    const operationStore = new KyselyOperationStore(db as any);
    const keyframeStore = new KyselyKeyframeStore(db as any);

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

    const executor = new SimpleJobExecutor(
      registry,
      storage,
      storage,
      operationStore,
      eventBus,
      writeCache,
      { legacyStorageEnabled: this.features.legacyStorageEnabled },
    );

    const executorManager = new SimpleJobExecutorManager(
      () => executor,
      eventBus,
      queue,
      jobTracker,
    );

    await executorManager.start(this.executorCount);

    const readModels: Array<KyselyDocumentView | KyselyDocumentIndexer> = [];

    let documentView: KyselyDocumentView | undefined;
    if (this.includeDocumentView) {
      documentView = new KyselyDocumentView(db as any, operationStore);
      await documentView.init();
      readModels.push(documentView);
    }

    let documentIndexer: KyselyDocumentIndexer | undefined;
    if (this.includeDocumentIndexer) {
      documentIndexer = new KyselyDocumentIndexer(db as any, operationStore);
      await documentIndexer.init();
      readModels.push(documentIndexer);
    }

    const readModelCoordinator = new ReadModelCoordinator(eventBus, readModels);
    readModelCoordinator.start();

    const reactor = new Reactor(
      driveServer,
      storage,
      queue,
      jobTracker,
      readModelCoordinator,
    );

    const cleanup = async () => {
      await executorManager.stop();
      readModelCoordinator.stop();
      await writeCache.shutdown();
      writeCache.clear();
      try {
        await db.destroy();
      } catch {
        // Ignore cleanup errors
      }
    };

    return {
      reactor,
      driveServer,
      storage,
      registry,
      eventBus,
      queue,
      jobTracker,
      executor,
      executorManager,
      operationStore,
      keyframeStore,
      writeCache,
      readModelCoordinator,
      db,
      documentView,
      documentIndexer,
      cleanup,
    };
  }
}
