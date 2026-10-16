import type { DriveArrivals, PHStore } from "@powerhousedao/reactor-browser";
import type { AnyRoute, Router, RouterHistory } from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";
import type { ErrorInfo, PropsWithChildren, ReactElement } from "react";
import { captureException } from "../services/sentry.js";
import { markRouterNavigations } from "./perf-marks.js";
import { bindConnectScroll, connectScrollRestoration } from "./scroll.js";
import type { DriveRouteData } from "./drive-route-loader.js";
import type {
  ConnectRootRoute,
  ConnectRouteComponents,
  ConnectRoutes,
} from "./route-tree.js";
import { createConnectNavigation } from "./navigation.js";
import { addConnectRoutes, connectRoutes } from "./route-tree.js";
import { parseConnectSearch, stringifyConnectSearch } from "./search.js";

/** The scroll container of the content view. */
export const CONTENT_VIEW_ID = "content-view";

export type ConnectRouterOptions = {
  store: PHStore;
  arrivals?: DriveArrivals;
  components: ConnectRouteComponents;
  basepath?: string;
  history?: RouterHistory;
  InnerWrap?: (props: PropsWithChildren) => ReactElement;
  /** Code routes added to Connect's file routes; see `addConnectRoutes`. */
  routes?: readonly AnyRoute[];
  /** Reports a route's loader or render error; Sentry by default. */
  onCatch?: (error: unknown, info?: ErrorInfo) => void;
};

function reportRouteError(error: unknown, info?: ErrorInfo) {
  captureException(
    error,
    info?.componentStack
      ? { data: { componentStack: info.componentStack } }
      : undefined,
  );
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
  "homeRoute" | "driveRoute"
> & { router: ConnectRouter };

export function createConnectRouter(
  options: ConnectRouterOptions,
): ConnectRouterBundle {
  if (options.routes) addConnectRoutes(options.routes);
  const { routeTree, homeRoute, driveRoute } = connectRoutes();
  const router = createRouter({
    routeTree,
    basepath: options.basepath,
    history: options.history,
    context: {
      store: options.store,
      arrivals: options.arrivals,
      components: options.components,
    },
    parseSearch: parseConnectSearch,
    stringifySearch: stringifyConnectSearch,
    scrollRestoration: connectScrollRestoration(),
    scrollToTopSelectors: [`#${CONTENT_VIEW_ID}`],
    InnerWrap: options.InnerWrap,
    defaultErrorComponent: options.components.error,
    defaultOnCatch: options.onCatch ?? reportRouteError,
  });
  return { router, homeRoute, driveRoute };
}

function writeSelection(store: PHStore, data: DriveRouteData | undefined) {
  // Revision history belongs to the document it was opened for.
  if (store.selectedNodeId !== data?.nodeId) {
    store.revisionHistoryVisible = false;
  }
  // Drive first: a new drive resets the node.
  store.selectedDriveId = data?.driveId;
  store.selectedNodeId = data?.nodeId;
}

/** Makes `router` the store's navigation and writes the selection it commits. */
export function bindConnectRouter(
  connectRouter: ConnectRouterBundle,
  store: PHStore,
) {
  const { router, homeRoute, driveRoute } = connectRouter;

  // Only committed matches select; pending ones keep the open view.
  const commitSelection = () => {
    const matches = router.state.matches;
    const drive = matches.find((match) => match.routeId === driveRoute.id);
    if (drive) {
      if (drive.status === "success" && drive.loaderData) {
        writeSelection(store, drive.loaderData);
      }
      return;
    }
    const home = matches.find((match) => match.routeId === homeRoute.id);
    if (home?.status === "success") writeSelection(store, undefined);
  };

  // Set once, before the first render; selection setters navigate from the start.
  const navigation = createConnectNavigation(connectRouter);
  store.navigation = navigation;

  // Before mount, so the view and scroll restoration see the new selection.
  const unsubscribes = [
    router.subscribe("onBeforeRouteMount", commitSelection),
    router.subscribe("onResolved", commitSelection),
    markRouterNavigations(router),
  ];
  const unbindScroll = bindConnectScroll(router, CONTENT_VIEW_ID);
  commitSelection();

  return () => {
    navigation.dispose();
    unbindScroll();
    for (const unsubscribe of unsubscribes) unsubscribe();
    if (store.navigation === navigation) store.navigation = undefined;
  };
}
