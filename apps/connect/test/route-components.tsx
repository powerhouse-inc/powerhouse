import { connectRoutes } from "@powerhousedao/connect-core/router";
import type { AnyRoute, RouteComponent } from "@tanstack/react-router";

type RouteName =
  | "root"
  | "layout"
  | "home"
  | "drive"
  | "node"
  | "settings"
  | "splat";

type RouteOptions = { component?: unknown; pendingComponent?: unknown };

/** Sets route components on `routeTree` for a test; returns the restore. */
export function setRouteComponents(
  routeTree: AnyRoute,
  components: Partial<Record<RouteName, RouteComponent>>,
  pending?: RouteComponent,
) {
  const routes = connectRoutes(routeTree);
  // Unknown paths, inside the layout.
  const splat = (routes.appRoute.children as unknown as AnyRoute[]).find(
    (route) => (route.options as { path?: string }).path === "/$",
  );
  const byName = {
    root: routes.rootRoute,
    layout: routes.appRoute,
    home: routes.homeRoute,
    drive: routes.driveRoute,
    node: routes.nodeRoute,
    settings: routes.settingsRoute,
    splat,
  } as Record<RouteName, AnyRoute>;
  const saved: [RouteOptions, RouteOptions][] = [];
  const set = (route: AnyRoute, patch: RouteOptions) => {
    const options = route.options as RouteOptions;
    const before: RouteOptions = {};
    for (const key of Object.keys(patch) as (keyof RouteOptions)[]) {
      before[key] = options[key];
    }
    saved.push([options, before]);
    Object.assign(options, patch);
  };
  for (const [name, component] of Object.entries(components)) {
    set(byName[name as RouteName], { component });
  }
  if (pending) {
    set(routes.driveRoute, { pendingComponent: pending });
    set(routes.nodeRoute, { pendingComponent: pending });
  }
  return () => {
    for (const [options, before] of saved.reverse()) {
      Object.assign(options, before);
    }
  };
}
