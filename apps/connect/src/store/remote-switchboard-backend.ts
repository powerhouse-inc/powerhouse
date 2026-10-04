/**
 * The remote-Switchboard router backend (multi-reactor stage 4, WP-E).
 *
 * Reuses Connect's existing GraphQL seam -- `GraphQLReactorClient` -- as the
 * remote reactor's client. That client implements only the `IReactorBrowserClient`
 * subset of `IReactorClient` (get, subscribe, execute, getOperations, create,
 * deleteDocument), so this module adapts it to the full `IReactorClient` the
 * router's `ReactorBackend` requires: the subset delegates to the GraphQL
 * client, and every other member throws BY NAME rather than resolving to a
 * silent wrong answer. That honest-degradation posture is deliberate -- the
 * same one reactor-monitor's remote `unwired.ts` takes -- because a stub that
 * read green while nothing worked is the exact failure mode this initiative
 * exists to stamp out.
 *
 * Completing the remaining surface (drive choreography, find, relationships,
 * jobs, batches) over GraphQL is the follow-up that makes the remote backend a
 * first-class routing target; the router + ownership guard + capability wiring
 * is what this work package delivers.
 */
import {
  POLLING_CHANNEL_TYPE,
  type IDriveClient,
  type IReactorClient,
} from "@powerhousedao/reactor";
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser";
import type {
  ReactorBackend,
  ReactorCapabilities,
} from "@powerhousedao/reactor-router";
import type { BearerTokenProvider } from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

/** The `IReactorClient` members the GraphQL client can actually serve. */
const DELEGATED_METHODS: ReadonlySet<string> = new Set([
  "get",
  "subscribe",
  "execute",
  "getOperations",
  "create",
  "deleteDocument",
]);

/**
 * A remote reactor reached over HTTP/GraphQL is not this process's to open,
 * close or heal; it registers its own processors in its own realm and routes a
 * resolver-driven `polling` sync channel. Mirrors reactor-monitor's
 * `remoteReactorCapabilities` shape without a live `info()` round trip --
 * placement needs the static contract, not a health reading.
 */
export function remoteSwitchboardCapabilities(): ReactorCapabilities {
  const capabilities: ReactorCapabilities = {
    hosting: "remote",
    storage: { kind: "remote", durable: true },
    processors: true,
    workflows: false,
    inspection: "none",
    syncChannels: [POLLING_CHANNEL_TYPE],
    selfHeal: false,
  };
  return Object.freeze(capabilities);
}

export type RemoteSwitchboardBackendOptions = {
  /** Stable router backend name. */
  name: string;
  /** The Switchboard's reactor GraphQL endpoint, e.g. `<origin>/graphql`. */
  graphqlUrl: string;
  /** Models the client signs multi-action batches with. */
  documentModels?: readonly DocumentModelModule[];
  /** Defaults to the ambient Renown token provider (the logged-in user). */
  tokenProvider?: BearerTokenProvider;
};

/**
 * Wraps a 6-method `GraphQLReactorClient` as a complete `IReactorClient`.
 *
 * A Proxy rather than a hand-written 25-method class: the codebase's own RPC
 * layer (`reactor-browser/src/rpc/client-proxy.ts`) is built the same way, and a
 * Proxy keeps the one honest rule in one place -- delegate what the GraphQL
 * client serves, refuse everything else by name -- instead of 20 near-identical
 * throwing stubs. `then`/symbol reads resolve to undefined so the object is not
 * mistaken for a thenable by `await` or a promise check.
 */
function asFullReactorClient(
  gql: GraphQLReactorClient,
  backendName: string,
): IReactorClient {
  const notSupported = (member: string): never => {
    throw new Error(
      `Remote Switchboard backend '${backendName}' does not support '${member}': its GraphQL client serves only ${[
        ...DELEGATED_METHODS,
      ].join(
        ", ",
      )} in the router v1 document surface (multi-reactor stage 4, WP-E).`,
    );
  };

  const drives = new Proxy({} as IDriveClient, {
    get(_target, prop) {
      if (typeof prop !== "string") {
        return undefined;
      }
      return () => notSupported(`drives.${prop}`);
    },
  });

  return new Proxy({} as IReactorClient, {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then") {
        return undefined;
      }
      if (prop === "drives") {
        return drives;
      }
      if (DELEGATED_METHODS.has(prop)) {
        const value = (gql as unknown as Record<string, unknown>)[prop];
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(gql)
          : value;
      }
      return (..._args: unknown[]) => notSupported(prop);
    },
  });
}

/** Builds the remote-Switchboard backend the router routes remote drives to. */
export function createRemoteSwitchboardBackend(
  options: RemoteSwitchboardBackendOptions,
): ReactorBackend {
  const gql = new GraphQLReactorClient({
    url: options.graphqlUrl,
    documentModels: options.documentModels,
    tokenProvider: options.tokenProvider,
  });
  return {
    name: options.name,
    client: asFullReactorClient(gql, options.name),
    capabilities: remoteSwitchboardCapabilities(),
  };
}
