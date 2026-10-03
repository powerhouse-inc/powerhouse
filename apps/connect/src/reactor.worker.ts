import {
  ChannelScheme,
  DocumentIntegrityService,
  DriveCollectionId,
  HardenedPGliteDialect,
  InMemoryQueue,
  queryThroughDialect,
  ReactorBuilder,
  ReactorClientBuilder,
  ReactorEventTypes,
  ReactorInspector,
  SelfHealingPGliteClient,
  type ChannelConfig,
  type Database,
  type IDocumentModelRegistry,
  type IReactorDbQuery,
  type ISyncManager,
  type JwtHandler,
  type ReactorFeatureFlags,
  type RecreatablePGliteInstance,
  type Remote,
  type RemoteFilter,
  type RemoteOptions,
  type UnsupportedStoredDocuments,
} from "@powerhousedao/reactor";
import { baseDocumentModels } from "@powerhousedao/reactor-browser/base-document-models";
import {
  dispatchInspectorOp,
  FORWARDED_EVENT_TYPES,
  ReactorHost,
  SYNC_STATUS_CHANGED_EVENT,
  WorkerPackageLoader,
  type ReactorIdentity,
  type WorkerMigrationState,
  type WorkerPackageSource,
} from "@powerhousedao/reactor-browser/rpc";
import type {
  DocumentModelModule,
  PeerManifest,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import * as commonDocumentModels from "@powerhousedao/powerhouse-vetra-packages/document-models";
import {
  loadFlaggedDocumentModels,
  toDocumentModelModules,
} from "./reactor-worker-models.js";
import {
  BrowserKeyStorage,
  RenownCryptoBuilder,
  type RenownCryptoSigner,
} from "@renown/sdk/crypto";
import { createWorkerSignerConfig } from "./reactor-worker-signer.js";
import type { RenownTrustEndpoints } from "./utils/renown-trust.js";
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

type ModelRegistry = Pick<
  IDocumentModelRegistry,
  | "registerModules"
  | "unregisterModules"
  | "registerUpgradeManifests"
  | "unregisterUpgradeManifests"
>;

let loader: WorkerPackageLoader | undefined;
let registry: ModelRegistry | undefined;
let signer: RenownCryptoSigner | undefined;
let syncManager: ISyncManager | undefined;
type RelationalState = {
  pg?: PgLiveModuleNs.PGliteWithLive;
  db?: IRelationalDb;
  /**
   * The one Kysely over the relational PGlite, the same handle `db` wraps.
   * Inspector SQL from the DB explorer goes through it rather than at the
   * client, so it enters the hardened dialect's serialising queue instead of
   * landing inside whatever transaction a relational processor has open on the
   * shared session - reading its uncommitted rows, or aborting it outright. See
   * docs/bugs/2026-10-03-sync-defect-analysis.md, mechanism A-3, which fixed
   * the same bypass on the reactor store.
   */
  kysely?: Kysely<unknown>;
};
const relational: RelationalState = {};
type OwnedStorage = {
  reactorPg?: {
    close: () => Promise<void>;
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  };
  /**
   * The one Kysely over the reactor's PGlite. Inspector SQL goes through it
   * rather than at the client, so it enters the dialect's serialising queue
   * instead of landing inside whatever job transaction is open on the shared
   * session - which is how a statement typed into the DB explorer could read
   * uncommitted rows, or abort a job's transaction outright. See
   * docs/bugs/2026-10-03-sync-defect-analysis.md, mechanism A-3.
   */
  reactorDb?: Kysely<Database>;
  reactorIdb?: string;
  relationalIdb?: string;
};
const owned: OwnedStorage = {};
// Replaced on every boot with one over the live reactor module. Until then
// every component is absent, which is what the inspector degrades to.
let inspector = new ReactorInspector({});
// Resolved per call: the store is reopened across boots and migrations.
const inspectorDb: IReactorDbQuery = {
  queryDb: async (sql, params) => {
    if (!owned.reactorDb) {
      throw new Error("Reactor store not available");
    }
    return queryThroughDialect(owned.reactorDb, sql, params);
  },
};
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

// A reloaded source replaced modules under the same (type, version) keys, so
// the delta registration above would skip them. Drop the whole version family
// from the registry and the bookkeeping - the tab hook does the same - and
// let registerNewModules re-add the loader's fresh modules.
function replaceRegistryFamilies(types: string[]): void {
  if (!registry || types.length === 0) {
    return;
  }
  registry.unregisterModules(...types);
  const typeSet = new Set(types);
  for (const key of [...registeredKeys]) {
    const type = key.slice(0, key.lastIndexOf("@"));
    if (typeSet.has(type)) {
      registeredKeys.delete(key);
    }
  }
}

// Models entries ship upgrade manifests beside their modules; replace per
// type so a watch rebuild's manifest wins over the boot-time one.
function registerLoaderManifests(): void {
  if (!loader || !registry) {
    return;
  }
  const manifests = loader.upgradeManifests;
  if (manifests.length === 0) {
    return;
  }
  registry.unregisterUpgradeManifests(
    ...manifests.map((manifest) => manifest.documentType),
  );
  for (const result of registry.registerUpgradeManifests(...manifests)) {
    if (result.status === "error") {
      console.error(
        "[reactor.worker] failed to register upgrade manifest:",
        result.error,
      );
    }
  }
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
//
// This is the reactor's authoritative operation store, so it opens WITHOUT
// relaxedDurability: a COMMIT must be flushed to IndexedDB before it is reported
// durable. relaxedDurability lets COMMIT resolve before the idb flush, so a
// self-heal recreate - which reads back only the last flushed snapshot - would
// permanently lose operations that were acknowledged but not yet flushed and not
// yet synced to a remote. The latency cost is accepted here so that "committed"
// means "flushed" and the W0.7 self-heal never drops acknowledged writes. The
// relational/read-model store keeps relaxedDurability (see openRelational): its
// rows are derived and can be re-processed from the durable operation log.
async function openReactorPglite(namespace: string) {
  const detected = coerceMajor(await readPgVersionFile(`/pglite/${namespace}`));
  const major = resolvePgMajorForRuntime(detected);
  if (major !== 17) {
    console.warn(
      `[reactor.worker] Running against legacy PGlite data dir (Postgres ${major}). Migrate to PG17 from the Connect banner or the Inspector.`,
    );
  }
  const { PGlite } = await loadPGliteModule(major);
  const pg = new PGlite(`idb://${namespace}`, { relaxedDurability: false });
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
    // Self-heal the relational session by host reload rather than in-place
    // recreate. The relational store hands out `live` query subscriptions
    // (onLiveQuery, bound to this exact pg.live instance) that an instance swap
    // cannot transparently rewire the way the reactor store's Kysely holders
    // are, so a clean worker reload is the recovery here. Without this hook a
    // poisoned relational session - now that relational-processor and inspector
    // SQL both route through this dialect's queue - would brick forever with the
    // dialect's loud refusal and no path back. See docs/bugs/2026-10-03-*, W0.7.
    const relationalKysely = new Kysely<unknown>({
      dialect: new HardenedPGliteDialect(pg, {
        onPoisoned: (cause) => {
          console.error(
            "[reactor.worker] relational PGlite session unrecoverable; requesting reload",
            cause,
          );
          host.broadcastReload(
            "relational pglite session unrecoverable",
            globalThis.crypto.randomUUID(),
          );
          return Promise.resolve(false);
        },
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

async function releaseStores(): Promise<void> {
  const stores = [relational.pg, owned.reactorPg];
  relational.pg = undefined;
  relational.db = undefined;
  relational.kysely = undefined;
  owned.reactorPg = undefined;
  owned.reactorDb = undefined;
  for (const store of stores) {
    try {
      await store?.close();
    } catch (error) {
      console.error("[reactor.worker] closing a store failed:", error);
    }
  }
}

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
      const models = baseDocumentModels.concat(
        commonBundledModels,
        flaggedModels,
        loader.models,
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
      // Self-heal: on an unrecoverable session (a stuck PORTAL_ACTIVE the
      // dialect refuses), recreate the PGlite instance against the same idb
      // store. Every reactor component reaches the database through this one
      // Kysely, so swapping the instance under the client rewires all of them
      // without rebuilding the reactor. Durably committed data survives; the
      // rolled-back tail is re-pulled by sync. If a replacement cannot be
      // opened, fall back to a worker reload. See docs/bugs/2026-10-03-*, W0.7.
      const reactorSelfHeal = new SelfHealingPGliteClient(
        pg as RecreatablePGliteInstance,
        {
          openInstance: async () =>
            (await openReactorPglite(construct.namespace))
              .pg as RecreatablePGliteInstance,
          onDiagnostic: (message, error) =>
            console.error(`[reactor.worker] self-heal: ${message}`, error),
        },
      );
      owned.reactorPg = reactorSelfHeal;
      owned.reactorDb = new Kysely<Database>({
        dialect: new HardenedPGliteDialect(reactorSelfHeal, {
          onPoisoned: async (cause) => {
            const reason =
              cause instanceof Error ? cause.message : String(cause);
            const healed = await reactorSelfHeal.recreate(reason);
            if (!healed) {
              console.error(
                "[reactor.worker] PGlite session unrecoverable and no replacement opened; requesting reload",
              );
              host.broadcastReload(
                "pglite session unrecoverable",
                globalThis.crypto.randomUUID(),
              );
            }
            return healed;
          },
        }),
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
      registry = module.reactorModule?.documentModelRegistry;
      syncManager = module.reactorModule?.syncModule?.syncManager;
      const rm = module.reactorModule;
      if (rm) {
        inspector = new ReactorInspector({
          queue: rm.queue instanceof InMemoryQueue ? rm.queue : undefined,
          processorManager: rm.processorManager,
          catchUp: rm.catchUp,
          integrity: new DocumentIntegrityService(
            rm.keyframeStore,
            rm.operationStore,
            rm.writeCache,
            rm.documentView,
            rm.documentModelRegistry,
          ),
        });
      }
      for (const m of models) {
        registeredKeys.add(modelKey(m));
      }
      // Manifests ride along in the models entries the loader imported; the
      // builder only saw the modules.
      registerLoaderManifests();
      for (const type of FORWARDED_EVENT_TYPES) {
        module.eventBus.subscribe(type, (forwardedType, event) =>
          host.broadcastBusEvent(forwardedType, event),
        );
      }
      // The event bus exists only now; emit the recovery event on it so the
      // forwarding subscription above relays it to the tab/inspector.
      reactorSelfHeal.setRecreatedListener((event) => {
        void module.eventBus
          .emit(ReactorEventTypes.STORAGE_SESSION_RECREATED, event)
          .catch((error) =>
            console.error(
              "[reactor.worker] emitting recovery event failed",
              error,
            ),
          );
      });
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
      await releaseStores();
      throw toStoredDocumentsRefused(error);
    }
  },
  registerPackages: async (specs, sources) => {
    if (!loader) {
      return;
    }
    await loader.loadPackages(specs);
    if (sources && sources.length > 0) {
      const { types } = await loader.reloadSources(sources);
      replaceRegistryFamilies(types);
    }
    registerNewModules();
    registerLoaderManifests();
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
        // Through the dialect queue, never at the shared PGlite session: the
        // relational store's processors hold transactions on it.
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
  onInspectorOp: (method, args) =>
    dispatchInspectorOp(inspector, inspectorDb, method, args),
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
