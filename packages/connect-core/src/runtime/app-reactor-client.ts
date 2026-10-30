import type { IReactorClient } from "@powerhousedao/reactor";
import {
  getDrives,
  getFullReactorClient,
  getPHStore,
  recordBackendAuthError,
  setBackendAuth,
  setDrives,
  setFullReactorClient,
} from "@powerhousedao/reactor-browser";
import type {
  PHConnectRemoteBackend,
  PHConnectRouterSettings,
} from "@powerhousedao/shared/clis";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { ISigner } from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import type * as MultiReactor from "./multi-reactor.js";
import type {
  LoadedDocumentModels,
  LocalReactorModule,
} from "./multi-reactor.js";
import type { ReactorClientMode } from "./reactor-client-mode.js";
import { resolveReactorClientMode } from "./reactor-client-mode.js";
import { isReactorWorkerEnabled } from "./reactor-worker-flag.js";
import { setDriveRelister } from "./drive-relist.js";

// Kept here: multi-reactor.ts is loaded lazily.
const REMOTE_BACKEND_NAME = "switchboard-remote";

type MultiReactorModule = typeof MultiReactor;

export type AppReactorClientParams = {
  mode: ReactorClientMode;
  /** Built, and ready (the worker has started up). Undefined in `remote`
   * mode, where no local reactor is built. */
  module: LocalReactorModule | undefined;
  /** The fallback switchboard when `remoteBackends` is empty. */
  remoteDriveUrl: string | undefined;
  /** One per switchboard, by host key; `url` is a drive address on it. */
  remoteBackends?: readonly PHConnectRemoteBackend[];
  /** Where new drives go and the router's timeouts, from the host config. */
  router?: PHConnectRouterSettings;
  /** Config placements known at build time; later ones go through `setConfiguredPlacement`. */
  collections?: Readonly<Record<string, string>>;
  /** Signs routed writes; unsigned (anonymous) without one. */
  signer?: ISigner;
  documentModelModules: LoadedDocumentModels;
  loadRouter?: () => Promise<MultiReactorModule>;
};

const loadMultiReactor = (): Promise<MultiReactorModule> =>
  import("./multi-reactor.js");

/** What a mode builds in the tab; `remote` builds no local reactor (no PGlite). */
export type ReactorClientPlan = {
  mode: ReactorClientMode;
  /** `router`: the local reactor plus remote backends. */
  multiReactor: boolean;
  needsLocalReactor: boolean;
  /** The local reactor runs in the shared worker. */
  localAsWorker: boolean;
};

export function planReactorClient(
  mode: ReactorClientMode = resolveReactorClientMode(),
): ReactorClientPlan {
  const needsLocalReactor = mode !== "remote";
  return {
    mode,
    multiReactor: mode === "router",
    needsLocalReactor,
    localAsWorker:
      needsLocalReactor &&
      (mode === "worker" || (mode === "router" && isReactorWorkerEnabled())),
  };
}

/** Builds the tab's reactor, e.g. Connect's PGlite or worker reactor. */
export type LocalReactorFactory = (
  plan: ReactorClientPlan,
) => Promise<LocalReactorModule>;

export type CreateAppReactorClientOptions = Omit<
  AppReactorClientParams,
  "mode" | "module"
> & {
  plan?: ReactorClientPlan;
  /** Called only when the plan needs a local reactor. */
  localReactor?: LocalReactorFactory;
};

/** Builds the local reactor the plan needs, then selects the app's client. */
export async function createAppReactorClient(
  options: CreateAppReactorClientOptions,
) {
  const { localReactor, ...params } = options;
  const plan = options.plan ?? planReactorClient();
  let module: LocalReactorModule | undefined;
  if (plan.needsLocalReactor) {
    if (!localReactor) {
      throw new Error(
        `reactorClient mode "${plan.mode}" needs a local reactor; pass localReactor`,
      );
    }
    module = await localReactor(plan);
  }
  const { client, router } = await selectClient({
    ...params,
    mode: plan.mode,
    module,
  });
  return { plan, module, client, router };
}

/**
 * Pick the client for the resolved mode:
 *  - `in-process` / `worker`: the local client, router module never loaded.
 *  - `router`: the local reactor plus remote backends.
 *  - `remote`: a remote-only router — a full IReactorClient that proxies to
 *    the Switchboard over GraphQL with NO local reactor (no PGlite).
 */
export async function selectAppReactorClient(
  params: AppReactorClientParams,
): Promise<IReactorClient> {
  return (await selectClient(params)).client;
}

/** The app's client, and the router when it is one. */
async function selectClient(params: AppReactorClientParams): Promise<{
  client: IReactorClient;
  router?: MultiReactor.ConnectRoutingClient;
}> {
  if (params.mode === "remote") {
    setFullReactorClient(undefined);
    const remote = await buildRemoteOnly(params);
    setFullReactorClient(remote);
    return { client: remote, router: remote };
  }
  if (params.mode !== "router") {
    if (getPHStore()?.fullReactorClient) {
      setFullReactorClient(undefined);
    }
    return { client: requireModule(params).client };
  }
  setFullReactorClient(undefined);
  const routed = await buildRouter(params);
  setFullReactorClient(routed);
  return routed
    ? { client: routed, router: routed }
    : { client: requireModule(params).client };
}

function requireModule(params: AppReactorClientParams): LocalReactorModule {
  if (!params.module) {
    throw new Error(
      `reactorClient mode "${params.mode}" needs a local reactor, but none was built`,
    );
  }
  return params.module;
}

