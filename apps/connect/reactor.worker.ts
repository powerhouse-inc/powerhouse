import {
  ChannelScheme,
  DriveCollectionId,
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
} from "@powerhousedao/reactor-browser/rpc";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import * as commonDocumentModels from "@powerhousedao/powerhouse-vetra-packages/document-models";
import * as vetraDocumentModels from "@powerhousedao/vetra/document-models";
import {
  BrowserKeyStorage,
  createSignatureVerifier,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/crypto";
import type * as PgLiveModuleNs from "@electric-sql/pglite/live";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { readPgVersionFile } from "./src/utils/pglite-idb.js";
import {
  coerceMajor,
  loadPGliteModule,
  resolvePgMajorForRuntime,
  type SupportedPgMajor,
} from "./src/utils/pglite-major.js";

// Matches the main thread's RenownBuilder("connect").
const RENOWN_APP_NAME = "connect";

// Studio models the tab bundles as local packages; not CDN-loadable, so the worker imports them directly.
const bundledModelCandidates: unknown[] = [
  ...Object.values(commonDocumentModels),
  ...Object.values(vetraDocumentModels),
];
const bundledDocumentModels = bundledModelCandidates.filter(
  (m): m is DocumentModelModule =>
    typeof m === "object" &&
    m !== null &&
    "documentModel" in m &&
    "reducer" in m,
);

type WorkerConstruct = {
  namespace: string;
  relationalNamespace: string;
  cdnUrl: string;
  packageSpecs: string[];
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
  return new PGlite(`idb://${namespace}`, { relaxedDurability: true });
}

type PgLiveModule = typeof PgLiveModuleNs;

async function loadPgLive(major: SupportedPgMajor): Promise<PgLiveModule> {
  if (major === 16) {
    return import("pglite-legacy-02/live") as unknown as Promise<PgLiveModule>;
  }
  return import("@electric-sql/pglite/live");
}

async function openRelational(namespace: string): Promise<void> {
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
    relational.pg = pg as unknown as PgLiveModuleNs.PGliteWithLive;
    relational.db = createRelationalDb(
      new Kysely({ dialect: new PGliteDialect(pg) }),
    );
    console.info(
      `[reactor.worker] Relational store opened: idb://${namespace} (Postgres ${major}).`,
    );
  } catch (error) {
    console.error(
      "[reactor.worker] Failed to open the relational store:",
      error,
    );
  }
}

const workerName = (self as { name?: string }).name ?? "";

const host = new ReactorHost({
  namespace: workerName,
  onAdminRestart: () =>
    host.broadcastReload("admin restart", crypto.randomUUID()),
  build: async (raw) => {
    const construct = raw as WorkerConstruct;
    loader = new WorkerPackageLoader({
      cdnUrl: construct.cdnUrl,
      importPackage: (url) =>
        import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
    });
    const loaded = await loader.loadPackages(construct.packageSpecs);
    const models = baseDocumentModels.concat(bundledDocumentModels, loaded);
    const [pg] = await Promise.all([
      openReactorPglite(construct.namespace),
      openRelational(construct.relationalNamespace),
    ]);
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
    const builder = new ReactorClientBuilder()
      .withSigner({ signer, verifier: createSignatureVerifier() })
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModels(models)
          .withChannelScheme(ChannelScheme.CONNECT)
          .withJwtHandler(jwtHandler)
          .withKysely(new Kysely<Database>({ dialect: new PGliteDialect(pg) })),
      );
    builder.withDocumentModelLoader(loader);
    const module = await builder.buildModule();
    registry = module.reactorModule?.documentModelRegistry;
    syncManager = module.reactorModule?.syncModule?.syncManager;
    for (const m of models) {
      registeredKeys.add(modelKey(m));
    }
    for (const type of FORWARDED_EVENT_TYPES) {
      module.eventBus.subscribe(type, (forwardedType, event) =>
        host.broadcastBusEvent(forwardedType, event),
      );
    }
    syncManager?.onSyncStatusChange((documentId, status) =>
      host.broadcastBusEvent(SYNC_STATUS_CHANGED_EVENT, { documentId, status }),
    );
    return module.client;
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
});

const scope = self as unknown as {
  onconnect: ((event: MessageEvent) => void) | null;
};
scope.onconnect = (event) => {
  const port = event.ports[0];
  if (port) {
    host.connectPort(port);
  }
};
