import {
  ChannelScheme,
  DocumentIntegrityService,
  DriveCollectionId,
  InMemoryQueue,
  ReactorBuilder,
  ReactorClientBuilder,
  type ChannelConfig,
  type Database,
  type ISyncManager,
  type JwtHandler,
  type Remote,
  type RemoteFilter,
  type RemoteOptions,
} from "@powerhousedao/reactor";
import { baseDocumentModels } from "@powerhousedao/reactor-browser/base-document-models";
import {
  FORWARDED_EVENT_TYPES,
  ReactorHost,
  SYNC_STATUS_CHANGED_EVENT,
  WorkerPackageLoader,
  type ReactorIdentity,
  type WorkerMigrationState,
} from "@powerhousedao/reactor-browser/rpc";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  createRelationalDb,
  type IProcessorManager,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import * as commonDocumentModels from "@powerhousedao/powerhouse-vetra-packages/document-models";
import {
  BrowserKeyStorage,
  createSignatureVerifier,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/crypto";
import type * as PgLiveModuleNs from "@electric-sql/pglite/live";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
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

// Matches the main thread's RenownBuilder("connect").
const RENOWN_APP_NAME = "connect";

// Common models the tab bundles as a local package; not CDN-loadable, so the
// worker imports them directly. Vetra is builder-only and lazy-loaded below.
function toDocumentModelModules(candidates: unknown[]): DocumentModelModule[] {
  return candidates.filter(
    (m): m is DocumentModelModule =>
      typeof m === "object" &&
      m !== null &&
      "documentModel" in m &&
      "reducer" in m,
  );
}

const commonBundledModels = toDocumentModelModules(
  Object.values(commonDocumentModels),
);

// Not CDN-loadable, so it can't ride the packageSpecs path; lazy-import the
// bundled chunk only in studio mode.
async function loadVetraDocumentModels(): Promise<DocumentModelModule[]> {
  const vetraDocumentModels =
    await import("@powerhousedao/vetra/document-models");
  return toDocumentModelModules(Object.values(vetraDocumentModels));
}

type WorkerConstruct = {
  namespace: string;
  relationalNamespace: string;
  cdnUrl: string;
  packageSpecs: string[];
  studioMode?: boolean;
};

type ModelRegistry = {
  registerModules: (...modules: DocumentModelModule[]) => void;
};

let loader: WorkerPackageLoader | undefined;
let registry: ModelRegistry | undefined;
let signer: RenownCryptoSigner | undefined;
let syncManager: ISyncManager | undefined;
type RelationalState = {
  pg?: PgLiveModuleNs.PGliteWithLive;
  db?: IRelationalDb;
};
const relational: RelationalState = {};
type OwnedStorage = {
  reactorPg?: {
    close: () => Promise<void>;
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  };
  reactorIdb?: string;
  relationalIdb?: string;
};
const owned: OwnedStorage = {};
let inspectorQueue: InMemoryQueue | undefined;
let inspectorProcessors: IProcessorManager | undefined;
let inspectorIntegrity: DocumentIntegrityService | undefined;
let currentIdentity: ReactorIdentity | null = null;
const registeredKeys = new Set<string>();

function modelKey(module: DocumentModelModule): string {
  return `${module.documentModel.global.id}@${module.version ?? 1}`;
}

// Cloneable projection of a Remote: meta (carries channelConfig) + connection snapshot.
function toWireRemote(remote: Remote) {
  return {
    meta: remote.meta,
    connectionState: remote.channel.getConnectionState(),
  };
}

// Register only the delta; the registry rejects duplicate (type, version) pairs.
function registerNewModules(): void {
  if (!loader || !registry) {
    return;
  }
  const fresh = loader.models.filter((m) => !registeredKeys.has(modelKey(m)));
  if (fresh.length === 0) {
    return;
  }
  registry.registerModules(...fresh);
  for (const m of fresh) {
    registeredKeys.add(modelKey(m));
  }
}

// Rebuild renown crypto from the shared renownKeyDB keypair (origin-scoped IndexedDB).
async function buildWorkerCrypto() {
  const keyStorage = await BrowserKeyStorage.create();
  return new RenownCryptoBuilder().withKeyPairStorage(keyStorage).build();
}

// Open against the major already on disk so a legacy PG16 dir isn't read by PG17.
async function openReactorPglite(namespace: string) {
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

async function openRelational(namespace: string): Promise<DetectedMajor> {
  try {
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
    const pg = new PGlite(`idb://${namespace}`, {
      relaxedDurability: true,
      extensions: { live },
    });
    await pg.waitReady;
    relational.pg = pg as unknown as PgLiveModuleNs.PGliteWithLive;
    relational.db = createRelationalDb(
      new Kysely({ dialect: new PGliteDialect(pg) }),
    );
    console.info(
      `[reactor.worker] Relational store opened: idb://${namespace} (Postgres ${major}).`,
    );
    return detected;
  } catch (error) {
    console.error(
      "[reactor.worker] Failed to open the relational store:",
      error,
    );
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

const workerName = (self as { name?: string }).name ?? "";

const host = new ReactorHost({
  namespace: workerName,
  onAdminRestart: () =>
    host.broadcastReload("admin restart", crypto.randomUUID()),
  onAdminClearStorage: async () => {
    await relational.pg?.close();
    await owned.reactorPg?.close();
    for (const idbName of [owned.reactorIdb, owned.relationalIdb]) {
      if (idbName) {
        await clearFileData(idbName);
      }
    }
    host.broadcastReload("storage cleared", crypto.randomUUID());
  },
  onAdminMigrate: async () => {
    setMigration({
      status: "migrating",
      legacyMajor: migrationState.legacyMajor,
    });
    if (relational.pg) await relational.pg.close().catch(() => undefined);
    if (owned.reactorPg) await owned.reactorPg.close().catch(() => undefined);
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
      host.broadcastReload("migration complete", crypto.randomUUID());
    } catch (error) {
      console.error("[reactor.worker] Migration failed:", error);
      setMigration({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      host.broadcastReload("migration failed", crypto.randomUUID());
    }
  },
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
      });
      const loaded = await loader.loadPackages(construct.packageSpecs);
      const vetraModels = construct.studioMode
        ? await loadVetraDocumentModels()
        : [];
      const models = baseDocumentModels.concat(
        commonBundledModels,
        vetraModels,
        loaded,
      );
      phase = "opening pglite stores";
      console.info(`[reactor.worker] boot: ${phase}`);

      //this has to be serial: concurrent PGlite constructors consume the same
      // cached one-shot wasm "Response" object
      const reactor = await openReactorPglite(construct.namespace);
      const relationalMajor = await openRelational(
        construct.relationalNamespace,
      );
      const pg = reactor.pg;
      owned.reactorPg = pg;
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
      const crypto = await buildWorkerCrypto();
      signer = new RenownCryptoSigner(
        crypto,
        RENOWN_APP_NAME,
        currentIdentity ?? undefined,
      );
      const jwtHandler: JwtHandler = async () =>
        currentIdentity
          ? crypto.getBearerToken(currentIdentity.address, { expiresIn: 10 })
          : undefined;
      phase = "building reactor module";
      console.info(`[reactor.worker] boot: ${phase}`);
      const builder = new ReactorClientBuilder()
        .withSigner({ signer, verifier: createSignatureVerifier() })
        .withReactorBuilder(
          new ReactorBuilder()
            .withDocumentModels(models)
            .withChannelScheme(ChannelScheme.CONNECT)
            .withJwtHandler(jwtHandler)
            .withKysely(
              new Kysely<Database>({ dialect: new PGliteDialect(pg) }),
            ),
        );
      builder.withDocumentModelLoader(loader);
      const module = await builder.buildModule();
      registry = module.reactorModule?.documentModelRegistry;
      syncManager = module.reactorModule?.syncModule?.syncManager;
      const rm = module.reactorModule;
      if (rm) {
        inspectorQueue =
          rm.queue instanceof InMemoryQueue ? rm.queue : undefined;
        inspectorProcessors = rm.processorManager;
        inspectorIntegrity = new DocumentIntegrityService(
          rm.keyframeStore,
          rm.operationStore,
          rm.writeCache,
          rm.documentView,
          rm.documentModelRegistry,
        );
      }
      for (const m of models) {
        registeredKeys.add(modelKey(m));
      }
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
      throw error;
    }
  },
  registerPackages: async (specs) => {
    if (!loader) {
      return;
    }
    await loader.loadPackages(specs);
    registerNewModules();
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
    if (!relational.pg) {
      throw new Error("Relational store not available");
    }
    switch (method) {
      case "query": {
        const [sql, params] = args as [string, unknown[]];
        const result = await relational.pg.query(sql, params);
        return result.rows;
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
        if (!owned.reactorPg) {
          throw new Error("Reactor store not available");
        }
        const [sql, params] = args as [string, unknown[]];
        const result = await owned.reactorPg.query(sql, params);
        return result.rows;
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
