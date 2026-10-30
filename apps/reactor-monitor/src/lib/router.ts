import { createSwitchboardBackend } from "@powerhousedao/reactor-browser/graphql-client";
import type {
  ManagedReactor,
  ManagedRemoteReactor,
} from "@powerhousedao/reactor-monitor";
import {
  fromReactorClient,
  RoutingReactorClient,
  type RoutableBackendConfig,
  type RoutingClientOptions,
} from "@powerhousedao/reactor-router";
import type { RemoteSettings } from "./route-seed.js";

/** The bearer a remote handle's inspection headers carry, if any. */
export async function bearerOf(
  reactor: Pick<ManagedRemoteReactor, "headers">,
): Promise<string | undefined> {
  const headers = (await reactor.headers?.()) ?? {};
  const value = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "authorization",
  )?.[1];
  const token = value?.replace(/^Bearer\s+/i, "").trim();
  return token ? token : undefined;
}

export type RouterBackendHandle = {
  readonly config: RoutableBackendConfig;
  /** Releases what the backend holds; a no-op for a local reactor. */
  readonly dispose: () => void;
};

// A remote routes over its switchboard's GraphQL, unsigned. Without
// `settings` (a router built by hand), live updates stay off.
export function routableBackend(
  reactor: ManagedReactor,
  settings?: RemoteSettings,
): RouterBackendHandle {
  if (reactor.kind === "remote") {
    const backend = createSwitchboardBackend({
      name: reactor.name,
      url: reactor.url,
      tokenProvider: () => bearerOf(reactor),
      signer: undefined,
      documentModels: () => [],
      realtime: settings?.realtime ?? false,
      ...(settings?.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: settings.requestTimeoutMs }),
      ...(settings?.breaker === undefined ? {} : { breaker: settings.breaker }),
      ...(reactor.fetch ? { fetch: reactor.fetch } : {}),
    });
    return { config: backend.config, dispose: () => backend.dispose() };
  }
  // refusesMisroutes: false makes the router apply its own ownership guard.
  return {
    config: {
      name: reactor.name,
      backend: fromReactorClient(reactor.client),
      facts: reactor.info,
      reach: reactor.reach,
      refusesMisroutes: false,
    },
    dispose: () => undefined,
  };
}

export type BuiltRouter = {
  readonly client: RoutingReactorClient;
  readonly dispose: () => void;
};

/** The first reactor is the primary unless `options` names another. */
export function buildRoutingClient(
  reactors: readonly ManagedReactor[],
  options: RoutingClientOptions = {},
  connections: Readonly<Record<string, RemoteSettings>> = {},
): BuiltRouter {
  const handles = reactors.map((reactor) =>
    routableBackend(
      reactor,
      Object.hasOwn(connections, reactor.name)
        ? connections[reactor.name]
        : undefined,
    ),
  );
  const dispose = () => {
    for (const handle of handles) handle.dispose();
  };
  try {
    const client = new RoutingReactorClient(
      handles.map((handle) => handle.config),
      options,
    );
    return { client, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
