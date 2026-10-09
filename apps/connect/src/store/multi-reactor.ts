import {
  createReactorInspector,
  type ReactorInfo,
} from "@powerhousedao/reactor";
import {
  getSwitchboardGatewayUrlFromDriveUrl,
  type BrowserReactorClientModule,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import {
  createRoutingClient,
  fromReactorClient,
  type CollectionRequirementsInput,
  type ReactorReach,
  type RouterDiagnostic,
  type RoutingReactorClient,
} from "@powerhousedao/reactor-router";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { createGraphQLRoutableBackend } from "./graphql-routable-backend.js";

export const LOCAL_BACKEND_NAME = "connect-local";
export const REMOTE_BACKEND_NAME = "switchboard-remote";

export type LocalReactorModule =
  | BrowserReactorClientModule
  | WorkerReactorClientModule;

const REMOTE_REACH: ReactorReach = Object.freeze({
  hosting: "remote",
  inspection: "none",
});

/** Only the tab's reactor is inspectable here, so new collections land on it. */
export const PLACE_ON_LOCAL: CollectionRequirementsInput = Object.freeze({
  inspectable: true,
});

export function localReach(kind: LocalReactorModule["kind"]): ReactorReach {
  return kind === "worker"
    ? { hosting: "worker", inspection: "rpc" }
    : { hosting: "in-process", inspection: "direct" };
}

/** Read at every refresh, never kept: a rebuilt reactor reports its own. */
export function localFacts(
  module: LocalReactorModule,
): () => Promise<ReactorInfo> {
  if (module.kind === "worker") {
    return () => module.inspector.info();
  }
  return async () => {
    const reactorModule = module.reactorModule;
    if (!reactorModule) {
      throw new Error("The in-tab reactor exposes no module to inspect");
    }
    return createReactorInspector(reactorModule).info();
  };
}

/** `<origin>[/<prefix>]/d/<slug>` -> `<origin>[/<prefix>]/graphql`. */
export function deriveSwitchboardGraphqlUrl(
  remoteDriveUrl: string,
): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(remoteDriveUrl);
  } catch {
    return undefined;
  }
  return getSwitchboardGatewayUrlFromDriveUrl(parsed.href);
}

export type MultiReactorParams = {
  /** The local module, built and ready. */
  module: LocalReactorModule;
  remoteGraphqlUrl: string;
  signer: ISigner;
  documentModelModules: readonly DocumentModelModule[];
  onDiagnostic?: RouterDiagnostic;
};

/** The router over the tab's reactor (primary) and the Switchboard. */
export function buildMultiReactorClient(
  params: MultiReactorParams,
): Promise<RoutingReactorClient> {
  const remote = createGraphQLRoutableBackend({
    url: params.remoteGraphqlUrl,
    documentModels: params.documentModelModules,
  });
  return createRoutingClient(
    [
      {
        name: LOCAL_BACKEND_NAME,
        backend: fromReactorClient(params.module.client),
        facts: localFacts(params.module),
        reach: localReach(params.module.kind),
        refusesMisroutes: false,
      },
      {
        name: REMOTE_BACKEND_NAME,
        backend: remote.backend,
        facts: () => remote.info(),
        reach: REMOTE_REACH,
        refusesMisroutes: false,
      },
    ],
    {
      primaryBackend: LOCAL_BACKEND_NAME,
      defaultRequirements: PLACE_ON_LOCAL,
      signer: params.signer,
      documentModelModules: params.documentModelModules,
      onDiagnostic: params.onDiagnostic,
    },
  );
}
