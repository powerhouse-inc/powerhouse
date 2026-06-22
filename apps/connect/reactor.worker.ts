import {
  ReactorBuilder,
  ReactorClientBuilder,
  type Database,
} from "@powerhousedao/reactor";
import {
  ReactorHost,
  WorkerPackageLoader,
} from "@powerhousedao/reactor-browser/rpc";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
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
const registeredKeys = new Set<string>();

function modelKey(module: DocumentModelModule): string {
  return `${module.documentModel.global.id}@${module.version ?? 1}`;
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

// Rebuild the signer from the shared renownKeyDB keypair (origin-scoped IndexedDB).
async function buildWorkerSigner() {
  const keyStorage = await BrowserKeyStorage.create();
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyStorage)
    .build();
  return {
    signer: new RenownCryptoSigner(crypto, RENOWN_APP_NAME),
    verifier: createSignatureVerifier(),
  };
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

const host = new ReactorHost({
  build: async (raw) => {
    const construct = raw as WorkerConstruct;
    loader = new WorkerPackageLoader({
      cdnUrl: construct.cdnUrl,
      importPackage: (url) =>
        import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
    });
    const models = await loader.loadPackages(construct.packageSpecs);
    const pg = await openReactorPglite(construct.namespace);
    const signerConfig = await buildWorkerSigner();
    const builder = new ReactorClientBuilder()
      .withSigner(signerConfig)
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModels(models)
          .withKysely(new Kysely<Database>({ dialect: new PGliteDialect(pg) })),
      );
    builder.withDocumentModelLoader(loader);
    const module = await builder.buildModule();
    registry = module.reactorModule?.documentModelRegistry;
    for (const m of models) {
      registeredKeys.add(modelKey(m));
    }
    return module.client;
  },
  registerPackages: async (specs) => {
    if (!loader) {
      return;
    }
    await loader.loadPackages(specs);
    registerNewModules();
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
