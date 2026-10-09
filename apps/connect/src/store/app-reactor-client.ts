import type { IReactorClient } from "@powerhousedao/reactor";
import { setFullReactorClient } from "@powerhousedao/reactor-browser";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import type * as MultiReactor from "./multi-reactor.js";
import type { LocalReactorModule } from "./multi-reactor.js";

type MultiReactorModule = typeof MultiReactor;

export type AppReactorClientParams = {
  multiReactor: boolean;
  /** Built, and ready: the worker has started up. */
  module: LocalReactorModule;
  remoteDriveUrl: string | undefined;
  signer: ISigner;
  documentModelModules: readonly DocumentModelModule[];
  loadRouter?: () => Promise<MultiReactorModule>;
};

const loadMultiReactor = (): Promise<MultiReactorModule> =>
  import("./multi-reactor.js");

/** Flag off: the local client, and the router module is never loaded. */
export async function selectAppReactorClient(
  params: AppReactorClientParams,
): Promise<IReactorClient> {
  if (!params.multiReactor) {
    if (window.ph?.fullReactorClient) {
      setFullReactorClient(undefined);
    }
    return params.module.client;
  }
  setFullReactorClient(undefined);
  const routed = await buildRouter(params);
  setFullReactorClient(routed);
  return routed ?? params.module.client;
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
    module: params.module,
    remoteGraphqlUrl,
    signer: params.signer,
    documentModelModules: params.documentModelModules,
  });
}
