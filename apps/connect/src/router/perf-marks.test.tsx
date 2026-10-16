// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markNavigationClick,
  markRouterNavigations,
  PERF_STORAGE_KEY,
  ROUTER_MEASURES,
  routerPerfEnabled,
} from "./perf-marks.js";

function mountRouter() {
  const rootRoute = createRootRoute({ component: Outlet });
  const pages = ["a", "b"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      loader: () => new Promise((resolve) => setTimeout(resolve, 5)),
      component: () => <p>{path}</p>,
    }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(pages),
    history: createMemoryHistory({ initialEntries: ["/a"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const measures = () =>
  performance.getEntriesByType("measure").map((entry) => entry.name);

async function clickTo(router: ReturnType<typeof mountRouter>, to: string) {
  await vi.waitFor(() => expect(router.state.status).toBe("idle"));
  performance.clearMeasures();
  performance.clearMarks();
  markNavigationClick();
  await act(() => router.navigate({ to }));
}

let unmark: (() => void) | undefined;

beforeEach(() => {
  performance.clearMeasures();
  performance.clearMarks();
});

afterEach(() => {
  unmark?.();
  unmark = undefined;
  cleanup();
  localStorage.removeItem(PERF_STORAGE_KEY);
  window.history.replaceState(null, "", "/");
});

describe("router performance marks", () => {
  it("measures click, loader, commit and total when enabled", async () => {
    const router = mountRouter();
    unmark = markRouterNavigations(router, true);
    await clickTo(router, "/b");
    await vi.waitFor(() =>
      expect(measures()).toEqual(
        expect.arrayContaining(Object.values(ROUTER_MEASURES)),
      ),
    );
    const [loader] = performance.getEntriesByName(ROUTER_MEASURES.loader);
    expect(loader.duration).toBeGreaterThan(0);
    expect(performance.getEntriesByName("nav:click", "mark")).toHaveLength(1);
  });

  it("writes nothing when disabled", async () => {
    const router = mountRouter();
    unmark = markRouterNavigations(router, false);
    await clickTo(router, "/b");
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(measures()).toEqual([]);
    expect(performance.getEntriesByType("mark")).toEqual([]);
  });

  it("is on in dev, and elsewhere only with ?perf=1 or the storage flag", () => {
    expect(routerPerfEnabled(true)).toBe(true);
    expect(routerPerfEnabled(false)).toBe(false);
    window.history.replaceState(null, "", "/?perf=1");
    expect(routerPerfEnabled(false)).toBe(true);
    window.history.replaceState(null, "", "/");
    localStorage.setItem(PERF_STORAGE_KEY, "1");
    expect(routerPerfEnabled(false)).toBe(true);
  });
});
