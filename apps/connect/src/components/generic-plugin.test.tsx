// @vitest-environment happy-dom

import {
  bindConnectRouter,
  createConnectRouter,
} from "@powerhousedao/connect-core";
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
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RouteTreeModule from "@powerhousedao/connect/route-tree";
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
}, 60_000);

afterEach(() => {
  cleanup();
  unbind?.();
  unbind = undefined;
});

// Connect's router as the app builds it, for the served composition.
function mount(path: string, composition?: { module: string }[]) {
  serve(composition);
  const history = createMemoryHistory({ initialEntries: [path] });
  const connectRouter = createConnectRouter({
    routeTree,
    store,
    history,
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
  it("is classic Connect when the composition has the generic plugin", async () => {
    mount("/", [{ module: GENERIC_PLUGIN }]);
    await vi.waitFor(() =>
      expect(document.getElementById("sidebar")).toBeTruthy(),
    );
    await vi.waitFor(() => expect(screen.getByText("Team")).toBeTruthy());
    expect(screen.queryByRole("table", { name: "Drives" })).toBeNull();
  });

  it("is classic Connect without a declared composition", async () => {
    mount("/");
    await vi.waitFor(() =>
      expect(document.getElementById("sidebar")).toBeTruthy(),
    );
    expect(screen.queryByRole("table", { name: "Drives" })).toBeNull();
  });

  it("renders core's views when the composition leaves the generic plugin out", async () => {
    mount("/", [{ module: "@powerhousedao/connect/plugins/sentry" }]);
    const drives = await screen.findByRole("table", { name: "Drives" });
    expect(within(drives).getByRole("link", { name: "Team/" })).toBeTruthy();
    expect(document.getElementById("sidebar")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Switch to (dark|light) theme/ }),
    ).toBeTruthy();
  });

  it("lists Connect's settings tabs with the generic plugin, core's without", async () => {
    mount("/settings", [{ module: GENERIC_PLUGIN }]);
    expect(await settingsTabLabels()).toEqual([
      "Package Manager",
      "Default Editors",
      "Danger Zone",
      "About",
    ]);
    cleanup();
    unbind?.();

    mount("/settings", []);
    expect(await settingsTabLabels()).toEqual(["Appearance", "Packages"]);
  });
});
