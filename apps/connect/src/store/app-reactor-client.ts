import type { IReactorClient } from "@powerhousedao/reactor";
import {
  getDrives,
  refreshReactorDataClient,
  setDrives,
  setFullReactorClient,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import type * as MultiReactor from "./multi-reactor.js";
import type { LocalReactorModule } from "./multi-reactor.js";
import type { ReactorClientMode } from "./reactor-client-mode.js";

type MultiReactorModule = typeof MultiReactor;

export type AppReactorClientParams = {
  mode: ReactorClientMode;
  /** Built, and ready (the worker has started up). Undefined in `remote`
   * mode, where no local reactor is built. */
  module: LocalReactorModule | undefined;
  remoteDriveUrl: string | undefined;
  signer: ISigner;
  documentModelModules: readonly DocumentModelModule[];
  loadRouter?: () => Promise<MultiReactorModule>;
};

const loadMultiReactor = (): Promise<MultiReactorModule> =>
  import("./multi-reactor.js");

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
    if (window.ph?.fullReactorClient) {
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

/** A Switchboard that cannot answer must not fail boot: list the tab's drives. */
export async function getAppDrives(
  client: IReactorClient,
  local: IReactorClient,
): Promise<DocumentDriveDocument[]> {
  if (client === local) {
    return getDrives(local);
  }
  try {
    return await getDrives(client);
  } catch (error) {
    logger.warn(
      "Could not list drives through the router; listing the local reactor's: @error",
      error,
    );
    return getDrives(local);
  }
}

export async function refreshAppDrives(
  client: IReactorClient,
  local: IReactorClient,
): Promise<void> {
  if (client === local) {
    return refreshReactorDataClient(client);
  }
  setDrives(await getAppDrives(client, local));
}

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
