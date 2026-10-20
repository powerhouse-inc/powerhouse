// @vitest-environment happy-dom

import type * as RouteTreeModule from "@powerhousedao/connect/route-tree";
import { primeRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import type { PHStore } from "@powerhousedao/reactor-browser";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import type { AnyRoute } from "@tanstack/react-router";
import { setRouteComponents } from "../../../test/route-components.js";
import {
  addPHEventHandlers,
  bindPHStoreToWindow,
  createPHStore,
  PHStoreProvider,
  showPHModal,
  useLinkProps,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRoute,
  HeadContent,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  addConnectRoutes,
  bindConnectRouter,
  connectRoutes,
  createConnectRouter,
  useForgetSettingsOpenedFrom,
} from "@powerhousedao/connect-core/router";
import {
  applyConnectPluginUi,
  mergeConnectPluginUi,
} from "@powerhousedao/connect-core/plugins";
import type { ComponentType } from "react";
import type * as GenericUiModule from "../ui.js";
import { SettingsPage } from "./settings-page.js";

let store: PHStore;
let unbind: (() => void) | undefined;
let routeTree: typeof RouteTreeModule.routeTree;

// Each mount picks the views of the generic plugin's tab routes; a tab without one is hidden.
let tabViews: Record<string, ComponentType> = {};
const CONNECT_TABS = [
  "ai-assistant",
  "package-manager",
  "default-editors",
  "danger-zone",
  "about",
];

function stubConnectTabs(genericUi: typeof GenericUiModule.default) {
  // The generic plugin's tabs, with core's hidden, as the app applies them.
  applyConnectPluginUi(routeTree, mergeConnectPluginUi([genericUi]));
  const { settingsRoute } = connectRoutes(routeTree);
  for (const route of settingsRoute.children as unknown as AnyRoute[]) {
    const path = ((route.options as { path?: string }).path ?? "").replace(
      /^\//,
      "",
    );
    if (!CONNECT_TABS.includes(path)) continue;
    const options = route.options as unknown as {
      component?: unknown;
      staticData: { settings: { enabled?: () => boolean } };
    };
    options.staticData.settings.enabled = () => path in tabViews;
    options.component = () => {
      const View = tabViews[path];
      return View ? <View /> : null;
    };
  }
  addConnectRoutes([
    // A project's tab, added under the settings layout as its route folder would.
    createRoute({
      getParentRoute: () => settingsRoute,
      path: "reports",
      staticData: { settings: { label: "Reports", order: 50 } },
      component: () => <p data-testid="tab">reports</p>,
    }),
  ]);
}

beforeAll(async () => {
  primeRuntimeConfig({ connect: DEFAULT_CONNECT_CONFIG } as never);
  // Connect's route views read the config, and a build-time define, as they evaluate.
  vi.stubGlobal("PH_CONNECT_SENTRY_RELEASE", "test");
  ({ routeTree } = await import("@powerhousedao/connect/route-tree"));
  stubConnectTabs((await import("../ui.js")).default);
  store = createPHStore();
  bindPHStoreToWindow(store);
  addPHEventHandlers();
});

beforeEach(() => {
  store.drives = [];
  store.selectedDriveId = undefined;
  store.selectedNodeId = undefined;
});

afterEach(() => {
  cleanup();
  unbind?.();
  unbind = undefined;
  restore?.();
  restore = undefined;
});

let restore: (() => void) | undefined;

const tab = (name: string) => () => <p data-testid="tab">{name}</p>;

function SettingsLink() {
  const link = useLinkProps({ settings: true });
  return (
    <a data-testid="settings-link" {...link}>
      Settings
    </a>
  );
}

function Root() {
  return (
    <>
      <HeadContent />
      <SettingsLink />
      <Outlet />
    </>
  );
}

function mount(
  path: string,
  views: Record<string, ComponentType> = {
    "package-manager": tab("packages"),
    "default-editors": tab("editors"),
    "danger-zone": tab("danger"),
    about: tab("about"),
  },
) {
  tabViews = views;
  const home = () => <p data-testid="home">home</p>;
  restore = setRouteComponents(routeTree, {
    root: Root,
    layout: Outlet,
    home,
    drive: home,
    node: () => null,
    settings: SettingsPage,
  });
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

function click(element: Element, init?: MouseEventInit) {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init,
      }),
    );
  });
}

const shownTab = () => screen.getByTestId("tab").textContent;
const tabLink = (name: string) => screen.getByRole("link", { name });

