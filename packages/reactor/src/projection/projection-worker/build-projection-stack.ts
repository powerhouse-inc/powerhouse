/**
 * In-worker projection stack builder.
 *
 * Mirrors {@link buildWorkerExecutor} but for the projection-side
 * read models. The worker owns one full copy of the storage stack — read
 * cache, operation index, document-meta cache — bound to its own
 * pg.Pool/Kysely, plus an in-process `ReadModelCoordinator` that
 * subscribes to a local `EventBus`.
 *
 * The host relays JOB_WRITE_READY into the local bus by calling
 * `relayWriteReady`, and forwards the local bus's JOB_READ_READY plus
 * READMODEL_* events back to the host bus via the IPC bridge.
 */

import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import { CollectionMembershipCache } from "../../cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../../cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../cache/write-cache-types.js";
import type { Database } from "../../core/types.js";
import { EventBus } from "../../events/event-bus.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
  type JobWriteReadyEvent,
  type ReadModelBatchCompletedEvent,
  type ReadModelIndexedEvent,
  type Unsubscribe,
} from "../../events/types.js";
import {
  defaultLoadFactory,
  type BuildWorkerExecutorOptions,
} from "../../executor/worker/build-worker-executor.js";
import type {
  FactorySpec,
  ModelManifestEntry,
} from "../../executor/worker/protocol.js";
import { ReadModelCoordinator } from "../../read-models/coordinator.js";
import { KyselyDocumentView } from "../../read-models/document-view.js";
import type { IReadModel } from "../../read-models/interfaces.js";
import { DocumentModelRegistry } from "../../registry/implementation.js";
import { ConsistencyTracker } from "../../shared/consistency-tracker.js";
import {
  KyselyDocumentIndexer,
  type IndexerDatabase,
} from "../../storage/kysely/document-indexer.js";
import { KyselyKeyframeStore } from "../../storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../../storage/kysely/store.js";
import type { Database as StorageDatabase } from "../../storage/kysely/types.js";
import { REACTOR_SCHEMA } from "../../storage/migrations/migrator.js";
import type {
  BuiltInReadModelKind,
  ProjectionInitMessage,
} from "../protocol.js";

export type ProjectionStackEvents = {
  onReadReady: (event: JobReadReadyEvent) => void;
  onReadModelIndexed: (event: ReadModelIndexedEvent) => void;
  onBatchCompleted: (event: ReadModelBatchCompletedEvent) => void;
};

export type ProjectionStack = {
  registry: DocumentModelRegistry;
  coordinator: ReadModelCoordinator;
  eventBus: EventBus;
  relayWriteReady(event: JobWriteReadyEvent): Promise<void>;
  getChainDepth(): number;
  drain(): Promise<void>;
  shutdown(): Promise<void>;
};

export type BuildProjectionStackOptions = {
  init: ProjectionInitMessage;
  database: Kysely<Database>;
  logger: ILogger;
  events: ProjectionStackEvents;
  loadFactory?: BuildWorkerExecutorOptions["loadFactory"];
  driveContainerTypes?: ReadonlySet<string>;
};

async function loadModelManifest(
  entries: ModelManifestEntry[],
  loadFactory: (spec: FactorySpec) => Promise<unknown>,
  registry: DocumentModelRegistry,
  logger: ILogger,
): Promise<void> {
  for (const entry of entries) {
    let module: DocumentModelModule;
    try {
      module = (await loadFactory(entry.spec)) as DocumentModelModule;
    } catch (error) {
      logger.error(
        "projection worker failed to load document model: @entry @error",
        entry,
        error,
      );
      throw error;
    }
    const [result] = registry.registerModules(module);
    if (result.status === "error") {
      logger.error(
        "projection worker failed to register document model: @entry @error",
        entry,
        result.error,
      );
      throw result.error;
    }
  }
}

