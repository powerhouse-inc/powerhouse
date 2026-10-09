import {
  createReactorInspector,
  type ReactorInfo,
} from "@powerhousedao/reactor";
import type {
  BrowserReactorClientModule,
  WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import {
  FanInPartialFailureError,
  fromReactorClient,
  RoutingReactorClient,
  type CollectionRequirementsInput,
  type ReactorReach,
  type RoutableBackendConfig,
  type RouterDiagnostic,
  type RoutingClientOptions,
} from "@powerhousedao/reactor-router";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import {
  createGraphQLRoutableBackend,
  type GraphQLRoutableBackend,
} from "./graphql-routable-backend.js";

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
  const prefix = /^(.*)\/d\/[^/]+\/?$/.exec(parsed.pathname)?.[1];
  return prefix === undefined ? undefined : `${parsed.origin}${prefix}/graphql`;
}

export type MultiReactorParams = {
  /** The local module, built and ready. */
  module: LocalReactorModule;
  remoteGraphqlUrl: string;
  signer: ISigner;
  /** Signing models when the local module exposes no registry; the router asks the local reactor. */
  documentModelModules: readonly DocumentModelModule[];
  onDiagnostic?: RouterDiagnostic;
};

/** The router Connect installs, with Connect's handling of credentials and id checks. */
export class ConnectRoutingClient extends RoutingReactorClient {
  private readonly remote: GraphQLRoutableBackend;

  constructor(
    backends: readonly RoutableBackendConfig[],
    options: RoutingClientOptions,
    remote: GraphQLRoutableBackend,
  ) {
    super(backends, options);
    this.remote = remote;
  }

  /** Renown's sign-in and sign-out call this on whatever client is installed. */
  notifyCredentialsChanged(): void {
    this.remote.notifyCredentialsChanged();
  }

  /** The local answer stands when only the Switchboard could not answer. */
  override async isDocumentIdTaken(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      return await super.isDocumentIdTaken(documentId, signal);
    } catch (error) {
      if (!failedOnlyOnRemote(error)) {
        throw error;
      }
      logger.warn(
        "The Switchboard could not say whether @id is taken; using the local reactor's answer: @error",
        documentId,
        error,
      );
      return false;
    }
  }
}

function failedOnlyOnRemote(error: unknown): boolean {
  return (
    error instanceof FanInPartialFailureError &&
    error.failures.every((failure) => failure.backend === REMOTE_BACKEND_NAME)
  );
}

/** The router over the tab's reactor (primary) and the Switchboard. */
export async function buildMultiReactorClient(
  params: MultiReactorParams,
): Promise<ConnectRoutingClient> {
  const registry = params.module.reactorModule?.documentModelRegistry;
  const remote = createGraphQLRoutableBackend({
    url: params.remoteGraphqlUrl,
    documentModels: () =>
      registry?.getAllModules() ?? params.documentModelModules,
  });
  const router = new ConnectRoutingClient(
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
      onDiagnostic: params.onDiagnostic,
    },
    remote,
  );
  await router.refreshFacts();
  return router;
}
