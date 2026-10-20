// @vitest-environment happy-dom

import { createPHStore, PHStoreProvider } from "@powerhousedao/reactor-browser";
import { cleanup, render, screen } from "@testing-library/react";
import type { AnyRoute } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRoute,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyConnectPluginUi,
  loadConnectPluginUi,
  mergeConnectPluginUi,
  resetConnectPluginUi,
} from "../src/plugins/plugin-ui.js";
import { registerConnectPlugins } from "../src/plugins/plugin-host.js";
import type { ConnectPluginUi } from "../src/plugins/types.js";
import { getConnectRegistry } from "../src/registry.js";
import type { ConnectRoutes } from "../src/router/index.js";
import {
  connectRoutes,
  createConnectRouter,
  isCoreView,
} from "../src/router/index.js";
import { routeTree } from "../src/routeTree.gen.js";

const Layout = () => (
  <div>
    plugin layout
    <Outlet />
  </div>
);
const Home = () => <p>plugin home</p>;
const Tab = () => <p>plugin tab</p>;
const Modal = () => null;

const chrome: ConnectPluginUi = {
  routes: {
    "/_app": { component: Layout },
    "/_app/": { component: Home },
    "/_app/settings": { component: Outlet },
    "/_app/settings/appearance": { staticData: { settings: undefined } },
  },
  addRoutes: ({ settingsRoute }: ConnectRoutes) => [
    createRoute({
      getParentRoute: () => settingsRoute,
      path: "extra",
      staticData: { settings: { label: "Extra", order: 1 } },
      component: Tab,
    }) as AnyRoute,
  ],
  modals: { login: Modal },
  commonEditors: true,
};

const { appRoute, homeRoute, settingsRoute } = connectRoutes(routeTree);
const appearance = () =>
  (settingsRoute.children as unknown as AnyRoute[]).find(
    (route) => (route.options as { path?: string }).path === "/appearance",
  )!;

afterEach(() => {
  resetConnectPluginUi(routeTree);
  getConnectRegistry().ui = undefined;
  cleanup();
});

describe("merging plugins' UI", () => {
  it("lets a later plugin's routes and modals win, and keeps every root", () => {
    const RootA = () => null;
    const RootB = () => null;
    const set = mergeConnectPluginUi([
      { ...chrome, Root: RootA },
      {
        routes: { "/_app/": { pendingComponent: Tab } },
        modals: { login: Tab },
        Root: RootB,
      },
    ]);
    expect(set.routes["/_app/"]).toEqual({
      component: Home,
      pendingComponent: Tab,
    });
    expect(set.modals.login).toBe(Tab);
    expect(set.roots).toEqual([RootA, RootB]);
    expect(set.addRoutes).toHaveLength(1);
    expect(set.commonEditors).toBe(true);
    expect(set.consent).toBe(false);
    expect(mergeConnectPluginUi([{}, { consent: true }]).consent).toBe(true);
  });
});

describe("loading the active plugins' UI", () => {
  const chromeUi = vi.fn(() => Promise.resolve(chrome));
  const extraUi = vi.fn(() => Promise.resolve<ConnectPluginUi>({}));
  registerConnectPlugins({
    "@acme/chrome": {
      create: () => ({ name: "chrome" }) as never,
      ui: chromeUi,
    },
    "@acme/extra": { create: () => ({ name: "extra" }) as never, ui: extraUi },
    "@acme/config-only": { create: () => ({ name: "config" }) as never },
  });

  it("loads only the plugins a composition names", async () => {
    chromeUi.mockClear();
    extraUi.mockClear();
    const set = await loadConnectPluginUi([
      { module: "@acme/extra" },
      { module: "@acme/unknown" },
    ]);
    expect(extraUi).toHaveBeenCalledOnce();
    expect(chromeUi).not.toHaveBeenCalled();
    expect(set.commonEditors).toBe(false);
    expect(getConnectRegistry().ui).toBe(set);
  });

  it("loads every known plugin without a composition", async () => {
    chromeUi.mockClear();
    const set = await loadConnectPluginUi(undefined);
    expect(chromeUi).toHaveBeenCalledOnce();
    expect(set.routes["/_app/"]?.component).toBe(Home);
  });
});

describe("applying plugins' UI to a route tree", () => {
  it("replaces core's views and merges static data", () => {
    expect(isCoreView(homeRoute.options.component)).toBe(true);
    applyConnectPluginUi(routeTree, mergeConnectPluginUi([chrome]));
    expect(appRoute.options.component).toBe(Layout);
    expect(homeRoute.options.component).toBe(Home);
    expect(appearance().options.staticData?.settings).toBeUndefined();
    expect(isCoreView(appearance().options.component)).toBe(true);
  });

  it("leaves a route that a project's file replaced", () => {
    const ProjectHome = () => null;
    const coreHome = homeRoute.options.component;
    homeRoute.options.component = ProjectHome;
    try {
      applyConnectPluginUi(routeTree, mergeConnectPluginUi([chrome]));
      expect(homeRoute.options.component).toBe(ProjectHome);
    } finally {
      resetConnectPluginUi(routeTree);
      homeRoute.options.component = coreHome;
    }
  });

  it("undoes its changes and its routes", () => {
    const coreHome = homeRoute.options.component;
    const settings = appearance().options.staticData?.settings;
    applyConnectPluginUi(routeTree, mergeConnectPluginUi([chrome]));
    expect(settingsRoute.children).toHaveLength(3);
    resetConnectPluginUi(routeTree);
    expect(homeRoute.options.component).toBe(coreHome);
    expect(appearance().options.staticData?.settings).toBe(settings);
    expect(settingsRoute.children).toHaveLength(2);
  });
});

function mount(path: string, pluginUi = mergeConnectPluginUi([chrome])) {
  const store = createPHStore();
  const { router } = createConnectRouter({
    store,
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    pluginUi,
  });
  render(
    <PHStoreProvider store={store}>
      <RouterProvider router={router} />
    </PHStoreProvider>,
  );
}

describe("a router with plugins' UI", () => {
  it("renders the plugin's views in place of core's", async () => {
    mount("/");
    expect(await screen.findByText("plugin home")).toBeTruthy();
    expect(screen.getByText("plugin layout")).toBeTruthy();
  });

  it("serves the routes the plugin adds", async () => {
    mount("/settings/extra");
    expect(await screen.findByText("plugin tab")).toBeTruthy();
  });
});
