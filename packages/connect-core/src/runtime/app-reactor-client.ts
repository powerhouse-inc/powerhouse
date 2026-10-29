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
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { ISigner } from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import type * as MultiReactor from "./multi-reactor.js";
import type {
  LoadedDocumentModels,
  LocalReactorModule,
} from "./multi-reactor.js";
import type { ReactorClientMode } from "./reactor-client-mode.js";
import { resolveReactorClientMode } from "./reactor-client-mode.js";
import { isReactorWorkerEnabled } from "./reactor-worker-flag.js";
import { setDriveRelister } from "./drive-relist.js";

type MultiReactorModule = typeof MultiReactor;

export type AppReactorClientParams = {
  mode: ReactorClientMode;
  /** Built, and ready (the worker has started up). Undefined in `remote`
   * mode, where no local reactor is built. */
  module: LocalReactorModule | undefined;
  remoteDriveUrl: string | undefined;
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
  const client = await selectAppReactorClient({
    ...params,
    mode: plan.mode,
    module,
  });
  return { plan, module, client };
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
  if (params.mode === "remote") {
    setFullReactorClient(undefined);
    const remote = await buildRemoteOnly(params);
    setFullReactorClient(remote);
    return remote;
  }
  if (params.mode !== "router") {
    if (getPHStore()?.fullReactorClient) {
      setFullReactorClient(undefined);
    }
    return requireModule(params).client;
  }
  setFullReactorClient(undefined);
  const routed = await buildRouter(params);
  setFullReactorClient(routed);
  return routed ?? requireModule(params).client;
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

async function buildRouter(
  params: AppReactorClientParams,
): Promise<IReactorClient | undefined> {
  if (!params.remoteDriveUrl) {
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
  const remoteGraphqlUrl = multiReactor.deriveSwitchboardGraphqlUrl(
    params.remoteDriveUrl,
  );
  if (!remoteGraphqlUrl) {
    logger.warn(
      "multiReactor is on but the remote drive URL @url does not parse; using the local reactor only",
      params.remoteDriveUrl,
    );
    return undefined;
  }
  logger.info("Multi-reactor routing to @url", remoteGraphqlUrl);
  return multiReactor.buildMultiReactorClient({
    module: requireModule(params),
    remoteGraphqlUrl,
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
): Promise<IReactorClient> {
  if (!params.remoteDriveUrl) {
    throw new Error(
      'reactorClient "remote" needs a remote drive URL — declare a remote backend / default drive the client can proxy to',
    );
  }
  const multiReactor = await (params.loadRouter ?? loadMultiReactor)();
  const remoteGraphqlUrl = multiReactor.deriveSwitchboardGraphqlUrl(
    params.remoteDriveUrl,
  );
  if (!remoteGraphqlUrl) {
    throw new Error(
      `reactorClient "remote": the remote drive URL "${params.remoteDriveUrl}" does not resolve to a Switchboard GraphQL endpoint`,
    );
  }
  logger.info("Remote reactor client → @url", remoteGraphqlUrl);
  return multiReactor.buildMultiReactorClient({
    module: undefined,
    remoteGraphqlUrl,
    signer: params.signer,
    documentModelModules: params.documentModelModules,
  });
}
