// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  RouterProvider,
} from "@tanstack/react-router";
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Root } from "./root.js";
import {
  adoptPrerenderedShell,
  ColdStartPending,
  hasPrerenderedShell,
  LoadingShell,
  useReleasePrerenderedShell,
} from "./prerendered-shell.js";

const Fallback = () => <p>skeleton</p>;

function prerenderedRoot() {
  const root = document.createElement("div");
  root.innerHTML = `<div data-ph-shell style="display:contents"><div id="content-view">home</div></div>`;
  return root;
}

function Released() {
  useReleasePrerenderedShell(true);
  return null;
}

afterEach(() => {
  render(<Released />).unmount();
});

describe("prerendered shell", () => {
  it("renders the adopted markup in the same marked wrapper", () => {
    adoptPrerenderedShell(prerenderedRoot());
    const { container } = render(<LoadingShell Fallback={Fallback} />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.hasAttribute("data-ph-shell")).toBe(true);
    expect(shell.hasAttribute("inert")).toBe(true);
    expect(shell.style.display).toBe("contents");
    expect(shell.style.getPropertyValue("--ph-shell-t")).toMatch(/^-\d+ms$/);
    expect(shell.innerHTML).toBe(`<div id="content-view">home</div>`);
  });

  it("falls back once released, and when the page has no shell", () => {
    document.documentElement.classList.add("ph-shell-route", "ph-shell-embed");
    const critical = document.createElement("style");
    critical.setAttribute("data-ph-shell", "");
    document.head.append(critical);
    adoptPrerenderedShell(prerenderedRoot());
    render(<Released />);
    expect(hasPrerenderedShell()).toBe(false);
    // Its critical CSS would otherwise outrank the full stylesheet's rules.
    expect(document.head.querySelector("style[data-ph-shell]")).toBeNull();
    // The guard's classes go with the shell.
    expect(document.documentElement.classList.contains("ph-shell-route")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("ph-shell-embed")).toBe(
      false,
    );

    adoptPrerenderedShell(document.createElement("div"));
    render(<LoadingShell Fallback={Fallback} />);
    expect(screen.getByText("skeleton")).toBeTruthy();
  });

  it("keeps the shell on screen until the root's routed content commits", async () => {
    let resolve!: (module: { default: () => React.ReactNode }) => void;
    const rootRoute = createRootRoute({ component: Root });
    // As autoCodeSplitting splits a route's component.
    const index = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: lazyRouteComponent(
        () =>
          new Promise<{ default: () => React.ReactNode }>((r) => (resolve = r)),
      ),
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([index]),
      history: createMemoryHistory(),
      defaultPendingComponent: ColdStartPending,
    });
    adoptPrerenderedShell(prerenderedRoot());
    render(<RouterProvider router={router} />);
    // A lazy layout, e.g. a project's _app, would otherwise leave a blank frame.
    expect(await screen.findByText("home")).toBeTruthy();
    expect(hasPrerenderedShell()).toBe(true);
    act(() => resolve({ default: () => <p>page</p> }));
    expect(await screen.findByText("page")).toBeTruthy();
    expect(hasPrerenderedShell()).toBe(false);
    expect(screen.queryByText("home")).toBeNull();
  });

  it("adopts and releases core's variant the same way", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-ph-shell="core" style="display:contents"><header>Connect</header></div>`;
    const critical = document.createElement("style");
    critical.setAttribute("data-ph-shell", "core");
    document.head.append(critical);
    adoptPrerenderedShell(root);
    const { container } = render(<LoadingShell Fallback={Fallback} />);
    expect(container.innerHTML).toContain("<header>Connect</header>");
    render(<Released />);
    expect(hasPrerenderedShell()).toBe(false);
    expect(document.head.querySelector("style[data-ph-shell]")).toBeNull();
  });
});
