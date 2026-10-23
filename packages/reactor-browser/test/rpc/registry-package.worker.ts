// A reactor worker like Connect's: no import map, registry packages loaded through WorkerPackageLoader.
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IDocumentModelRegistry,
} from "@powerhousedao/reactor";
import { createPortTransport } from "@powerhousedao/reactor/rpc";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import * as documentModel from "document-model";
import * as zod from "zod";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import {
  describeLoadFailure,
  WorkerPackageLoader,
} from "../../src/rpc/worker-package-loader.js";
import { createP256Signer } from "../utils/p256-signer.js";
import { shimSharedDeps } from "./shared-dep-shims.js";

const sharedImports = shimSharedDeps({ "document-model": documentModel, zod });

/** The construct: which document types the registry lookup finds a package for. */
export type RegistryPackageWorkerConstruct = {
  discover?: Record<string, string>;
};

let loader: WorkerPackageLoader;
let registry: IDocumentModelRegistry | undefined;

const host = new ReactorHost({
  build: async (construct) => {
    const { discover = {} } = construct as RegistryPackageWorkerConstruct;
    loader = new WorkerPackageLoader({
      cdnUrl: `${self.location.origin}/registry`,
      importPackage: (url) =>
        import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
      resolvePackages: (type) =>
        Promise.resolve(discover[type] ? [discover[type]] : []),
      sharedImports,
    });
    const module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule,
        ]),
      )
      .withSigner(await createP256Signer())
      .withDocumentModelLoader(loader)
      .buildModule();
    registry = module.reactorModule?.documentModelRegistry;
    return module.client;
  },
  registerPackages: async (specs) => {
    const { types, failures } = await loader.updatePackages(specs);
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.error),
        `Failed to load package(s): ${failures.map(describeLoadFailure).join("; ")}`,
      );
    }
    if (registry && types.length > 0) {
      registry.unregisterModules(...types);
      registry.registerModules(
        ...loader.models.filter((m) =>
          types.includes(m.documentModel.global.id),
        ),
      );
    }
  },
});

self.addEventListener(
  "message",
  (event: MessageEvent<{ port: MessagePort }>) => {
    host.connect(createPortTransport(event.data.port));
  },
);
