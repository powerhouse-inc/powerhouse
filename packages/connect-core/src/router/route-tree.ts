// The app's route tree: core's own, or a project's generated one when its
// tsconfig maps this specifier to the tree.
import type { AnyRoute } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import type {
  FileRoutesById,
  routeTree as appRouteTree,
} from "@powerhousedao/connect-core/route-tree";
import type {
  ConnectRouteEntry,
  ConnectRouteRegistration,
} from "../registry.js";
import {
  getConnectRegistry,
  notifyConnectRegistry,
  subscribeConnectRegistry,
} from "../registry.js";
import type { DRIVE_ROUTE_ID, NODE_ROUTE_ID } from "./route-data.js";

export { DRIVE_PENDING_MS } from "./route-components.js";
export type { ConnectRouteRegistration } from "../registry.js";

/** The home route's id; a tree change that moves it is a type error here. */
export const HOME_ROUTE_ID = "/_app/" satisfies keyof FileRoutesById;
/** The `_app` layout's id; a project's _app/ routes nest in it. */
export const APP_ROUTE_ID = "/_app";
const SETTINGS_ROUTE_ID = "/_app/settings";

type RouteOptions = { id?: string; path?: string };

// Generated routes carry their full id only once a router initialises them.
function findChild(parent: AnyRoute, idOrPath: string) {
  const children = (parent.children ?? []) as AnyRoute[];
  const child = children.find((route) => {
    const options = route.options as RouteOptions;
    return options.id === idOrPath || options.path === idOrPath;
  });
  if (!child) throw new Error(`Connect's route tree lacks ${idOrPath}`);
  return child;
}

// Named, so declarations name the tree instead of inlining its type.
export type ConnectRootRoute = typeof appRouteTree;
export type ConnectRoutes = {
  routeTree: ConnectRootRoute;
  rootRoute: ConnectRootRoute;
  appRoute: FileRoutesById[typeof APP_ROUTE_ID];
  homeRoute: FileRoutesById[typeof HOME_ROUTE_ID];
  /** The drive layout, around the node route. */
  driveRoute: FileRoutesById[typeof DRIVE_ROUTE_ID];
  /** The open folder or document; the drive's root without a node. */
  nodeRoute: FileRoutesById[typeof NODE_ROUTE_ID];
  settingsRoute: FileRoutesById[typeof SETTINGS_ROUTE_ID];
};

/** Connect's routes in `routeTree`, core's or a project's generated one, which
 * holds the same routes. Deployment routes attach to these. */
export function connectRoutes(routeTree: AnyRoute): ConnectRoutes {
  const appRoute = findChild(routeTree, APP_ROUTE_ID);
  const driveRoute = findChild(appRoute, "/d/$driveSlug");
  return {
    routeTree: routeTree as ConnectRootRoute,
    rootRoute: routeTree as ConnectRootRoute,
    appRoute: appRoute as ConnectRoutes["appRoute"],
    homeRoute: findChild(appRoute, "/") as ConnectRoutes["homeRoute"],
    driveRoute: driveRoute as ConnectRoutes["driveRoute"],
    nodeRoute: findChild(
      driveRoute,
      "/{-$nodeSlug}",
    ) as ConnectRoutes["nodeRoute"],
    settingsRoute: findChild(
      appRoute,
      "/settings",
    ) as ConnectRoutes["settingsRoute"],
  };
}

/** Code routes, e.g. `createRoute({ getParentRoute: () => rootRoute })`, join
 * their parent's file routes; an embedding app without the router plugin adds routes so. */
export function addConnectRoutes(routes: readonly AnyRoute[]) {
  for (const route of routes) {
    const parent = route.options.getParentRoute() as AnyRoute | undefined;
    if (!parent) throw new Error("A Connect route needs getParentRoute");
    const children = (parent.children ?? []) as AnyRoute[];
    if (children.includes(route)) continue;
    // A project's file route at its path replaces it, as documented: no warning.
    const path = (route.options as RouteOptions).path;
    if (path && children.some((child) => samePath(child, path))) continue;
    parent.addChildren([...children, route]);
  }
}

const trimSlashes = (path: string) => path.replace(/^\/+|\/+$/g, "");

function samePath(route: AnyRoute, path: string) {
  const own = (route.options as RouteOptions).path;
  return own !== undefined && trimSlashes(own) === trimSlashes(path);
}

/** Takes `routes` out of their parents, e.g. when the module that made them is replaced. */
export function removeConnectRoutes(routes: readonly AnyRoute[]) {
  for (const route of routes) {
    const parent = route.options.getParentRoute() as AnyRoute | undefined;
    const children = (parent?.children ?? []) as AnyRoute[];
    if (children.includes(route)) {
      parent?.addChildren(children.filter((child) => child !== route));
    }
  }
}

/** The routes `registration` gives for `tree`'s core routes. */
export function resolveConnectRoutes(
  registration: ConnectRouteRegistration,
  tree: AnyRoute,
): readonly AnyRoute[] {
  return typeof registration === "function"
    ? registration(connectRoutes(tree))
    : registration;
}

