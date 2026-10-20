// What packages register with Connect. It lives on globalThis under a
// Symbol.for key, so every bundled copy of core reads and writes one registry.
import type { ConfigLoader } from "@powerhousedao/shared/connect/config-loader";
import type { PHStore } from "@powerhousedao/reactor-browser";
import type { AnyRoute } from "@tanstack/react-router";
import type { ConnectPluginDefinition } from "./plugins/types.js";
import type { ConnectRouterBundle } from "./router/connect-router.js";
import type { ConnectRoutes } from "./router/route-tree.js";

export type ConnectPluginDefinitions = Record<string, ConnectPluginDefinition>;

/** Code routes, or a function of the tree's core routes that returns them. */
export type ConnectRouteRegistration =
  | readonly AnyRoute[]
  | ((routes: ConnectRoutes) => readonly AnyRoute[]);

/** A registration, and the routes it added to a tree. */
export type ConnectRouteEntry = {
  registration: ConnectRouteRegistration;
  added: AnyRoute[];
};

/** The app's router, as `getConnectAppRouter` bound it. */
export type ConnectAppRouterBinding = {
  store: PHStore;
  bundle: ConnectRouterBundle;
  unbind: () => void;
};

export type ConnectRegistry = {
  routes: ConnectRouteEntry[];
  pluginLoaders: (() => Promise<ConnectPluginDefinitions>)[];
  plugins: ConnectPluginDefinitions;
  listeners: Set<() => void>;
  /** Route sources still loading, e.g. packages; unknown paths wait for them. */
  routeHolds?: { count: number; settled: Set<() => void> };
  app?: ConnectAppRouterBinding;
  runtimeConfig?: ConfigLoader;
};

const REGISTRY_KEY = Symbol.for("@powerhousedao/connect-core/registry");

type RegistryHost = { [REGISTRY_KEY]?: ConnectRegistry };

/** The realm's registry, created on first use. */
export function getConnectRegistry(): ConnectRegistry {
  const host = globalThis as RegistryHost;
  host[REGISTRY_KEY] ??= {
    routes: [],
    pluginLoaders: [],
    plugins: {},
    listeners: new Set(),
  };
  return host[REGISTRY_KEY];
}

export function notifyConnectRegistry(registry = getConnectRegistry()) {
  for (const listener of registry.listeners) listener();
}

export function subscribeConnectRegistry(listener: () => void) {
  const { listeners } = getConnectRegistry();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
