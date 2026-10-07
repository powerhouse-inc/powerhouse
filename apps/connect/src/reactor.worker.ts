import {
  ChannelScheme,
  DocumentIntegrityService,
  DriveCollectionId,
  HardenedPGliteDialect,
  InMemoryQueue,
  queryThroughDialect,
  ReactorBuilder,
  ReactorClientBuilder,
  type ChannelConfig,
  type Database,
  type ICatchUp,
  type IReactor,
  type ISyncManager,
  type JwtHandler,
  type ReactorFeatureFlags,
  type Remote,
  type RemoteFilter,
  type RemoteOptions,
  type UnsupportedStoredDocuments,
} from "@powerhousedao/reactor";
import { baseDocumentModels } from "@powerhousedao/reactor-browser/base-document-models";
import {
  FORWARDED_EVENT_TYPES,
  ReactorHost,
  SYNC_STATUS_CHANGED_EVENT,
  WorkerPackageLoader,
  type ReactorIdentity,
  type WorkerMigrationState,
  type WorkerPackageSource,
} from "@powerhousedao/reactor-browser/rpc";
import type {
  PeerManifest,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  createRelationalDb,
  type IProcessorManager,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import * as commonDocumentModels from "@powerhousedao/powerhouse-vetra-packages/document-models";
import {
  loadFlaggedDocumentModels,
  toDocumentModelModules,
} from "./reactor-worker-models.js";
import {
  createWorkerModelRegistrar,
  type WorkerModelRegistrar,
} from "./reactor-worker-registry.js";
import {
  BrowserKeyStorage,
  RenownCryptoBuilder,
  type RenownCryptoSigner,
} from "@renown/sdk/crypto";
import { createWorkerSignerConfig } from "./reactor-worker-signer.js";
import type { RenownTrustEndpoints } from "./utils/renown-trust.js";
import { closeWithin } from "./utils/close-within.js";
import { createWorkerStores } from "./utils/worker-stores.js";
import { reloadOnPoisonedStore } from "./utils/poisoned-store-reload.js";
import { createStoreLocks } from "./utils/store-lock.js";
import { toStoredDocumentsRefused } from "./utils/stored-documents-refused.js";
import type * as PgLiveModuleNs from "@electric-sql/pglite/live";
import { Kysely } from "kysely";
import { readPgVersionFile } from "./utils/pglite-idb.js";
import {
  coerceMajor,
  CURRENT_PG_MAJOR,
  type DetectedMajor,
  loadPGliteModule,
  resolvePgMajorForRuntime,
  type SupportedPgMajor,
} from "./utils/pglite-major.js";
import {
  type BackupStrategy,
  type FileDataEntry,
  clearFileData,
  migrateIdb,
  readFileData,
  writeFileData,
} from "./utils/pglite-migrate-core.js";

console.info("[reactor.worker] module evaluating");

// Common models the tab bundles as a local package; not CDN-loadable, so the
// worker imports them directly. Vetra and workflow are flag-gated chunks.
const commonBundledModels = toDocumentModelModules(
  Object.values(commonDocumentModels),
);

type WorkerConstruct = {
  namespace: string;
  relationalNamespace: string;
  cdnUrl: string;
  packageSpecs: string[];
  // Absolute-URL shared-deps import map from the main thread; lets package
  // sources that import shared deps load as blobs in the worker (import
  // maps don't apply here).
  sharedImports?: Record<string, string>;
  studioMode?: boolean;
  // Loads the workflow package's document models. Independent of studioMode.
  workflowsEnabled?: boolean;
  // The worker has no runtime config, so the chain its bearer tokens are scoped
  // to is passed in; leaving it unset would sign for a chain nobody issues on.
  renownChainId?: number;
  // Same reason: enforcement flags arrive from the tab. Absent means all off,
  // which is what a tab on an older build sends.
  featureFlags?: Partial<ReactorFeatureFlags>;
  // What new documents are created as; absent means the reactor's default.
  createSignaturePolicy?: SignaturePolicy;
  // Absent means the reactor's default, refuse.
  unsupportedStoredDocuments?: UnsupportedStoredDocuments;
  // Where the trust policy verifies signers under authEnforcement.
  renownEndpoints?: RenownTrustEndpoints;
  // URL-addressed packages (local project models the registry cannot serve).
  packageSources?: WorkerPackageSource[];
};

let loader: WorkerPackageLoader | undefined;
let registrar: WorkerModelRegistrar | undefined;
let signer: RenownCryptoSigner | undefined;
let syncManager: ISyncManager | undefined;
let reactorInstance: IReactor | undefined;
type RelationalState = {
  pg?: PgLiveModuleNs.PGliteWithLive;
  db?: IRelationalDb;
  /** The Kysely `db` wraps; RPC SQL goes through its queue, not at the client. */
  kysely?: Kysely<unknown>;
};
const relational: RelationalState = {};
type OwnedStorage = {
  reactorPg?: {
    close: () => Promise<void>;
  };
  /** The one Kysely over the reactor store; inspector SQL goes through its queue. */
  reactorDb?: Kysely<Database>;
  reactorIdb?: string;
  relationalIdb?: string;
  reactorNamespace?: string;
  relationalNamespace?: string;
};
const owned: OwnedStorage = {};
// Another worker (a retired one, or a second gen) may still have these stores open.
const storeLocks = createStoreLocks();
let inspectorQueue: InMemoryQueue | undefined;
let inspectorProcessors: IProcessorManager | undefined;
let inspectorIntegrity: DocumentIntegrityService | undefined;
let inspectorCatchUp: ICatchUp | undefined;
let currentIdentity: ReactorIdentity | null = null;

// Cloneable projection of a Remote: meta (carries channelConfig) + connection snapshot.
function toWireRemote(remote: Remote) {
  return {
    meta: remote.meta,
    connectionState: remote.channel.getConnectionState(),
  };
}

// Rebuild renown crypto from the shared renownKeyDB keypair (origin-scoped IndexedDB).
async function buildWorkerCrypto(chainId: number | undefined) {
  const keyStorage = await BrowserKeyStorage.create();
  const builder = new RenownCryptoBuilder().withKeyPairStorage(keyStorage);
  if (chainId !== undefined) {
    builder.withChainId(chainId);
  }
  return builder.build();
}

// Open against the major already on disk so a legacy PG16 dir isn't read by PG17.
async function openReactorPglite(namespace: string) {
  await storeLocks.acquire(namespace);
  const detected = coerceMajor(await readPgVersionFile(`/pglite/${namespace}`));
  const major = resolvePgMajorForRuntime(detected);
  if (major !== 17) {
    console.warn(
      `[reactor.worker] Running against legacy PGlite data dir (Postgres ${major}). Migrate to PG17 from the Connect banner or the Inspector.`,
    );
  }
  const { PGlite } = await loadPGliteModule(major);
  const pg = new PGlite(`idb://${namespace}`, { relaxedDurability: true });
  await pg.waitReady;
  return { pg, detected };
}

type PgLiveModule = typeof PgLiveModuleNs;

async function loadPgLive(major: SupportedPgMajor): Promise<PgLiveModule> {
  if (major === 16) {
    return import("pglite-legacy-02/live") as unknown as Promise<PgLiveModule>;
  }
  return import("@electric-sql/pglite/live");
}

// Called only after boot, by which point `host` exists.
const onStorePoisoned = reloadOnPoisonedStore((reason, gen) =>
  host.retireAndReload(reason, gen),
);

async function openRelational(namespace: string): Promise<DetectedMajor> {
  let pg: { close: () => Promise<void> } | undefined;
  try {
    await storeLocks.acquire(namespace);
    const detected = coerceMajor(
      await readPgVersionFile(`/pglite/${namespace}`),
    );
    const major = resolvePgMajorForRuntime(detected);
    if (major !== 17) {
      console.warn(
        `[reactor.worker] Relational store opening legacy PGlite data dir (Postgres ${major}). Migrate to PG17 from the Connect banner or the Inspector.`,
      );
    }
    const [{ PGlite }, { live }] = await Promise.all([
      loadPGliteModule(major),
      loadPgLive(major),
    ]);
    const opened = new PGlite(`idb://${namespace}`, {
      relaxedDurability: true,
      extensions: { live },
    });
    pg = opened;
    await opened.waitReady;
    relational.pg = opened as unknown as PgLiveModuleNs.PGliteWithLive;
    const relationalKysely = new Kysely<unknown>({
      dialect: new HardenedPGliteDialect(opened, {
        onPoisoned: onStorePoisoned,
      }),
    });
    relational.kysely = relationalKysely;
    relational.db = createRelationalDb(relationalKysely);
    console.info(
      `[reactor.worker] Relational store opened: idb://${namespace} (Postgres ${major}).`,
    );
    return detected;
  } catch (error) {
    console.error(
      "[reactor.worker] Failed to open the relational store:",
      error,
    );
    relational.pg = undefined;
    relational.db = undefined;
    relational.kysely = undefined;
    await stores.releaseFailedOpen(namespace, pg);
    return null;
  }
}

let migrationState: WorkerMigrationState = { status: "idle" };

function setMigration(state: WorkerMigrationState): void {
  migrationState = state;
  host.setMigrationState(state);
}

const inMemoryBackup: BackupStrategy = {
  snapshot: (idbName) => readFileData(idbName),
  rollback: (handle, idbName) =>
    writeFileData(idbName, handle as FileDataEntry[]),
  discard: () => Promise.resolve(),
  commit: () => Promise.resolve(),
};

async function closeUnbounded(
  store: { close: () => Promise<void> } | undefined,
): Promise<boolean> {
  try {
    await store?.close();
    return true;
  } catch (error) {
    console.error("[reactor.worker] closing a store failed:", error);
    return false;
  }
}

const RETIRE_STOP_MS = 5_000;

// A poisoned statement can hold up the reactor's stop, so it is bounded.
async function stopReactorWithin(timeoutMs: number): Promise<void> {
  const stopping = Promise.allSettled([
    syncManager?.shutdown().completed,
    reactorInstance?.kill().completed,
  ]);
  syncManager = undefined;
  reactorInstance = undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.error(
        `[reactor.worker] reactor stop did not finish within ${timeoutMs}ms`,
      );
      resolve();
    }, timeoutMs);
  });
  await Promise.race([stopping, expired]);
  clearTimeout(timer);
}