/** Adds code routes to the app's router, e.g. a package's settings tab below
 * `settingsRoute`; a running router takes them in. Returns the unregister. */
export function registerConnectRoutes(
  registration: ConnectRouteRegistration,
): () => void {
  const registry = getConnectRegistry();
  const entry: ConnectRouteEntry = { registration, added: [] };
  registry.routes = [...registry.routes, entry];
  const bound = registry.app;
  if (bound) {
    const tree = bound.bundle.router.routeTree;
    entry.added = [...resolveConnectRoutes(registration, tree)];
    addConnectRoutes(entry.added);
    rebuildRoutes(bound.bundle.router);
  }
  return () => {
    registry.routes = registry.routes.filter((other) => other !== entry);
    const router = registry.app?.bundle.router;
    const ids = new Set<string>(entry.added.map((route) => route.id as string));
    const remove = () => {
      // The router reads a cached match's route later; those go with them.
      router?.clearCache({ filter: (match) => ids.has(match.routeId) });
      removeConnectRoutes(entry.added);
      if (router) rebuildRoutes(router);
    };
    // Leaving a route needs it: from one of these, go home before they go.
    const open = router?.state.matches.some((match) => ids.has(match.routeId));
    if (router && open) {
      void router.navigate({ to: "/", replace: true }).then(remove);
    } else {
      remove();
    }
  };
}

/** A file route a package offers to other Connects; `ph build` generates the
 * list from its hosts/connect/routes, parents before children. */
export type PackageRoute = {
  route: AnyRoute;
  /** The route's full id, e.g. `/_app/reports`. */
  id: string;
  /** Its path below its parent, e.g. `/reports`; none for a pathless layout. */
  path?: string;
  /** Its parent's full id: a Connect route's, or one of the package's. */
  parentId: string;
};

const ROOT_ID = "__root__";

// Before a router initialises a tree, its ids are only in the routes' options.
function findRouteById(tree: AnyRoute, id: string): AnyRoute | undefined {
  if (id === ROOT_ID) return tree;
  const walk = (route: AnyRoute, routeId: string): AnyRoute | undefined => {
    for (const child of (route.children ?? []) as AnyRoute[]) {
      const options = child.options as RouteOptions;
      const own = options.id ?? options.path ?? "";
      const childId = `${routeId}${own.startsWith("/") ? "" : "/"}${own}`;
      if (childId === id) return child;
      if (id.startsWith(childId)) {
        const found = walk(child, childId);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(tree, "");
}

function routeHolds() {
  const registry = getConnectRegistry();
  registry.routeHolds ??= { count: 0, settled: new Set() };
  return registry.routeHolds;
}

/** Marks routes as still loading, e.g. a package's; unknown paths wait for
 * them before showing not found. Returns the release. */
export function holdConnectRoutes() {
  const holds = routeHolds();
  holds.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds.count--;
    if (holds.count > 0) return;
    for (const settle of holds.settled) settle();
    holds.settled.clear();
  };
}

/** Resolves once no routes are loading, or after `timeoutMs`. */
export function connectRoutesSettled(timeoutMs = 10_000) {
  const holds = routeHolds();
  if (holds.count === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      holds.settled.delete(settle);
      resolve();
    };
    const timer = setTimeout(settle, timeoutMs);
    holds.settled.add(settle);
  });
}

/** Adds a package's file routes below the app's routes with the same ids; a
 * route whose id the app already serves is skipped. Returns the unregister. */
export function registerPackageRoutes(routes: readonly PackageRoute[]) {
  return registerConnectRoutes(({ routeTree }) => {
    const own = new Map<string, AnyRoute>();
    for (const entry of routes) {
      const parent =
        own.get(entry.parentId) ?? findRouteById(routeTree, entry.parentId);
      if (!parent) {
        console.warn(
          `[connect] no route "${entry.parentId}" for "${entry.id}"`,
        );
        continue;
      }
      if (findRouteById(routeTree, entry.id)) {
        console.warn(
          `[connect] a route already serves "${entry.id}"; skipping`,
        );
        continue;
      }
      const relativeId = entry.path ?? entry.id.slice(entry.parentId.length);
      entry.route.update({
        id: relativeId,
        path: entry.path,
        getParentRoute: () => parent,
      } as never);
      own.set(entry.id, entry.route);
    }
    return [...own.values()];
  });
}

type RebuildableRouter = {
  buildRouteTree(): unknown;
  setRoutes(caches: never): void;
  invalidate(): Promise<unknown>;
};

function rebuildRoutes(router: RebuildableRouter) {
  router.setRoutes(router.buildRouteTree() as never);
  void router.invalidate();
  // For views that list routes, e.g. the nav and the settings tabs.
  notifyConnectRegistry();
}

/** The router's routes by id, read again when routes are added or removed. */
export function useRoutesById() {
  const router = useRouter();
  const routesById = () => router.routesById;
  // The server snapshot too: the loading shell is prerendered.
  return useSyncExternalStore(subscribeConnectRegistry, routesById, routesById);
}
