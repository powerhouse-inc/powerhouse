/**
 * Connect's opt-in multi-reactor router wiring (multi-reactor stage 4, WP-E).
 *
 * When `connect.instance.multiReactor` is on, Connect routes through a
 * `RoutingReactorClient` over two backends -- the in-browser reactor it already
 * builds, plus a remote Switchboard backend -- instead of the single in-browser
 * client. The router IS an `IReactorClient`, so `window.ph.reactorClient` keeps
 * its shape and every reactor-browser hook is unaffected.
 *
 * Default behavior is UNCHANGED: when the flag is off, {@link selectAppReactorClient}
 * returns the single in-browser client untouched -- it never constructs a
 * router. The single-reactor path is exactly what it was before this work.
 */
import {
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  type IReactorClient,
} from "@powerhousedao/reactor";
import {
  RoutingReactorClient,
  withOwnershipGuard,
  type ReactorBackend,
  type ReactorCapabilities,
} from "@powerhousedao/reactor-router";
import { getSwitchboardGatewayUrlFromDriveUrl } from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { createRemoteSwitchboardBackend } from "./remote-switchboard-backend.js";

/** The in-browser reactor backend's router name. */
export const LOCAL_BACKEND_NAME = "connect-local";
/** The remote Switchboard backend's router name. */
export const REMOTE_BACKEND_NAME = "switchboard-remote";

/** Which host the in-browser reactor runs in; decides a few capability fields. */
export type LocalReactorKind = "worker" | "browser";

/**
 * The stage-2 capability contract for Connect's own in-browser reactor. A
 * worker-hosted reactor cannot be handed processor factories (they do not
 * survive postMessage) and is reached over RPC; a main-thread reactor can host
 * them and is reached directly. Both keep a durable idb store that self-heals,
 * route gql + brokered-local channels (WP-B), and never run workflows (the
 * engine is Node-only).
 */
export function localReactorCapabilities(
  kind: LocalReactorKind,
): ReactorCapabilities {
  const capabilities: ReactorCapabilities = {
    hosting: kind === "worker" ? "worker" : "in-process",
    storage: { kind: "idb", durable: true },
    processors: kind === "browser",
    workflows: false,
    inspection: kind === "worker" ? "rpc" : "direct",
    syncChannels: [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE],
    selfHeal: true,
  };
  return Object.freeze(capabilities);
}

export type MultiReactorBuildParams = {
  /** The in-browser reactor client Connect already built. */
  localClient: IReactorClient;
  /** Which host that client runs in. */
  localKind: LocalReactorKind;
  /** The remote Switchboard's reactor GraphQL endpoint (`<origin>/graphql`). */
  remoteGraphqlUrl: string;
  /** Models the remote backend signs batches with. */
  documentModels?: readonly DocumentModelModule[];
};

/**
 * Builds the two-backend routing client. Each backend's client is wrapped in
 * {@link withOwnershipGuard} -- no reactor validates drive ownership on its own
 * today, so the guard is the backend half of advisory routing: a write aimed at
 * the wrong backend is refused with a structured error the router can correct,
 * rather than a bare not-found. The in-browser backend is primary, so the
 * registry and creation-default questions no collection owns are answered
 * locally.
 */
export function buildMultiReactorClient(
  params: MultiReactorBuildParams,
): RoutingReactorClient {
  const localBackend: ReactorBackend = {
    name: LOCAL_BACKEND_NAME,
    client: withOwnershipGuard(params.localClient, {
      backendName: LOCAL_BACKEND_NAME,
    }),
    capabilities: localReactorCapabilities(params.localKind),
  };

  const remote = createRemoteSwitchboardBackend({
    name: REMOTE_BACKEND_NAME,
    graphqlUrl: params.remoteGraphqlUrl,
    documentModels: params.documentModels,
  });
  const remoteBackend: ReactorBackend = {
    name: remote.name,
    client: withOwnershipGuard(remote.client, {
      backendName: remote.name,
    }),
    capabilities: remote.capabilities,
  };

  return new RoutingReactorClient([localBackend, remoteBackend], {
    primaryBackend: LOCAL_BACKEND_NAME,
  });
}

/**
 * Derives the Switchboard reactor GraphQL endpoint from a configured remote
 * drive URL. A drive URL is `<origin>[/<prefix>]/d/<slug>`; the reactor GraphQL
 * endpoint is `<origin>[/<prefix>]/graphql`, so any reverse-proxy subpath is
 * preserved (collapsing to `<origin>/graphql` 404s a Switchboard mounted under
 * a prefix). Reuses Connect's existing drive-URL derivation rather than
 * re-deriving it. Returns undefined for a URL that will not parse, so the
 * caller can fall back to the single-reactor path with a warning rather than
 * throw during boot.
 */
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

export type SelectAppReactorClientParams = {
  /** The resolved multiReactor flag. */
  enabled: boolean;
  /** The single in-browser client, returned as-is when the flag is off. */
  localClient: IReactorClient;
  /**
   * Builds the router when the flag is on. Returns undefined when the router
   * cannot be built (e.g. no remote drive configured), so the caller falls back
   * to the single client.
   */
  buildRouter: () => RoutingReactorClient | undefined;
};

/**
 * Chooses the client Connect runs on. The default (flag off) path returns the
 * single in-browser client verbatim and NEVER constructs a router -- this is
 * the provable "default unchanged" seam. Only with the flag on is the router
 * built, and even then a failed build falls back to the single client.
 */
export function selectAppReactorClient(
  params: SelectAppReactorClientParams,
): IReactorClient {
  if (!params.enabled) {
    return params.localClient;
  }
  return params.buildRouter() ?? params.localClient;
}
