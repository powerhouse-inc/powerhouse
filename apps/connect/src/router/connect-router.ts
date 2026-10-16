import type { DriveArrivals, PHStore } from "@powerhousedao/reactor-browser";
import { getPHStoreSubscribe } from "@powerhousedao/reactor-browser";
import type { AnyRoute, Router, RouterHistory } from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";
import type { ErrorInfo, PropsWithChildren, ReactElement } from "react";
import { createElement } from "react";
import { captureException } from "../services/sentry.js";
import { markRouterNavigations } from "./perf-marks.js";
import { bindConnectScroll, connectScrollRestoration } from "./scroll.js";
import type { DriveRouteData } from "./drive-route-loader.js";
import { isDriveNotFound } from "./drive-route-loader.js";
import type {
  ConnectRootRoute,
  ConnectRouteComponents,
  ConnectRoutes,
} from "./route-tree.js";
import { createConnectNavigation } from "./navigation.js";
import { DriveNotFoundView, NotFoundView } from "./route-components.js";
import { addConnectRoutes, connectRoutes } from "./route-tree.js";
import { parseConnectSearch, stringifyConnectSearch } from "./search.js";
import { driveTitle } from "./titles.js";

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
  /** Ends every document title; "Connect" without one. */
  appName?: string;
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
  "homeRoute" | "driveRoute" | "settingsRoute"
> & { router: ConnectRouter };

export function createConnectRouter(
  options: ConnectRouterOptions,
): ConnectRouterBundle {
  if (options.routes) addConnectRoutes(options.routes);
  const { routeTree, homeRoute, driveRoute, settingsRoute } = connectRoutes();
  const router = createRouter({
    routeTree,
    basepath: options.basepath,
    history: options.history,
    context: {
      store: options.store,
      arrivals: options.arrivals,
      components: options.components,
      appName: options.appName,
    },
    parseSearch: parseConnectSearch,
    stringifySearch: stringifyConnectSearch,
    scrollRestoration: connectScrollRestoration(),
    scrollToTopSelectors: [`#${CONTENT_VIEW_ID}`],
    InnerWrap: options.InnerWrap,
    defaultErrorComponent: options.components.error,
    // Not per route: a route's notFoundComponent mounts a boundary that
    // re-renders on every navigation.
    defaultNotFoundComponent: ({ data }) =>
      isDriveNotFound(data)
        ? createElement(DriveNotFoundView, { driveSlug: data.driveSlug })
        : createElement(NotFoundView),
    defaultOnCatch: options.onCatch ?? reportRouteError,
  });
  return { router, homeRoute, driveRoute, settingsRoute };
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
  const { router, driveRoute } = connectRouter;

  // Only committed matches select; pending ones keep the open view.
  const commitSelection = () => {
    const matches = router.state.matches;
    const drive = matches.find((match) => match.routeId === driveRoute.id);
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

  // Set once, before the first render; selection setters navigate from the start.
  const navigation = createConnectNavigation(connectRouter);
  store.navigation = navigation;

  // The drive route's head reads names from the store; a rename re-runs it.
  const shownTitle = () => {
    const drive = router.state.matches.find((m) => m.routeId === driveRoute.id);
    return driveTitle(store, drive?.loaderData, router.options.context.appName);
  };
  let title = shownTitle();
  const retitle = () => {
    const next = shownTitle();
    if (next === title) return;
    title = next;
    void router.invalidate({ filter: (m) => m.routeId === driveRoute.id });
  };

  // Before mount, so the view and scroll restoration see the new selection.
  const unsubscribes = [
    router.subscribe("onBeforeRouteMount", commitSelection),
    router.subscribe("onResolved", commitSelection),
    router.subscribe("onResolved", () => {
      title = shownTitle();
    }),
    getPHStoreSubscribe(store, "drives")(retitle),
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