describe("Connect settings page", () => {
  it("redirects bare /settings to the first tab, in place", async () => {
    const { history } = mount("/settings");
    await vi.waitFor(() => expect(shownTab()).toBe("packages"));
    expect(history.location.pathname).toBe("/settings/package-manager");
    expect(history.length).toBe(1);
  });

  it("lists the tabs by order, a project's among them, and hides a missing one", async () => {
    mount("/settings/about");
    await vi.waitFor(() => expect(shownTab()).toBe("about"));
    const nav = screen.getByRole("navigation", { name: "Settings" });
    const labels = Array.from(nav.querySelectorAll("a")).map(
      (a) => a.textContent,
    );
    // No ai-assistant component from the shell, so no AI tab.
    expect(labels).toEqual([
      "Package Manager",
      "Default Editors",
      "Reports",
      "Danger Zone",
      "About",
    ]);
    expect(tabLink("Reports").getAttribute("href")).toBe("/settings/reports");
  });

  it("lists the ai assistant first when the shell provides it, and redirects from it when not", async () => {
    const { history } = mount("/settings/ai-assistant");
    await vi.waitFor(() => expect(shownTab()).toBe("packages"));
    expect(history.location.pathname).toBe("/settings/package-manager");
    cleanup();
    unbind?.();

    mount("/settings", { "ai-assistant": tab("ai"), about: tab("about") });
    await vi.waitFor(() => expect(shownTab()).toBe("ai"));
    expect(tabLink("AI Assistant").getAttribute("aria-current")).toBe("page");
  });

  it("switches tabs through links that mark the current one", async () => {
    const { history } = mount("/settings/package-manager");
    await vi.waitFor(() => expect(shownTab()).toBe("packages"));
    expect(tabLink("Package Manager").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(tabLink("About").getAttribute("aria-current")).toBeNull();

    click(tabLink("About"));
    await vi.waitFor(() => expect(shownTab()).toBe("about"));
    expect(history.location.pathname).toBe("/settings/about");
    expect(tabLink("About").getAttribute("aria-current")).toBe("page");
    expect(tabLink("Package Manager").getAttribute("aria-current")).toBeNull();

    click(tabLink("Reports"));
    await vi.waitFor(() => expect(shownTab()).toBe("reports"));
  });

  it("titles each tab", async () => {
    mount("/settings/default-editors");
    await vi.waitFor(() =>
      expect(document.title).toBe("Settings · Default Editors · Connect"),
    );
    click(tabLink("Danger Zone"));
    await vi.waitFor(() =>
      expect(document.title).toBe("Settings · Danger Zone · Connect"),
    );
    click(tabLink("Reports"));
    await vi.waitFor(() =>
      expect(document.title).toBe("Settings · Reports · Connect"),
    );
  });

  it("closes back to where it was opened, past its tab switches", async () => {
    const { history } = mount("/?theme=dark");
    await vi.waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    const link = screen.getByTestId("settings-link");
    expect(link.getAttribute("href")).toBe(
      "/settings/package-manager?theme=dark",
    );
    expect(link.getAttribute("aria-current")).toBeNull();

    click(link);
    await vi.waitFor(() => expect(shownTab()).toBe("packages"));
    expect(
      screen.getByTestId("settings-link").getAttribute("aria-current"),
    ).toBe("page");
    click(tabLink("About"));
    click(tabLink("Danger Zone"));
    await vi.waitFor(() => expect(shownTab()).toBe("danger"));
    // Already on settings: the sidebar link keeps the open tab.
    click(screen.getByTestId("settings-link"));
    expect(history.location.pathname).toBe("/settings/danger-zone");

    click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(history.location.pathname).toBe("/");
    expect(history.location.search).toBe("?theme=dark");
    expect(history.location.state.__TSR_index).toBe(0);
  });

  it("closes to home, not to a drive deleted from the danger zone", async () => {
    const drive = driveDocumentModelModule.utils.createDocument();
    drive.header.slug = "doomed";
    drive.header.name = "Doomed";
    store.drives = [drive];
    function DeletingTab() {
      const forgetOpenedFrom = useForgetSettingsOpenedFrom();
      const onDelete = () => {
        store.drives = [];
        void forgetOpenedFrom();
      };
      return (
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      );
    }
    const { history } = mount("/d/doomed", {
      "package-manager": tab("packages"),
      "danger-zone": DeletingTab,
    });
    await vi.waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    click(screen.getByTestId("settings-link"));
    click(await screen.findByRole("link", { name: "Danger Zone" }));
    click(await screen.findByRole("button", { name: "Delete" }));
    await vi.waitFor(() =>
      expect(
        Reflect.get(history.location.state, "phOpenedFrom"),
      ).toBeUndefined(),
    );

    click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(history.location.pathname).toBe("/"));
  });

  it("closes a deep-linked settings page to home", async () => {
    const { history } = mount("/settings/about");
    await vi.waitFor(() => expect(shownTab()).toBe("about"));
    click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    expect(history.location.pathname).toBe("/");
  });

  it("opens the page for showPHModal({ type: 'settings' })", async () => {
    const { history } = mount("/");
    await vi.waitFor(() => expect(screen.getByTestId("home")).toBeTruthy());
    act(() => showPHModal({ type: "settings" }));
    await vi.waitFor(() => expect(shownTab()).toBe("packages"));
    expect(history.location.pathname).toBe("/settings/package-manager");
    expect(store.modal).toBeUndefined();
  });
});
