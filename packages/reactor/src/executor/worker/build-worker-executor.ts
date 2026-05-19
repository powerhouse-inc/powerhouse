import type {
  DocumentModelModule,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import { CollectionMembershipCache } from "../../cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../../cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../cache/write-cache-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../core/drive-container-types.js";
import type { Database } from "../../core/types.js";
import { EventBus } from "../../events/event-bus.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../events/types.js";
import { DocumentModelRegistry } from "../../registry/implementation.js";
import type { JobMeta } from "../../shared/types.js";
import type { SignatureVerificationHandler } from "../../signer/types.js";
import { KyselyKeyframeStore } from "../../storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../../storage/kysely/store.js";
import type { Database as StorageDatabase } from "../../storage/kysely/types.js";
import { REACTOR_SCHEMA } from "../../storage/migrations/migrator.js";
import { KyselyExecutionScope } from "../execution-scope.js";
import { SimpleJobExecutor } from "../simple-job-executor.js";
import type { JobExecutorConfig } from "../types.js";
import type {
  FactorySpec,
  InitMessage,
  ModelManifestEntry,
} from "./protocol.js";

/**
 * In-worker capture of the JOB_WRITE_READY event emitted by the executor.
 * The worker forwards `operations` and `jobMeta` back to the parent; the
 * parent re-enriches `collectionMemberships` at emit time.
 */
export type WorkerWriteReadyCapture = {
  operations: OperationWithContext[];
  jobMeta: JobMeta;
};

export type WorkerExecutorStack = {
  executor: SimpleJobExecutor;
  registry: DocumentModelRegistry;
  /**
   * Synchronously pops the most-recent JOB_WRITE_READY captured on this
   * worker's local event bus and clears it. Returns null if the executor
   * did not produce one for this job.
   */
  takeLastWriteReady(): WorkerWriteReadyCapture | null;
};

export type BuildWorkerExecutorOptions = {
  init: InitMessage;
  database: Kysely<Database>;
  logger: ILogger;
  executorConfig?: JobExecutorConfig;
  driveContainerTypes?: ReadonlySet<string>;
  /**
   * Override the module loader used to materialize factory specs. Tests
   * can inject a deterministic resolver instead of touching the real
   * Node module loader.
   */
  loadFactory?: (spec: FactorySpec) => Promise<unknown>;
};

export async function defaultLoadFactory(spec: FactorySpec): Promise<unknown> {
  const ref = spec.module;
  const specifier =
    "filePath" in ref ? new URL(`file://${ref.filePath}`).href : ref.packageName;
  const mod = (await import(specifier)) as Record<string, unknown>;
  const exported = mod[ref.exportName];
  if (typeof exported === "function") {
    return (exported as (args: unknown) => unknown)(spec.initArgs);
  }
  return exported;
}

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
        "worker failed to load document model: @entry @error",
        entry,
        error,
      );
      throw error;
    }
    const [result] = registry.registerModules(module);
    if (result.status === "error") {
      logger.error(
        "worker failed to register document model: @entry @error",
        entry,
        result.error,
      );
      throw result.error;
    }
  }
}

/**
 * Assembles the in-worker storage stack plus a {@link SimpleJobExecutor}
 * bound to a pre-built Kysely instance. The parent owns the wire protocol
 * and routing; the worker owns everything below `SimpleJobExecutor`.
 *
 * The local event bus exists only to satisfy the executor's contract: its
 * JOB_WRITE_READY emissions are captured here and shipped to the parent
 * via {@link WorkerExecutorStack.takeLastWriteReady}.
 */
export async function buildWorkerExecutor(
  options: BuildWorkerExecutorOptions,
): Promise<WorkerExecutorStack> {
  const { init, database: baseDatabase, logger } = options;
  const driveContainerTypes =
    options.driveContainerTypes ?? DEFAULT_DRIVE_CONTAINER_TYPES;
  const loadFactory = options.loadFactory ?? defaultLoadFactory;

  const registry = new DocumentModelRegistry();
  await loadModelManifest(init.models, loadFactory, registry, logger);

  let signatureVerifier: SignatureVerificationHandler | undefined;
  try {
    signatureVerifier = (await loadFactory(
      init.signatureVerifier,
    )) as SignatureVerificationHandler;
  } catch (error) {
    logger.error(
      "worker failed to load signature verifier: @spec @error",
      init.signatureVerifier,
      error,
    );
    throw error;
  }

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

  const executionScope = new KyselyExecutionScope(
    database as unknown as Kysely<StorageDatabase>,
    operationStore,
    operationIndex,
    keyframeStore,
    writeCache,
    documentMetaCache,
    collectionMembershipCache,
  );

  const eventBus = new EventBus();
  let lastWriteReady: WorkerWriteReadyCapture | null = null;
  eventBus.subscribe(
    ReactorEventTypes.JOB_WRITE_READY,
    (_t: number, event: JobWriteReadyEvent) => {
      lastWriteReady = {
        operations: event.operations,
        jobMeta: event.jobMeta,
      };
    },
  );

  const executorConfig = options.executorConfig ?? {};
  const executor = new SimpleJobExecutor(
    logger,
    registry,
    operationStore,
    eventBus,
    writeCache,
    operationIndex,
    documentMetaCache,
    collectionMembershipCache,
    driveContainerTypes,
    executorConfig,
    signatureVerifier,
    executionScope,
  );

  return {
    executor,
    registry,
    takeLastWriteReady(): WorkerWriteReadyCapture | null {
      const captured = lastWriteReady;
      lastWriteReady = null;
      return captured;
    },
  };
}
