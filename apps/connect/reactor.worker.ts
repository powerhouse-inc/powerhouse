import { PGlite } from "@electric-sql/pglite";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type Database,
} from "@powerhousedao/reactor";
import {
  createPortTransport,
  ReactorHost,
  WorkerPackageLoader,
} from "@powerhousedao/reactor-browser/rpc";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

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

const host = new ReactorHost({
  build: async (raw) => {
    const construct = raw as WorkerConstruct;
    loader = new WorkerPackageLoader({
      cdnUrl: construct.cdnUrl,
      importPackage: (url) =>
        import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
    });
    const models = await loader.loadPackages(construct.packageSpecs);
    const pg = new PGlite(`idb://${construct.namespace}`, {
      relaxedDurability: true,
    });
    const builder = new ReactorClientBuilder().withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModels(models)
        .withKysely(new Kysely<Database>({ dialect: new PGliteDialect(pg) })),
    );
    builder.withDocumentModelLoader(loader);
    const module = await builder.buildModule();
    registry = module.reactorModule?.documentModelRegistry;
    return module.client;
  },
  registerPackages: async (specs) => {
    if (!loader) {
      return;
    }
    const models = await loader.loadPackages(specs);
    registry?.registerModules(...models);
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
