// @vitest-environment happy-dom

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The skeleton's chrome lives in design-system; stub it so the test needs no
// design-system barrel. Only the loading indicator's timing is under test.
vi.mock("@powerhousedao/design-system/connect", () => ({
  ConnectSidebar: () => <div data-testid="sidebar" />,
  HomeScreen: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="home-screen">{children}</div>
  ),
  LogoAnimation: () => <div data-testid="logo" />,
  getProjectLoader: () => null,
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  initTheme: vi.fn(),
}));

const { default: AppSkeleton, setPrerenderingCustomShell } =
  await import("./app-skeleton.js");
const { renderToString } = await import("react-dom/server");

/** The loading indicator is hidden by the `hidden` class, not by unmounting. */
function loaderIsVisible(): boolean {
  const el = document.querySelector(".skeleton-loader");
  if (!el) throw new Error("skeleton loader not rendered");
  return !el.classList.contains("hidden");
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.removeAttribute("data-show-loader");
});

afterEach(() => {
  vi.useRealTimers();
  document.body.removeAttribute("data-show-loader");
});

describe("AppSkeleton", () => {
  it("holds the loading indicator back for the delay", () => {
    render(<AppSkeleton />);

    expect(loaderIsVisible()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(loaderIsVisible()).toBe(true);
  });

  it("keeps the loading indicator visible when the skeleton remounts", () => {
    // The bootstrap renders the skeleton, then swaps in the config-dependent
    // app, whose Suspense fallback is the same skeleton. That swap remounts
    // the component. Re-arming the delay would blink the logo out for another
    // 250ms at exactly the moment the app is loading.
    const first = render(<AppSkeleton />);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(loaderIsVisible()).toBe(true);
    first.unmount();

    render(<AppSkeleton />);

    expect(loaderIsVisible()).toBe(true);
  });

  it("still holds the indicator back on a remount before the delay elapsed", () => {
    const first = render(<AppSkeleton />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    first.unmount();

    render(<AppSkeleton />);

    expect(loaderIsVisible()).toBe(false);
  });

  it("shows only the loader when the project's _app replaces Connect's layout", () => {
    const meta = document.createElement("meta");
    meta.name = "ph-custom-shell";
    meta.content = "true";
    document.head.appendChild(meta);
    try {
      const { queryByTestId } = render(<AppSkeleton />);
      expect(queryByTestId("sidebar")).toBeNull();
      expect(queryByTestId("home-screen")).toBeNull();
      expect(queryByTestId("logo")).not.toBeNull();
    } finally {
      meta.remove();
    }
  });

  // The prerendered shell is the first paint, before any meta tag is read: a
  // project's own layout must not get Connect's sidebar there (on a phone it
  // collapses to a lone settings button until the app has loaded).
  it("prerenders only the loader for a project's own layout", () => {
    setPrerenderingCustomShell(true);
    try {
      const html = renderToString(<AppSkeleton />);
      expect(html).not.toContain('data-testid="sidebar"');
      expect(html).not.toContain('data-testid="home-screen"');
      expect(html).toContain('data-testid="logo"');
    } finally {
      setPrerenderingCustomShell(false);
    }
  });

  it("prerenders Connect's chrome when the layout is Connect's", () => {
    const html = renderToString(<AppSkeleton />);
    expect(html).toContain('data-testid="sidebar"');
  });
});