function instantiateReadModel(
  kind: BuiltInReadModelKind,
  database: Kysely<Database>,
  operationStore: KyselyOperationStore,
  operationIndex: KyselyOperationIndex,
  writeCache: KyselyWriteCache,
): IReadModel {
  switch (kind) {
    case "document-view": {
      return new KyselyDocumentView(
        // @ts-expect-error - Database superset
        database,
        operationStore,
        operationIndex,
        writeCache,
        new ConsistencyTracker(),
      );
    }
    case "document-indexer": {
      return new KyselyDocumentIndexer(
        database as unknown as Kysely<IndexerDatabase>,
        operationIndex,
        writeCache,
        new ConsistencyTracker(),
      );
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(
        `unknown built-in read model kind: ${String(exhaustive)}`,
      );
    }
  }
}

async function initReadModels(
  models: IReadModel[],
  logger: ILogger,
): Promise<void> {
  for (const model of models) {
    const maybeInit = model as IReadModel & { init?: () => Promise<void> };
    if (typeof maybeInit.init !== "function") {
      continue;
    }
    try {
      await maybeInit.init();
    } catch (error) {
      logger.error(
        "projection worker read model init failed: @name @error",
        model.name,
        error,
      );
      throw error;
    }
  }
}

export async function buildProjectionStack(
  options: BuildProjectionStackOptions,
): Promise<ProjectionStack> {
  const { init, database: baseDatabase, logger, events } = options;
  const loadFactory = options.loadFactory ?? defaultLoadFactory;

  const registry = new DocumentModelRegistry();
  await loadModelManifest(init.models, loadFactory, registry, logger);

  const database = baseDatabase.withSchema(REACTOR_SCHEMA);
  const operationStore = new KyselyOperationStore(
    database as unknown as Kysely<StorageDatabase>,
  );
  const keyframeStore = new KyselyKeyframeStore(
    database as unknown as Kysely<StorageDatabase>,
  );

  const cacheConfig: WriteCacheConfig = {
    maxDocuments: 100,
    ringBufferSize: 10,
    keyframeInterval: 10,
  };
  const writeCache = new KyselyWriteCache(
    keyframeStore,
    operationStore,
    registry,
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
  void collectionMembershipCache;
  void documentMetaCache;

  const preReady = init.preReadyKinds.map((kind) =>
    instantiateReadModel(
      kind,
      database,
      operationStore,
      operationIndex,
      writeCache,
    ),
  );
  const postReady = init.postReadyKinds.map((kind) =>
    instantiateReadModel(
      kind,
      database,
      operationStore,
      operationIndex,
      writeCache,
    ),
  );

  await initReadModels([...preReady, ...postReady], logger);

  const eventBus = new EventBus();
  const subscriptions: Unsubscribe[] = [];

  subscriptions.push(
    eventBus.subscribe(
      ReactorEventTypes.JOB_READ_READY,
      (_t: number, event: JobReadReadyEvent) => {
        events.onReadReady(event);
      },
    ),
  );
  subscriptions.push(
    eventBus.subscribe(
      ReactorEventTypes.READMODEL_INDEXED,
      (_t: number, event: ReadModelIndexedEvent) => {
        events.onReadModelIndexed(event);
      },
    ),
  );
  subscriptions.push(
    eventBus.subscribe(
      ReactorEventTypes.READMODEL_BATCH_COMPLETED,
      (_t: number, event: ReadModelBatchCompletedEvent) => {
        events.onBatchCompleted(event);
      },
    ),
  );

  const coordinator = new ReadModelCoordinator(eventBus, preReady, postReady);
  coordinator.start();

  return {
    registry,
    coordinator,
    eventBus,
    async relayWriteReady(event: JobWriteReadyEvent): Promise<void> {
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, event);
    },
    getChainDepth(): number {
      return coordinator.getChainDepth();
    },
    async drain(): Promise<void> {
      await coordinator.drain();
    },
    shutdown(): Promise<void> {
      coordinator.stop();
      for (const unsub of subscriptions) {
        unsub();
      }
      return Promise.resolve();
    },
  };
}
