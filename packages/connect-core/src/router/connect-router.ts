import type { DriveArrivals, PHStore } from "@powerhousedao/reactor-browser";
import {
  getPHStoreSubscribe,
  isRoutedModal,
  modalFromSearch,
} from "@powerhousedao/reactor-browser";
import type {
  AnyRoute,
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
  Router,
  RouterHistory,
} from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";
import type { ErrorInfo, PropsWithChildren, ReactElement } from "react";
import type { ConnectPluginUiSet } from "../plugins/plugin-ui.js";
import { applyConnectPluginUi } from "../plugins/plugin-ui.js";
import { markRouterNavigations } from "./perf-marks.js";
import { bindConnectScroll, connectScrollRestoration } from "./scroll.js";
import type { DriveRouteData } from "./drive-route-loader.js";
import type { ConnectRootRoute, ConnectRoutes } from "./route-tree.js";
import { createConnectNavigation } from "./navigation.js";
import {
  CONTENT_VIEW_ID,
  CoreNotFound,
  CoreError,
} from "./route-components.js";
import { addConnectRoutes, connectRoutes } from "./route-tree.js";
import { setSettingsRoute } from "./settings.js";
import { parseConnectSearch, stringifyConnectSearch } from "./search.js";
import { driveTitle } from "./titles.js";

export type ConnectRouterOptions = {
  store: PHStore;
  arrivals?: DriveArrivals;
  basepath?: string;
  history?: RouterHistory;
  InnerWrap?: (props: PropsWithChildren) => ReactElement;
  /** Shown while a route's loader or chunks are pending, after the router's `pendingMs`. */
  pendingComponent?: RouteComponent;
  /** Any route's loader or render error; the plugins', else core's error view. */
  errorComponent?: ErrorRouteComponent;
  /** The active plugins' UI, set on the routes that show core's views. */
  pluginUi?: ConnectPluginUiSet;
  /** Loaders' notFound(), e.g. a missing drive's; core's page by default. */
  notFoundComponent?: NotFoundRouteComponent;
  /** The tree to route with: `@powerhousedao/connect/route-tree`, core's or a project's. */
  routeTree: AnyRoute;
  /** Code routes added to the file routes; see `addConnectRoutes`. A function
   * receives the tree's core routes to attach to. */
  routes?:
    | readonly AnyRoute[]
    | ((routes: ConnectRoutes) => readonly AnyRoute[]);
  /** Reports a route's loader or render error; logged by default. */
  onCatch?: (error: unknown, info?: ErrorInfo) => void;
  /** Ends every document title; "Connect" without one. */
  appName?: string;
  /** Renders the loading shell: layouts show their pendingComponent, not their page. */
  shell?: boolean;
};

function reportRouteError(error: unknown, info?: ErrorInfo) {
  console.error(error, info?.componentStack ?? "");
}

/** The router over `TRouteTree`; a project's generated tree registers its own. */
export type ConnectRouterFor<TRouteTree extends AnyRoute> = Router<
  TRouteTree,
  "never",
  false,
  RouterHistory,
  Record<string, any>
>;
// Written out, not inferred; see ConnectRootRoute.
export type ConnectRouter = ConnectRouterFor<ConnectRootRoute>;
export type ConnectRouterBundle = Pick<
  ConnectRoutes,
  "homeRoute" | "driveRoute" | "nodeRoute" | "settingsRoute"
> & { router: ConnectRouter };

