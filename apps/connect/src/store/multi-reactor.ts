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
  PeerCapabilityFlags,
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

/** The loaded document models, or a getter that reads the current ones. */
export type LoadedDocumentModels =
  | readonly DocumentModelModule[]
  | (() => readonly DocumentModelModule[]);

export type MultiReactorParams = {
  /** The local module, built and ready. Undefined builds a REMOTE-ONLY router
   * (no local backend → no local reactor, no PGlite): the `remote` client. */
  module: LocalReactorModule | undefined;
  remoteGraphqlUrl: string;
  signer: ISigner;
  /** Signing models when the local module exposes no registry; the router asks the local reactor (or, remote-only, the loaded set). */
  documentModelModules: LoadedDocumentModels;
  /** Picks the versions of documents created on the Switchboard. */
  featureFlags?: PeerCapabilityFlags;
  onDiagnostic?: RouterDiagnostic;
};

/** Remote-only placement: the Switchboard serves every collection. (It offers
 * no inspection surface over GraphQL, so PLACE_ON_LOCAL's `inspectable`
 * requirement must NOT apply, or no backend would be eligible.) */
export const PLACE_ON_REMOTE: CollectionRequirementsInput = Object.freeze({});

/** The router Connect installs, with Connect's handling of credentials and id checks. */
export class ConnectRoutingClient extends RoutingReactorClient {
  private readonly remote: GraphQLRoutableBackend;
  private readonly hasLocal: boolean;

  constructor(
    backends: readonly RoutableBackendConfig[],
    options: RoutingClientOptions,
    remote: GraphQLRoutableBackend,
    hasLocal: boolean,
  ) {
    super(backends, options);
    this.remote = remote;
    this.hasLocal = hasLocal;
  }

  /** Renown's sign-in and sign-out call this on whatever client is installed. */
  notifyCredentialsChanged(): void {
    this.remote.notifyCredentialsChanged();
  }

  /** The local answer stands when only the Switchboard could not answer — but
   * only when there IS a local backend. Remote-only has nothing to fall back
   * to, so its errors surface. */
  override async isDocumentIdTaken(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      return await super.isDocumentIdTaken(documentId, signal);
    } catch (error) {
      if (!this.hasLocal || !failedOnlyOnRemote(error)) {
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

/**
 * Build the Connect routing client. With a local `module` it is the router
 * over the tab's reactor (primary) and the Switchboard; WITHOUT one it is the
 * `remote` client — a remote-only router whose single backend is the
 * Switchboard, so no local reactor (and no PGlite) is built. Either way the
 * result is a full IReactorClient the app graph consumes unchanged.
 */
export async function buildMultiReactorClient(
  params: MultiReactorParams,
): Promise<ConnectRoutingClient> {
  const module = params.module;
  const registry = module?.reactorModule?.documentModelRegistry;
  const loaded = params.documentModelModules;
  const loadedModules = typeof loaded === "function" ? loaded : () => loaded;
  const remote = createGraphQLRoutableBackend({
    url: params.remoteGraphqlUrl,
    documentModels: () => registry?.getAllModules() ?? loadedModules(),
    featureFlags: params.featureFlags,
  });
  const remoteBackend: RoutableBackendConfig = {
    name: REMOTE_BACKEND_NAME,
    backend: remote.backend,
    facts: () => remote.info(),
    reach: REMOTE_REACH,
    refusesMisroutes: false,
  };
  const backends: RoutableBackendConfig[] = module
    ? [
        {
          name: LOCAL_BACKEND_NAME,
          backend: fromReactorClient(module.client),
          facts: localFacts(module),
          reach: localReach(module.kind),
          refusesMisroutes: false,
        },
        remoteBackend,
      ]
    : [remoteBackend];
  const router = new ConnectRoutingClient(
    backends,
    {
      // Remote-only: the Switchboard is primary and serves every collection;
      // with a local reactor, new collections land on it (inspectable).
      primaryBackend: module ? LOCAL_BACKEND_NAME : REMOTE_BACKEND_NAME,
      defaultRequirements: module ? PLACE_ON_LOCAL : PLACE_ON_REMOTE,
      signer: params.signer,
      onDiagnostic: params.onDiagnostic,
      // The Switchboard serves no models over GraphQL; remote-only uses the loaded set.
      documentModelModules: module ? undefined : loadedModules,
    },
    remote,
    Boolean(module),
  );
  await router.refreshFacts();
  return router;
}