/**
 * A Switchboard that cannot answer must not fail boot: list the tab's drives.
 *
 * A Switchboard that REFUSES the caller (401/403) must not fail boot either:
 * the refusal is recorded (`backendAuth`) so the root view shows the sign-in
 * gate, and the drive list is empty until the user is someone the backend
 * accepts. A remote-only client has no local drives to fall back on.
 */
export async function getAppDrives(
  client: IReactorClient,
  local: IReactorClient,
): Promise<DocumentDriveDocument[]> {
  if (client === local) {
    try {
      const drives = await getDrives(local);
      setBackendAuth(undefined);
      return drives;
    } catch (error) {
      if (recordBackendAuthError(error, "switchboard")) {
        logger.warn(
          "The Switchboard refused this caller; showing the sign-in gate: @error",
          error,
        );
        return [];
      }
      throw error;
    }
  }
  try {
    const drives = await getDrives(client);
    setBackendAuth(undefined);
    return drives;
  } catch (error) {
    if (recordBackendAuthError(error, "switchboard")) {
      logger.warn(
        "A remote backend refused this caller; listing the local reactor's drives: @error",
        error,
      );
    } else {
      logger.warn(
        "Could not list drives through the router; listing the local reactor's: @error",
        error,
      );
    }
    return getDrives(local);
  }
}

/**
 * The boot refresh of the drives store. It lists through `getAppDrives`
 * whichever client is in use, so a Switchboard that refuses the caller is
 * recorded for the sign-in gate here too: the remote-only client is its own
 * `local`, and a bare `refreshReactorDataClient` would let the 401 escape
 * and fail the boot before the gate can render.
 */
export async function refreshAppDrives(
  client: IReactorClient,
  local: IReactorClient,
): Promise<void> {
  setDrives(await getAppDrives(client, local));
}

/**
 * Lists the drives again as the caller the tab now is, through the clients
 * boot left in the store: after a sign-in landing or a sign-out that followed
 * a backend's refusal. Nothing to do before boot has set a client.
 */
export async function relistAppDrives(): Promise<void> {
  const client = getFullReactorClient();
  if (!client) return;
  const local = getPHStore()?.reactorClientModule?.client ?? client;
  await refreshAppDrives(client, local);
}

// The backend auth gate relists through drive-relist (see there)
setDriveRelister(relistAppDrives);

/** The switchboards to route to: the host's remote backends, else the default drive's. */
function switchboardRemotes(params: AppReactorClientParams): {
  remotes: MultiReactor.SwitchboardRemote[];
  unparsed: string[];
} {
  const listed: readonly PHConnectRemoteBackend[] = params.remoteBackends
    ?.length
    ? params.remoteBackends
    : params.remoteDriveUrl
      ? [{ name: REMOTE_BACKEND_NAME, url: params.remoteDriveUrl }]
      : [];
  const remotes: MultiReactor.SwitchboardRemote[] = [];
  const unparsed: string[] = [];
  for (const { url, ...remote } of listed) {
    const graphqlUrl = switchboardOfDrive(url)?.graphql;
    if (graphqlUrl) remotes.push({ ...remote, graphqlUrl });
    else unparsed.push(url);
  }
  return { remotes, unparsed };
}

async function buildRouter(
  params: AppReactorClientParams,
): Promise<MultiReactor.ConnectRoutingClient | undefined> {
  const { remotes, unparsed } = switchboardRemotes(params);
  for (const url of unparsed) {
    logger.warn(
      "multiReactor is on but the remote drive URL @url does not parse; skipping it",
      url,
    );
  }
  if (remotes.length === 0) {
    logger.warn(
      "multiReactor is on but no remote drive URL is configured; using the local reactor only",
    );
    return undefined;
  }
  let multiReactor: MultiReactorModule;
  try {
    multiReactor = await (params.loadRouter ?? loadMultiReactor)();
  } catch (error) {
    logger.error("Could not load the multi-reactor router: @error", error);
    return undefined;
  }
  logger.info(
    "Multi-reactor routing to @urls",
    remotes.map((remote) => remote.graphqlUrl).join(", "),
  );
  return multiReactor.buildMultiReactorClient({
    module: requireModule(params),
    remotes,
    collections: params.collections,
    ...params.router,
    signer: params.signer,
    documentModelModules: params.documentModelModules,
  });
}

/**
 * The `remote` mode: a remote-only router — a full IReactorClient that proxies
 * to the Switchboard over GraphQL with NO local backend, so no local reactor
 * and no PGlite are ever built. A missing/unparseable remote URL is a hard
 * config error here (unlike `router`, there is no local reactor to fall back
 * to).
 */
async function buildRemoteOnly(
  params: AppReactorClientParams,
): Promise<MultiReactor.ConnectRoutingClient> {
  const { remotes, unparsed } = switchboardRemotes(params);
  if (unparsed.length > 0) {
    throw new Error(
      `reactorClient "remote": the remote drive URL "${unparsed[0]}" does not resolve to a Switchboard GraphQL endpoint`,
    );
  }
  if (remotes.length === 0) {
    throw new Error(
      'reactorClient "remote" needs a remote drive URL — declare a remote backend / default drive the client can proxy to',
    );
  }
  const multiReactor = await (params.loadRouter ?? loadMultiReactor)();
  logger.info(
    "Remote reactor client → @urls",
    remotes.map((remote) => remote.graphqlUrl).join(", "),
  );
  return multiReactor.buildMultiReactorClient({
    module: undefined,
    remotes,
    collections: params.collections,
    ...params.router,
    signer: params.signer,
    documentModelModules: params.documentModelModules,
  });
}
