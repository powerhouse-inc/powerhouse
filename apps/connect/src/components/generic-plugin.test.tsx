// @vitest-environment happy-dom

import {
  bindConnectRouter,
  createConnectRouter,
} from "@powerhousedao/connect-core";
import {
  addConnectRoutes,
  connectRoutes,
  removeConnectRoutes,
} from "@powerhousedao/connect-core/router";
import {
  getConnectPluginUi,
  loadConnectPluginUi,
  registerConnectPlugins,
  resetConnectPluginUi,
} from "@powerhousedao/connect-core/plugins";
import { primeRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import type { PHStore } from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  bindPHStoreToWindow,
  createPHStore,
  PHStoreProvider,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnyRoute } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRoute,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RouteTreeModule from "@powerhousedao/connect/route-tree";
import { connectPlugins } from "../plugins/index.js";
import { GENERIC_PLUGIN } from "../plugins/ids.js";

let store: PHStore;
let unbind: (() => void) | undefined;
let routeTree: typeof RouteTreeModule.routeTree;

// The served config, as `ph run connect` projects a composition into it.
function serve(composition?: { module: string }[]) {
  primeRuntimeConfig({
    connect: { ...DEFAULT_CONNECT_CONFIG, composition },
  } as never);
}

beforeAll(async () => {
  serve();
  // Connect's chrome reads the config, and a build-time define, as it evaluates.
  vi.stubGlobal("PH_CONNECT_SENTRY_RELEASE", "test");
  ({ routeTree } = await import("@powerhousedao/connect/route-tree"));
  store = createPHStore();
  const drive = driveDocumentModelModule.utils.createDocument();
  drive.header.slug = "team";
  drive.header.name = "Team";
  drive.state.global.name = "Team";
  store.drives = [drive];
  bindPHStoreToWindow(store);
  addPHEventHandlers();
  registerConnectPlugins(connectPlugins);
}, 60_000);

afterEach(() => {
  cleanup();
  unbind?.();
  unbind = undefined;
  resetConnectPluginUi(routeTree);
});

// Connect's router as the app builds it, with the served composition's plugins' UI.
async function mount(path: string, composition?: { module: string }[]) {
  serve(composition);
  await loadConnectPluginUi(composition);
  const history = createMemoryHistory({ initialEntries: [path] });
  const connectRouter = createConnectRouter({
    routeTree,
    store,
    history,
    pluginUi: getConnectPluginUi(),
  });
  unbind = bindConnectRouter(connectRouter, store);
  render(
    <PHStoreProvider store={store}>
      <RouterProvider router={connectRouter.router} />
    </PHStoreProvider>,
  );
  return { ...connectRouter, history };
}

const settingsTabLabels = async () => {
  const nav = await screen.findByRole("navigation", { name: "Settings" });
  await vi.waitFor(() => expect(nav.querySelector("a")).toBeTruthy());
  return Array.from(within(nav).getAllByRole("link")).map((a) => a.textContent);
};

describe("Connect with and without the generic plugin", () => {
  it("sets its views only on routes the tree has", async () => {
    const { default: genericUi } = await import("../generic/ui.js");
    const ids = new Set<string>();
    const walk = (route: AnyRoute, parent?: string) => {
      const segment = (route.options as { id?: string }).id;
      const id =
        parent === undefined
          ? "__root__"
          : `${parent === "__root__" ? "" : parent}${segment}`;
      ids.add(id);
      for (const child of (route.children ?? []) as AnyRoute[]) walk(child, id);
    };
    walk(routeTree as AnyRoute);
    expect(
      Object.keys(genericUi.routes ?? {}).filter((id) => !ids.has(id)),
    ).toEqual([]);
  });

  it("is classic Connect when the composition has the generic plugin", async () => {
    await mount("/", [{ module: GENERIC_PLUGIN }]);
    await vi.waitFor(() =>
      expect(document.getElementById("sidebar")).toBeTruthy(),
    );
    await vi.waitFor(() => expect(screen.getByText("Team")).toBeTruthy());
    expect(screen.queryByRole("table", { name: "Drives" })).toBeNull();
  });

  it("is classic Connect without a declared composition", async () => {
    await mount("/");
    await vi.waitFor(() =>
      expect(document.getElementById("sidebar")).toBeTruthy(),
    );
    expect(screen.queryByRole("table", { name: "Drives" })).toBeNull();
  });

  it("renders core's views when the composition leaves the generic plugin out", async () => {
    await mount("/", [{ module: "@powerhousedao/connect/plugins/sentry" }]);
    const drives = await screen.findByRole("table", { name: "Drives" });
    expect(within(drives).getByRole("link", { name: "Team/" })).toBeTruthy();
    expect(document.getElementById("sidebar")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Switch to (dark|light) theme/ }),
    ).toBeTruthy();
  });

  it("lists Connect's settings tabs with the generic plugin, core's without", async () => {
    await mount("/settings", [{ module: GENERIC_PLUGIN }]);
    expect(await settingsTabLabels()).toEqual([
      "Package Manager",
      "Default Editors",
      "Danger Zone",
      "About",
    ]);
    cleanup();
    unbind?.();
    resetConnectPluginUi(routeTree);

    await mount("/settings", []);
    expect(await settingsTabLabels()).toEqual(["Appearance", "Packages"]);
  });

  it("lets a project route at a tab's path replace its view, keeping its options", async () => {
    const { genericSettingsTabs } = await import("../generic/index.js");
    const { settingsRoute } = connectRoutes(routeTree);
    // As a project's _app/settings/about.tsx joins the tree before the plugin's tabs.
    const about = createRoute({
      getParentRoute: () => settingsRoute,
      path: "about",
      ...genericSettingsTabs.about,
      component: () => <p>project about</p>,
    }) as AnyRoute;
    addConnectRoutes([about]);
    try {
      await mount("/settings/about", [{ module: GENERIC_PLUGIN }]);
      expect(await screen.findByText("project about")).toBeTruthy();
      expect(await settingsTabLabels()).toEqual([
        "Package Manager",
        "Default Editors",
        "Danger Zone",
        "About",
      ]);
    } finally {
      removeConnectRoutes([about]);
    }
  });
});
