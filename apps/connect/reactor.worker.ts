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
import * as commonDocumentModels from "@powerhousedao/powerhouse-vetra-packages/document-models";
import * as vetraDocumentModels from "@powerhousedao/vetra/document-models";
import {
  BrowserKeyStorage,
  createSignatureVerifier,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/crypto";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { readPgVersionFile } from "./src/utils/pglite-idb.js";
import {
  coerceMajor,
  loadPGliteModule,
  resolvePgMajorForRuntime,
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
    const pg = await openReactorPglite(construct.namespace);
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
