import type { PHStore } from "@powerhousedao/reactor-browser";
import { createDriveArrivals } from "@powerhousedao/reactor-browser";
import { getConnectPluginUi } from "../plugins/plugin-ui.js";
import { getConnectRegistry } from "../registry.js";
import type {
  ConnectRouterBundle,
  ConnectRouterOptions,
} from "./connect-router.js";
import { bindConnectRouter, createConnectRouter } from "./connect-router.js";
import { resolveConnectRoutes } from "./route-tree.js";

export type ConnectAppRouterOptions = Omit<
  ConnectRouterOptions,
  "store" | "arrivals"
>;

/** The app's one router over `store`; created, and made the store's navigation,
 * on first use. Registered routes join `options.routes`. */
export function getConnectAppRouter(
  store: PHStore,
  options: () => ConnectAppRouterOptions,
): ConnectRouterBundle {
  const registry = getConnectRegistry();
  const current = registry.app;
  if (current) {
    if (import.meta.env?.DEV && current.store !== store) {
      throw new Error("Connect's router is already bound to another PH store");
    }
    return current.bundle;
  }
  const { routes, ...rest } = options();
  const bundle = createConnectRouter({
    store,
    arrivals: createDriveArrivals(store),
    pluginUi: getConnectPluginUi(),
    ...rest,
    routes: (tree) => [
      ...(routes ? resolveConnectRoutes(routes, tree.routeTree) : []),
      ...registry.routes.flatMap((entry) => {
        entry.added = [
          ...resolveConnectRoutes(entry.registration, tree.routeTree),
        ];
        return entry.added;
      }),
    ],
  });
  registry.app = { store, bundle, unbind: bindConnectRouter(bundle, store) };
  return bundle;
}

/** Stops the app's router writing the selection, e.g. on HMR. */
export function disposeConnectAppRouter() {
  const registry = getConnectRegistry();
  registry.app?.unbind();
  registry.app = undefined;
}
