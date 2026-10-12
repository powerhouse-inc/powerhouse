import {
  fromReactorClient,
  RoutingReactorClient,
  type RoutableBackendConfig,
  type RoutingClientOptions,
} from "@powerhousedao/reactor-router";
import type {
  ManagedReactor,
  ManagedRemoteReactor,
} from "@powerhousedao/reactor-monitor";

/** A remote reactor's client is unwired, so it is never a router backend. */
export type RoutableReactor = Exclude<ManagedReactor, ManagedRemoteReactor>;

export function isRoutable(
  reactor: ManagedReactor,
): reactor is RoutableReactor {
  return reactor.kind !== "remote";
}

// refusesMisroutes: false makes the router apply its own ownership guard.
export function routableBackend(
  reactor: RoutableReactor,
): RoutableBackendConfig {
  return {
    name: reactor.name,
    backend: fromReactorClient(reactor.client),
    facts: reactor.info,
    reach: reactor.reach,
    refusesMisroutes: false,
  };
}

/** The first reactor is the primary unless `options` names another. */
export function buildRoutingClient(
  reactors: readonly RoutableReactor[],
  options: RoutingClientOptions = {},
): RoutingReactorClient {
  return new RoutingReactorClient(reactors.map(routableBackend), options);
}