export function createConnectRouter(
  options: ConnectRouterOptions,
): ConnectRouterBundle {
  const { routeTree, homeRoute, driveRoute, nodeRoute, settingsRoute } =
    connectRoutes(options.routeTree);
  if (options.pluginUi) applyConnectPluginUi(routeTree, options.pluginUi);
  if (options.routes) {
    addConnectRoutes(
      typeof options.routes === "function"
        ? options.routes(connectRoutes(routeTree))
        : options.routes,
    );
  }
  setSettingsRoute(settingsRoute);
  const router = createRouter({
    routeTree,
    basepath: options.basepath,
    history: options.history,
    context: {
      store: options.store,
      arrivals: options.arrivals,
      appName: options.appName,
      shell: options.shell,
    },
    parseSearch: parseConnectSearch,
    stringifySearch: stringifyConnectSearch,
    scrollRestoration: connectScrollRestoration(),
    scrollToTopSelectors: [`#${CONTENT_VIEW_ID}`],
    InnerWrap: options.InnerWrap,
    defaultPendingComponent: options.pendingComponent,
    defaultErrorComponent:
      options.errorComponent ?? options.pluginUi?.errorComponent ?? CoreError,
    // Not per route: a route's notFoundComponent mounts a boundary that
    // re-renders on every navigation.
    defaultNotFoundComponent: options.notFoundComponent ?? CoreNotFound,
    defaultOnCatch: options.onCatch ?? reportRouteError,
  });
  return { router, homeRoute, driveRoute, nodeRoute, settingsRoute };
}

function writeSelection(store: PHStore, data: DriveRouteData | undefined) {
  // Drive first: a new drive resets the node.
  store.selectedDriveId = data?.driveId;
  store.selectedNodeId = data?.nodeId;
}

/** Makes `router` the store's navigation and writes the selection it commits. */
export function bindConnectRouter(
  connectRouter: ConnectRouterBundle,
  store: PHStore,
) {
  const { router, nodeRoute } = connectRouter;

  // Only committed matches select; pending ones keep the open view.
  const commitSelection = () => {
    const matches = router.state.matches;
    const drive = matches.find((match) => match.routeId === nodeRoute.id);
    if (drive) {
      if (drive.status === "success" && drive.loaderData) {
        writeSelection(store, drive.loaderData);
      } else if (matches.some((match) => match.status === "notFound")) {
        // The drive's 404 page shows no drive.
        writeSelection(store, undefined);
      }
      return;
    }
    // Any other page (home, settings, a project's, a 404) shows no drive.
    const shown = matches.at(-1)?.status;
    if (shown === "success" || shown === "notFound") {
      writeSelection(store, undefined);
    }
  };

  // A routed modal is the URL's: the store holds what the location names.
  const syncModal = () => {
    const routed = modalFromSearch(router.state.location.search);
    if (routed) {
      if (JSON.stringify(store.modal) !== JSON.stringify(routed)) {
        store.modal = routed;
      }
    } else if (isRoutedModal(store.modal)) {
      store.modal = undefined;
    }
  };

  // Set once, before the first render; selection setters navigate from the start.
  const navigation = createConnectNavigation(connectRouter);
  store.navigation = navigation;

  // The node route's head reads names from the store; a rename re-runs it.
  const shownTitle = () => {
    const node = router.state.matches.find((m) => m.routeId === nodeRoute.id);
    return driveTitle(store, node?.loaderData, router.options.context.appName);
  };
  let title = shownTitle();
  const retitle = () => {
    const next = shownTitle();
    if (next === title) return;
    title = next;
    void router.invalidate({ filter: (m) => m.routeId === nodeRoute.id });
  };

  // Before mount, so the view and scroll restoration see the new selection.
  const unsubscribes = [
    router.subscribe("onBeforeRouteMount", commitSelection),
    router.subscribe("onResolved", commitSelection),
    router.subscribe("onResolved", () => {
      title = shownTitle();
    }),
    router.subscribe("onResolved", syncModal),
    getPHStoreSubscribe(store, "drives")(retitle),
    markRouterNavigations(router),
  ];
  const unbindScroll = bindConnectScroll(router, CONTENT_VIEW_ID);
  commitSelection();
  syncModal();

  return () => {
    navigation.dispose();
    unbindScroll();
    for (const unsubscribe of unsubscribes) unsubscribe();
    if (store.navigation === navigation) store.navigation = undefined;
  };
}
