import {
  createReactorInspector,
  type ReactorInfo,
} from "@powerhousedao/reactor";
import {
  ambientRenownSigner,
  ambientRenownTokenProvider,
  createSwitchboardBackend,
  type BrowserReactorClientModule,
  type SwitchboardBackend,
  type WorkerReactorClientModule,
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
import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import { logger } from "document-model";

export const LOCAL_BACKEND_NAME = "connect-local";
export const REMOTE_BACKEND_NAME = "switchboard-remote";

export type LocalReactorModule =
  | BrowserReactorClientModule
  | WorkerReactorClientModule;

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
  return switchboardOfDrive(remoteDriveUrl)?.graphql;
}

/** A switchboard the router reaches, by its router backend name. */
export type SwitchboardRemote = { name: string; graphqlUrl: string };

/** The loaded document models, or a getter that reads the current ones. */
export type LoadedDocumentModels =
  | readonly DocumentModelModule[]
  | (() => readonly DocumentModelModule[]);

export type MultiReactorParams = {
  /** The local module, built and ready. Undefined builds a REMOTE-ONLY router
   * (no local backend → no local reactor, no PGlite): the `remote` client. */
  module: LocalReactorModule | undefined;
  /** One per switchboard; `remoteGraphqlUrl` alone is one named `switchboard-remote`. */
  remotes?: readonly SwitchboardRemote[];
  remoteGraphqlUrl?: string;
  /** Collection key or drive id -> backend; names no backend here are dropped. */
  collections?: Readonly<Record<string, string>>;
  /** Signs routed writes; unsigned (anonymous) without one. */
  signer?: ISigner;
  /** Signing models when the local module exposes no registry; the router asks the local reactor (or, remote-only, the loaded set). */
  documentModelModules: LoadedDocumentModels;
  onDiagnostic?: RouterDiagnostic;
};

/** Remote-only placement: the Switchboard serves every collection. (It offers
 * no inspection surface over GraphQL, so PLACE_ON_LOCAL's `inspectable`
 * requirement must NOT apply, or no backend would be eligible.) */
export const PLACE_ON_REMOTE: CollectionRequirementsInput = Object.freeze({});

/**
 * The local answer stands when only the Switchboard could not answer -- but
 * only when there IS a local backend. Remote-only has nothing to fall back to,
 * so its errors surface. Installed as the router's `answerFailedIdCheck`, so
 * the facade and `write.isDocumentIdTaken` both apply it.
 */
function localIdCheckAnswer(
  documentId: string,
  error: unknown,
  remoteNames: ReadonlySet<string>,
): boolean | undefined {
  if (!failedOnlyOnRemote(error, remoteNames)) {
    return undefined;
  }
  logger.warn(
    "The Switchboard could not say whether @id is taken; using the local reactor's answer: @error",
    documentId,
    error,
  );
  return false;
}

/** The router Connect installs, with Connect's handling of credentials and id checks. */
export class ConnectRoutingClient extends RoutingReactorClient {
  private readonly remotes: readonly SwitchboardBackend[];

  constructor(
    backends: readonly RoutableBackendConfig[],
    options: RoutingClientOptions,
    remotes: readonly SwitchboardBackend[],
    hasLocal: boolean,
  ) {
    const remoteNames = new Set(remotes.map((remote) => remote.config.name));
    super(backends, {
      ...options,
      answerFailedIdCheck: hasLocal
        ? (id, error) => localIdCheckAnswer(id, error, remoteNames)
        : options.answerFailedIdCheck,
    });
    this.remotes = remotes;
  }

  /** Renown's sign-in and sign-out call this on whatever client is installed. */
  notifyCredentialsChanged(): void {
    for (const remote of this.remotes) remote.notifyCredentialsChanged();
  }
}

function failedOnlyOnRemote(
  error: unknown,
  remoteNames: ReadonlySet<string>,
): boolean {
  return (
    error instanceof FanInPartialFailureError &&
    error.failures.every((failure) => remoteNames.has(failure.backend))
  );
}

/** The remotes to build, one per switchboard: the first link to a base wins. */
function remotesOf(params: MultiReactorParams): SwitchboardRemote[] {
  const listed: readonly SwitchboardRemote[] = params.remotes?.length
    ? params.remotes
    : params.remoteGraphqlUrl
      ? [{ name: REMOTE_BACKEND_NAME, graphqlUrl: params.remoteGraphqlUrl }]
      : [];
  const seen = new Set<string>();
  return listed.filter((remote) => {
    if (seen.has(remote.graphqlUrl)) {
      logger.warn(
        "@name opens the same switchboard as an earlier backend; skipping it",
        remote.name,
      );
      return false;
    }
    seen.add(remote.graphqlUrl);
    return true;
  });
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
  const listed = remotesOf(params);
  if (listed.length === 0) {
    throw new Error("A routing client needs at least one switchboard");
  }
  // The logged-in Renown user's token and signer, read per request as before.
  const remotes = listed.map((remote) =>
    createSwitchboardBackend({
      name: remote.name,
      url: remote.graphqlUrl,
      tokenProvider: ambientRenownTokenProvider,
      signer: ambientRenownSigner,
      documentModels: () => registry?.getAllModules() ?? loadedModules(),
      inspection: "none",
    }),
  );
  const remoteBackends = remotes.map((remote) => remote.config);
  const backends: RoutableBackendConfig[] = module
    ? [
        {
          name: LOCAL_BACKEND_NAME,
          backend: fromReactorClient(module.client),
          facts: localFacts(module),
          reach: localReach(module.kind),
          refusesMisroutes: false,
        },
        ...remoteBackends,
      ]
    : remoteBackends;
  const names = new Set(backends.map((backend) => backend.name));
  const collections = Object.fromEntries(
    Object.entries(params.collections ?? {}).filter(([, backend]) =>
      names.has(backend),
    ),
  );
  const router = new ConnectRoutingClient(
    backends,
    {
      // Remote-only: the first Switchboard is primary; with a local reactor,
      // new collections land on it (inspectable).
      primaryBackend: module ? LOCAL_BACKEND_NAME : remoteBackends[0].name,
      defaultRequirements: module ? PLACE_ON_LOCAL : PLACE_ON_REMOTE,
      collections,
      signer: params.signer,
      onDiagnostic: params.onDiagnostic,
      // The Switchboard serves no models over GraphQL; remote-only uses the loaded set.
      documentModelModules: module ? undefined : loadedModules,
    },
    remotes,
    Boolean(module),
  );
  await router.refreshFacts();
  return router;
}
