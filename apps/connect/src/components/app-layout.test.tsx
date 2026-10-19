// @vitest-environment happy-dom

import type { PHStore } from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  bindPHStoreToWindow,
  createPHStore,
  PHStoreProvider,
} from "@powerhousedao/reactor-browser";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRoute,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  bindConnectRouter,
  createConnectRouter,
} from "../router/connect-router.js";
import type { ConnectRouteComponents } from "../router/route-components.js";
import type * as RuntimeConfigModule from "../runtime-config.js";
import { addConnectRoutes, connectRoutes } from "../router/route-tree.js";
import { AppLayout } from "./app-layout.js";
import { Sidebar } from "./sidebar.js";

// A declared plugin composition, as `ph run connect` serves it; undefined is classic Connect.
const served = vi.hoisted(() => ({
  composition: undefined as { module: string }[] | undefined,
}));
vi.mock("../runtime-config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeConfigModule>();
  return {
    ...actual,
    getRuntimeConfig: () =>
      served.composition
        ? { connect: { composition: served.composition } }
        : actual.getRuntimeConfig(),
  };
});

let store: PHStore;
let unbind: (() => void) | undefined;

const { rootRoute, appRoute } = connectRoutes();
const page = (name: string) => () => <p data-testid="page">{name}</p>;
// Project routes as their folders place them: _app/ inside the layout, others outside.
addConnectRoutes([
  createRoute({
    getParentRoute: () => appRoute,
    path: "reports",
    staticData: { nav: { label: "Reports", order: 20 } },
    component: page("reports"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "archive",
    staticData: { nav: { label: "Archive", order: 10 } },
    component: page("archive"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "focus",
    staticData: { sidebar: "hidden" },
    component: page("focus"),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "compact",
    staticData: { sidebar: "collapsed" },
    component: page("compact"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "kiosk",
    component: page("kiosk"),
  }),
]);

beforeAll(() => {
  store = createPHStore();
  store.drives = [];
  bindPHStoreToWindow(store);
  addPHEventHandlers();
});

afterEach(() => {
  cleanup();
  unbind?.();
  unbind = undefined;
  served.composition = undefined;
});

function mount(path: string, app: ConnectRouteComponents["app"] = AppLayout) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const connectRouter = createConnectRouter({
    store,
    history,
    components: { root: Outlet, app, content: page("home") },
  });
  unbind = bindConnectRouter(connectRouter, store);
  render(
    <PHStoreProvider store={store}>
      <RouterProvider router={connectRouter.router} />
    </PHStoreProvider>,
  );
  return { ...connectRouter, history };
}

const sidebar = () => document.getElementById("sidebar");
const shownPage = () => screen.getByTestId("page").textContent;
const navLinks = () =>
  Array.from(sidebar()!.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(
    (a) => a.getAttribute("aria-label") !== "Settings",
  );

describe("Connect's _app layout", () => {
  it("has the sidebar for core and _app routes, not for a route outside it", async () => {
    mount("/");
    await vi.waitFor(() => expect(shownPage()).toBe("home"));
    expect(sidebar()).toBeTruthy();
    cleanup();
    unbind?.();

    mount("/reports");
    await vi.waitFor(() => expect(shownPage()).toBe("reports"));
    expect(sidebar()).toBeTruthy();
    cleanup();
    unbind?.();

    mount("/kiosk");
    await vi.waitFor(() => expect(shownPage()).toBe("kiosk"));
    expect(sidebar()).toBeNull();
  });

  it("links the nav routes in order, marking the shown one", async () => {
    const { history } = mount("/reports");
    await vi.waitFor(() => expect(shownPage()).toBe("reports"));
    const [archive, reports] = navLinks();
    expect(navLinks().map((a) => a.getAttribute("href"))).toEqual([
      "/archive",
      "/reports",
    ]);
    expect(reports.getAttribute("aria-current")).toBe("page");
    expect(archive.getAttribute("aria-current")).toBeNull();

    act(() => {
      archive.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await vi.waitFor(() => expect(shownPage()).toBe("archive"));
    expect(history.location.pathname).toBe("/archive");
    expect(navLinks()[0].getAttribute("aria-current")).toBe("page");
    expect(navLinks()[1].getAttribute("aria-current")).toBeNull();
  });

  it("hides or collapses the sidebar by the route's staticData.sidebar", async () => {
    mount("/focus");
    await vi.waitFor(() => expect(shownPage()).toBe("focus"));
    expect(sidebar()).toBeNull();
    cleanup();
    unbind?.();

    mount("/compact");
    await vi.waitFor(() => expect(shownPage()).toBe("compact"));
    expect(sidebar()).toBeTruthy();
    expect(navLinks()).toEqual([]);
  });

  it("drops Connect's sidebar when a composition leaves out the generic plugin", async () => {
    served.composition = [{ module: "@powerhousedao/connect/plugins/sentry" }];
    mount("/");
    await vi.waitFor(() => expect(shownPage()).toBe("home"));
    expect(sidebar()).toBeNull();
    cleanup();
    unbind?.();

    served.composition = [{ module: "@powerhousedao/connect/plugins/generic" }];
    mount("/");
    await vi.waitFor(() => expect(shownPage()).toBe("home"));
    expect(sidebar()).toBeTruthy();
  });

  it("keeps a layout's own sidebar without the generic plugin", async () => {
    served.composition = [];
    function ProjectLayout() {
      return <AppLayout sidebar={<nav data-testid="own-sidebar" />} />;
    }
    mount("/", ProjectLayout);
    await vi.waitFor(() => expect(shownPage()).toBe("home"));
    expect(screen.getByTestId("own-sidebar")).toBeTruthy();
  });

  it("renders the core routes in a replacing layout built from the exported parts", async () => {
    function ProjectLayout() {
      return (
        <div data-testid="project-layout">
          <AppLayout
            sidebar={
              <Sidebar
                extraItems={
                  <a href="/help" data-testid="help">
                    Help
                  </a>
                }
              />
            }
          />
        </div>
      );
    }
    mount("/", ProjectLayout);
    await vi.waitFor(() => expect(shownPage()).toBe("home"));
    expect(screen.getByTestId("project-layout")).toBeTruthy();
    expect(sidebar()!.contains(screen.getByTestId("help"))).toBe(true);
  });
});
