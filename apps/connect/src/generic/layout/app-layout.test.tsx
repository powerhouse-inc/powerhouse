// @vitest-environment happy-dom

import type * as RouteTreeModule from "@powerhousedao/connect/route-tree";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import type { PHStore } from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  bindPHStoreToWindow,
  createPHStore,
  PHStoreProvider,
} from "@powerhousedao/reactor-browser";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { RouteComponent } from "@tanstack/react-router";
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
} from "@powerhousedao/connect-core/router";
import { setRouteComponents } from "../../../test/route-components.js";
import type * as RuntimeConfigModule from "@powerhousedao/connect-core/runtime-config";
import { primeRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import {
  addConnectRoutes,
  connectRoutes,
} from "@powerhousedao/connect-core/router";
import { useConnectChrome } from "@powerhousedao/connect/layout";
import { AppLayout } from "./app-layout.js";
import { Sidebar } from "./sidebar.js";

// A declared plugin composition, as `ph run connect` serves it; undefined is classic Connect.
const served = vi.hoisted(() => ({
  composition: undefined as { module: string }[] | undefined,
}));
vi.mock(
  "@powerhousedao/connect-core/runtime-config",
  async (importOriginal) => {
    const actual = await importOriginal<typeof RuntimeConfigModule>();
    return {
      ...actual,
      getRuntimeConfig: () =>
        served.composition
          ? { connect: { composition: served.composition } }
          : actual.getRuntimeConfig(),
    };
  },
);

let store: PHStore;
let unbind: (() => void) | undefined;
let restore: (() => void) | undefined;

let routeTree: typeof RouteTreeModule.routeTree;
const page = (name: string) => () => <p data-testid="page">{name}</p>;

// Project routes as their folders place them: _app/ inside the layout, others outside.
function addProjectRoutes() {
  const { rootRoute, appRoute } = connectRoutes(routeTree);
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
}

beforeAll(async () => {
  primeRuntimeConfig({ connect: DEFAULT_CONNECT_CONFIG } as never);
  // Connect's route views read the config, and a build-time define, as they evaluate.
  vi.stubGlobal("PH_CONNECT_SENTRY_RELEASE", "test");
  ({ routeTree } = await import("@powerhousedao/connect/route-tree"));
  addProjectRoutes();
  store = createPHStore();
  store.drives = [];
  bindPHStoreToWindow(store);
  addPHEventHandlers();
});

afterEach(() => {
  cleanup();
  unbind?.();
  unbind = undefined;
  restore?.();
  restore = undefined;
  served.composition = undefined;
});

function mount(path: string, layout: RouteComponent = () => <AppLayout />) {
  restore = setRouteComponents(routeTree, {
    root: Outlet,
    layout,
    home: page("home"),
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

  // A phone shows Connect's sidebar as a bar under the page; a project's own keeps its place.
  // The layout flips to a bar under the page, by CSS, when its child is Connect's sidebar.
  it("marks Connect's sidebar for the phone layout, passed in, wrapped or not, and not a project's own", async () => {
    const marked = () =>
      sidebar()!
        .closest("[role=presentation]")!
        .querySelector(":scope > [data-connect-sidebar]");
    const layouts = {
      default: () => <AppLayout />,
      passed: () => <AppLayout sidebar={<Sidebar extraItems={null} />} />,
      wrapped: () => {
        // A project component that reads hooks, then renders Connect's sidebar.
        const ProjectSidebar = () => <Sidebar extraItems={null} />;
        return <AppLayout sidebar={<ProjectSidebar />} />;
      },
      own: () => <AppLayout sidebar={<nav id="sidebar" />} />,
    };
    for (const [name, layout] of Object.entries(layouts)) {
      mount("/", layout);
      await vi.waitFor(() => expect(shownPage()).toBe("home"));
      expect(!!marked(), name).toBe(name !== "own");
      expect(sidebar()!.closest("[role=presentation]")!.className).toContain(
        "max-sm:has-[>[data-connect-sidebar]]:flex-col-reverse",
      );
      cleanup();
      unbind?.();
      unbind = undefined;
      restore?.();
      restore = undefined;
    }
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

  const frame = () => (
    <AppLayout
      header={<header data-testid="header" />}
      footer={<footer data-testid="footer" />}
    />
  );
  const inOrder = (a: Element, b: Element) =>
    !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("puts a header and footer around the page, beside the sidebar", async () => {
    mount("/reports", frame);
    await vi.waitFor(() => expect(shownPage()).toBe("reports"));
    const header = screen.getByTestId("header");
    const footer = screen.getByTestId("footer");
    const shown = screen.getByTestId("page");
    expect(inOrder(header, shown) && inOrder(shown, footer)).toBe(true);
    expect(sidebar()!.contains(header)).toBe(false);
    expect(sidebar()).toBeTruthy();
  });

  it("drops the sidebar, header and footer when embedded", async () => {
    window.history.replaceState(null, "", "/?embed=1");
    try {
      mount("/reports", frame);
      await vi.waitFor(() => expect(shownPage()).toBe("reports"));
      expect(sidebar()).toBeNull();
      expect(screen.queryByTestId("header")).toBeNull();
      expect(screen.queryByTestId("footer")).toBeNull();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("tells a replaced layout what Connect's shows", async () => {
    const seen: Record<string, unknown> = {};
    const layout = (name: string) =>
      function ProjectLayout() {
        seen[name] = useConnectChrome();
        return <Outlet />;
      };
    for (const path of ["/reports", "/focus", "/compact"]) {
      mount(path, layout(path));
      await vi.waitFor(() => expect(shownPage()).toBe(path.slice(1)));
      cleanup();
      unbind?.();
      unbind = undefined;
      restore?.();
      restore = undefined;
    }
    expect(seen).toEqual({
      "/reports": {
        embedded: false,
        sidebarHidden: false,
        sidebarCollapsed: false,
      },
      "/focus": {
        embedded: false,
        sidebarHidden: true,
        sidebarCollapsed: false,
      },
      "/compact": {
        embedded: false,
        sidebarHidden: false,
        sidebarCollapsed: true,
      },
    });
  });
});
