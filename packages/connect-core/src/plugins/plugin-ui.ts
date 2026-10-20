import type { AnyRoute, ErrorRouteComponent } from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { ConnectRouteRegistration } from "../registry.js";
import { getConnectRegistry } from "../registry.js";
import type { ConnectModals } from "../router/modals.js";
import { isCoreView } from "../router/route-components.js";
import {
  addConnectRoutes,
  removeConnectRoutes,
  resolveConnectRoutes,
} from "../router/route-tree.js";
import { knownPlugins } from "./plugin-host.js";
import type { ConnectPluginUi, ConnectRouteUi } from "./types.js";

/** The active plugins' UI; a later plugin's routes and modals win. */
export type ConnectPluginUiSet = {
  routes: Record<string, ConnectRouteUi>;
  addRoutes: ConnectRouteRegistration[];
  modals: ConnectModals;
  roots: ComponentType[];
  errorComponent?: ErrorRouteComponent;
  commonEditors: boolean;
  consent: boolean;
};

const NO_UI: ConnectPluginUiSet = {
  routes: {},
  addRoutes: [],
  modals: {},
  roots: [],
  commonEditors: false,
  consent: false,
};

export function mergeConnectPluginUi(
  uis: readonly ConnectPluginUi[],
): ConnectPluginUiSet {
  const set: ConnectPluginUiSet = {
    routes: {},
    addRoutes: [],
    modals: {},
    roots: [],
    commonEditors: false,
    consent: false,
  };
  for (const ui of uis) {
    for (const [id, route] of Object.entries(ui.routes ?? {})) {
      set.routes[id] = { ...set.routes[id], ...route };
    }
    if (ui.addRoutes) set.addRoutes.push(ui.addRoutes);
    Object.assign(set.modals, ui.modals);
    if (ui.Root) set.roots.push(ui.Root);
    set.errorComponent = ui.errorComponent ?? set.errorComponent;
    set.commonEditors ||= ui.commonEditors ?? false;
    set.consent ||= ui.consent ?? false;
  }
  return set;
}

/** Loads the UI of the plugins `composition` names, or of every known plugin
 * without one (classic Connect), and keeps it for `getConnectPluginUi`. */
export async function loadConnectPluginUi(
  composition: readonly { module: string }[] | undefined,
): Promise<ConnectPluginUiSet> {
  const definitions = await knownPlugins();
  const modules = composition
    ? composition.map((entry) => entry.module)
    : Object.keys(definitions);
  const uis = await Promise.all(
    modules.map(
      (module) => definitions[module]?.ui?.() ?? Promise.resolve(undefined),
    ),
  );
  const set = mergeConnectPluginUi(
    uis.filter((ui): ui is ConnectPluginUi => !!ui),
  );
  getConnectRegistry().ui = set;
  return set;
}

/** The active plugins' UI; none until `loadRuntimeConfig` has loaded it. */
export function getConnectPluginUi(): ConnectPluginUiSet {
  return getConnectRegistry().ui ?? NO_UI;
}

type RouteOptions = Record<string, unknown> & { id?: string; path?: string };

const ROOT_ID = "__root__";

function forEachRoute(
  route: AnyRoute,
  visit: (route: AnyRoute, id: string) => void,
  parentId?: string,
) {
  const options = route.options as unknown as RouteOptions;
  const segment = options.id ?? options.path;
  const own =
    parentId === undefined || segment === undefined
      ? ROOT_ID
      : `${parentId === ROOT_ID ? "" : parentId}/${segment.replace(/^\//, "")}`;
  visit(route, own);
  for (const child of (route.children ?? []) as AnyRoute[]) {
    forEachRoute(child, visit, own);
  }
}

type Applied = { originals: Map<AnyRoute, RouteOptions>; added: AnyRoute[] };
const appliedTo = new WeakMap<AnyRoute, Applied>();

/** Sets `ui`'s route options on the tree's routes that still show core's view,
 * and adds its routes; `resetConnectPluginUi` undoes both. */
export function applyConnectPluginUi(
  routeTree: AnyRoute,
  ui: ConnectPluginUiSet = getConnectPluginUi(),
) {
  resetConnectPluginUi(routeTree);
  const applied: Applied = { originals: new Map(), added: [] };
  forEachRoute(routeTree, (route, id) => {
    const routeUi = ui.routes[id];
    const options = route.options as unknown as RouteOptions;
    if (!routeUi || !isCoreView(options.component)) return;
    const { staticData, ...views } = routeUi;
    const keys = [...Object.keys(views), ...(staticData ? ["staticData"] : [])];
    applied.originals.set(
      route,
      Object.fromEntries(keys.map((key) => [key, options[key]])),
    );
    Object.assign(options, views);
    if (staticData) {
      options.staticData = {
        ...(options.staticData as object | undefined),
        ...staticData,
      };
    }
  });
  for (const registration of ui.addRoutes) {
    const routes = resolveConnectRoutes(registration, routeTree);
    addConnectRoutes(routes);
    applied.added.push(...routes);
  }
  appliedTo.set(routeTree, applied);
}

/** Restores the routes `applyConnectPluginUi` changed and removes the ones it added. */
export function resetConnectPluginUi(routeTree: AnyRoute) {
  const applied = appliedTo.get(routeTree);
  if (!applied) return;
  for (const [route, originals] of applied.originals) {
    Object.assign(route.options, originals);
  }
  removeConnectRoutes(applied.added);
  appliedTo.delete(routeTree);
}