const stores = createWorkerStores({
  locks: storeLocks,
  stopReactor: () => stopReactorWithin(RETIRE_STOP_MS),
  relational: () => ({
    namespace: owned.relationalNamespace,
    store: relational.pg,
  }),
  reactor: () => ({
    namespace: owned.reactorNamespace,
    store: owned.reactorPg,
  }),
  forget: () => {
    relational.pg = undefined;
    relational.db = undefined;
    relational.kysely = undefined;
    owned.reactorPg = undefined;
    owned.reactorDb = undefined;
  },
  isRetired: () => host.retired,
  retireWorker: (reason) => host.retireAndReload(reason, crypto.randomUUID()),
});

const workerName = (self as { name?: string }).name ?? "";

const host = new ReactorHost({
  namespace: workerName,
  onRetire: () => stores.retire(),
  onAdminRestart: () =>
    host.broadcastReload("admin restart", crypto.randomUUID()),
  onAdminClearStorage: () =>
    stores.runAdmin({
      close: closeWithin,
      run: async () => {
        for (const idbName of [owned.reactorIdb, owned.relationalIdb]) {
          if (idbName) {
            await clearFileData(idbName);
          }
        }
        return "storage cleared";
      },
      failed: "clearing storage failed",
    }),
  onAdminMigrate: () =>
    stores.runAdmin({
      close: closeUnbounded,
      begin: () =>
        setMigration({
          status: "migrating",
          legacyMajor: migrationState.legacyMajor,
        }),
      run: async () => {
        try {
          for (const idbName of [owned.reactorIdb, owned.relationalIdb]) {
            if (idbName) {
              await migrateIdb(
                idbName,
                (phase) =>
                  setMigration({
                    status: "migrating",
                    legacyMajor: migrationState.legacyMajor,
                    phase,
                  }),
                inMemoryBackup,
              );
            }
          }
          return "migration complete";
        } catch (error) {
          console.error("[reactor.worker] Migration failed:", error);
          setMigration({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
          return "migration failed";
        }
      },
      failed: "migration failed",
    }),
  build: async (raw) => {
    let phase = "init";
    try {
      const construct = raw as WorkerConstruct;
      phase = "loading packages";
      console.info(`[reactor.worker] boot: ${phase}`);
      loader = new WorkerPackageLoader({
        cdnUrl: construct.cdnUrl,
        importPackage: (url) =>
          import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
        sharedImports: construct.sharedImports,
        importSource: (source) =>
          import(
            /* @vite-ignore */ URL.createObjectURL(
              new Blob([source], { type: "text/javascript" }),
            )
          ) as Promise<Record<string, unknown>>,
      });
      await loader.loadPackages(construct.packageSpecs);
      // URL-addressed packages: the project's own models in dev, prebuilt
      // bundles under __reactor_worker__/packages/ in production.
      await loader.loadSources(construct.packageSources ?? []);
      const flaggedModels = await loadFlaggedDocumentModels({
        studioMode: construct.studioMode,
        workflowsEnabled: construct.workflowsEnabled,
      });
      const staticModels = baseDocumentModels.concat(
        commonBundledModels,
        flaggedModels,
      );
      const models = staticModels.concat(loader.models);
      phase = "opening pglite stores";
      console.info(`[reactor.worker] boot: ${phase}`);

      owned.reactorNamespace = construct.namespace;
      owned.relationalNamespace = construct.relationalNamespace;
      //this has to be serial: concurrent PGlite constructors consume the same
      // cached one-shot wasm "Response" object
      const reactor = await openReactorPglite(construct.namespace);
      const relationalMajor = await openRelational(
        construct.relationalNamespace,
      );
      const pg = reactor.pg;
      owned.reactorPg = pg;
      owned.reactorDb = new Kysely<Database>({
        dialect: new HardenedPGliteDialect(pg, { onPoisoned: onStorePoisoned }),
      });
      owned.reactorIdb = `/pglite/${construct.namespace}`;
      owned.relationalIdb = `/pglite/${construct.relationalNamespace}`;
      // A store is migratable when coerceMajor kept it (a supported legacy
      // major) and it is not the current one; openers already read PG_VERSION.
      const legacyMajor = [reactor.detected, relationalMajor].find(
        (m): m is SupportedPgMajor => m !== null && m !== CURRENT_PG_MAJOR,
      );
      if (legacyMajor !== undefined) {
        setMigration({ status: "needed", legacyMajor });
      }
      phase = "building crypto";
      console.info(`[reactor.worker] boot: ${phase}`);
      const crypto = await buildWorkerCrypto(construct.renownChainId);
      phase = "building signer";
      const built = await createWorkerSignerConfig(
        crypto,
        construct,
        currentIdentity ?? undefined,
      );
      signer = built.signer;
      const jwtHandler: JwtHandler = async () =>
        currentIdentity
          ? crypto.getBearerToken(currentIdentity.address, { expiresIn: 10 })
          : undefined;
      phase = "building reactor module";
      console.info(`[reactor.worker] boot: ${phase}`);
      const reactorBuilder = new ReactorBuilder()
        .withDocumentModelSources(models)
        .withChannelScheme(ChannelScheme.CONNECT)
        .withExecutorConfig({ featureFlags: construct.featureFlags ?? {} })
        .withJwtHandler(jwtHandler)
        .withKysely(owned.reactorDb);
      if (construct.unsupportedStoredDocuments) {
        reactorBuilder.withUnsupportedStoredDocuments(
          construct.unsupportedStoredDocuments,
        );
      }
      const builder = new ReactorClientBuilder()
        .withSigner(built.signerConfig)
        .withReactorBuilder(reactorBuilder);
      builder.withDocumentModelLoader(loader);
      if (construct.createSignaturePolicy) {
        builder.withCreateSignaturePolicy(construct.createSignaturePolicy);
      }
      const module = await builder.buildModule();
      const registry = module.reactorModule?.documentModelRegistry;
      registrar = registry
        ? createWorkerModelRegistrar(registry, staticModels)
        : undefined;
      syncManager = module.reactorModule?.syncModule?.syncManager;
      reactorInstance = module.reactorModule?.reactor;
      const rm = module.reactorModule;
      if (rm) {
        inspectorQueue =
          rm.queue instanceof InMemoryQueue ? rm.queue : undefined;
        inspectorProcessors = rm.processorManager;
        inspectorCatchUp = rm.catchUp;
        inspectorIntegrity = new DocumentIntegrityService(
          rm.keyframeStore,
          rm.operationStore,
          rm.writeCache,
          rm.documentView,
          rm.documentModelRegistry,
        );
      }
      registrar?.markRegistered(models);
      // Manifests ride along in the models entries the loader imported; the
      // builder only saw the modules.
      registrar?.syncManifests(loader.upgradeManifests);
      for (const type of FORWARDED_EVENT_TYPES) {
        module.eventBus.subscribe(type, (forwardedType, event) =>
          host.broadcastBusEvent(forwardedType, event),
        );
      }
      syncManager?.onSyncStatusChange((documentId, status) =>
        host.broadcastBusEvent(SYNC_STATUS_CHANGED_EVENT, {
          documentId,
          status,
        }),
      );
      console.info("[reactor.worker] boot: complete");
      return module.client;
    } catch (error) {
      console.error(`[reactor.worker] boot failed at phase "${phase}":`, error);
      // The next hello rebuilds, which reopens both stores.
      await stores.releaseAfterBootFailure();
      throw toStoredDocumentsRefused(error);
    }
  },
  registerPackages: async (specs, sources) => {
    if (!loader) {
      return;
    }
    await loader.loadPackages(specs);
    const { types, failures } = await loader.reloadSources(sources ?? []);
    if (registrar) {
      registrar.replaceFamilies(types, loader.models);
      registrar.syncManifests(loader.upgradeManifests);
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.error),
        `Failed to reload package source(s): ${failures.map((failure) => failure.name).join(", ")}`,
      );
    }
  },
  onIdentity: (user) => {
    currentIdentity = user;
    if (signer) {
      signer.user = user ?? undefined;
    }
  },
  onSyncOp: async (method, args) => {
    if (!syncManager) {
      throw new Error("SyncManager not available");
    }
    switch (method) {
      case "list":
        return syncManager.list().map(toWireRemote);
      case "add": {
        const [name, collectionIdKey, channelConfig, filter, options] =
          args as [
            string,
            string,
            ChannelConfig,
            RemoteFilter | undefined,
            RemoteOptions | undefined,
          ];
        const remote = await syncManager.add(
          name,
          DriveCollectionId.fromKey(collectionIdKey),
          channelConfig,
          filter,
          options,
        );
        return toWireRemote(remote);
      }
      case "bindRemote":
        await syncManager.bindRemote(args[0] as string, args[1] as string);
        return undefined;
      case "setPeerManifest":
        await syncManager.setPeerManifest(
          args[0] as string,
          args[1] as PeerManifest | null,
        );
        return undefined;
      case "peerAgreementBasis":
        return syncManager.agreement().basis();
      case "listHolds":
        return syncManager.listHolds(
          args[0] as { remoteName?: string; documentId?: string } | undefined,
        );
      case "remove":
        await syncManager.remove(args[0] as string);
        return undefined;
      case "triggerPull":
        syncManager.triggerPull(args[0] as string);
        return undefined;
      default:
        throw new Error(`Unknown sync op: ${method}`);
    }
  },
  onDbOp: async (method, args) => {
    if (!relational.kysely) {
      throw new Error("Relational store not available");
    }
    switch (method) {
      case "query": {
        const [sql, params] = args as [string, unknown[]];
        return queryThroughDialect(relational.kysely, sql, params);
      }
      default:
        throw new Error(`Unknown db op: ${method}`);
    }
  },
  onLiveQuery: async (sql, params, onResults) => {
    if (!relational.pg) {
      throw new Error("Relational store not available");
    }
    const live = await relational.pg.live.query(sql, params, (results) =>
      onResults(results),
    );
    return () => {
      void live.unsubscribe();
    };
  },
  onInspectorOp: async (method, args) => {
    switch (method) {
      case "queue.getState": {
        if (!inspectorQueue) {
          return {
            isPaused: false,
            pendingJobs: [],
            executingJobs: [],
            totalPending: 0,
            totalExecuting: 0,
          };
        }
        const pendingJobs = inspectorQueue.getPendingJobs();
        const executingJobs = [];
        for (const jobIds of inspectorQueue.getExecutingJobIds().values()) {
          for (const jobId of jobIds) {
            const job = inspectorQueue.getJob(jobId);
            if (job) {
              executingJobs.push(job);
            }
          }
        }
        return {
          isPaused: inspectorQueue.paused,
          pendingJobs,
          executingJobs,
          totalPending: pendingJobs.length,
          totalExecuting: executingJobs.length,
        };
      }
      case "queue.pause":
        inspectorQueue?.pause();
        return undefined;
      case "queue.resume":
        await inspectorQueue?.resume();
        return undefined;
      case "processors.getAll":
        return (inspectorProcessors?.getAll() ?? []).map((tracked) => ({
          processorId: tracked.processorId,
          factoryId: tracked.factoryId,
          driveId: tracked.driveId,
          processorIndex: tracked.processorIndex,
          lastOrdinal: tracked.lastOrdinal,
          status: tracked.status,
          lastError: tracked.lastError,
          lastErrorTimestamp: tracked.lastErrorTimestamp,
        }));
      case "processors.retry": {
        const [processorId] = args as [string];
        await inspectorProcessors?.get(processorId)?.retry();
        return undefined;
      }
      case "catchUp.status":
        if (!inspectorCatchUp) {
          throw new Error("Catch-up not available");
        }
        return inspectorCatchUp.status();
      case "catchUp.sweepNow":
        if (!inspectorCatchUp) {
          throw new Error("Catch-up not available");
        }
        return inspectorCatchUp.sweepNow();
      case "integrity.validate": {
        if (!inspectorIntegrity) {
          throw new Error("Integrity service not available");
        }
        const [documentId, branch] = args as [string, string?];
        return inspectorIntegrity.validateDocument(documentId, branch);
      }
      case "integrity.rebuildKeyframes": {
        if (!inspectorIntegrity) {
          throw new Error("Integrity service not available");
        }
        const [documentId, branch] = args as [string, string?];
        return inspectorIntegrity.rebuildKeyframes(documentId, branch);
      }
      case "integrity.rebuildSnapshots": {
        if (!inspectorIntegrity) {
          throw new Error("Integrity service not available");
        }
        const [documentId, branch] = args as [string, string?];
        return inspectorIntegrity.rebuildSnapshots(documentId, branch);
      }
      case "db.query": {
        if (!owned.reactorDb) {
          throw new Error("Reactor store not available");
        }
        const [sql, params] = args as [string, unknown[]];
        return queryThroughDialect(owned.reactorDb, sql, params);
      }
      default:
        throw new Error(`Unknown inspector op: ${method}`);
    }
  },
});

type WorkerGlobalErrorEvent = {
  message?: string;
  error?: unknown;
  reason?: unknown;
};

const globalScope = self as unknown as {
  addEventListener: (
    type: "error" | "unhandledrejection",
    listener: (event: WorkerGlobalErrorEvent) => void,
  ) => void;
  onconnect: ((event: MessageEvent) => void) | null;
};

globalScope.addEventListener("error", (event) => {
  console.error(
    "[reactor.worker] uncaught error",
    event.message ?? event.error ?? event,
  );
});
globalScope.addEventListener("unhandledrejection", (event) => {
  console.error("[reactor.worker] unhandled rejection", event.reason);
});

globalScope.onconnect = (event) => {
  const port = event.ports[0];
  if (port) {
    try {
      host.connectPort(port);
    } catch (error) {
      console.error("[reactor.worker] failed to connect port", error);
    }
  }
};
