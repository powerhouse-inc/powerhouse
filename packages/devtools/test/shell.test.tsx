// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevtoolsProps } from "../src/props.js";
import { REGISTRY } from "../src/registry.js";
import { DevtoolsRoot, DevtoolsStandalone } from "../src/shell/root.js";
import { INFO_REFRESH_MS, INFO_RETRY_MS } from "../src/shell/use-info.js";
import { TEST_REGISTRY } from "./registry.fixture.js";
import { stackInfo } from "./stack.fixture.js";
import { clearStorage, savedView, seedView } from "./storage.fixture.js";

const HOST: DevtoolsProps = {};

const INFO = stackInfo({
  startedAt: new Date(Date.now() - 120_000).toISOString(),
});

const frame = () => screen.queryByTestId("ph-devtools");
const panel = () => screen.getByTestId("ph-panel");
const palette = () => screen.queryByTestId("ph-devtools-palette");
const open = (panel: string, tab?: string) =>
  seedView({ open: true, target: { panel, ...(tab && { tab }) } });

function renderDock(url = "/") {
  window.history.replaceState(null, "", url);
  return render(<DevtoolsRoot {...HOST} registry={TEST_REGISTRY} />);
}

function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

const chord = (code: string) => press({ code, altKey: true, shiftKey: true });

function stubInfo(response: () => Response) {
  const meta = document.createElement("meta");
  meta.name = "ph-devtools-token";
  meta.content = "token";
  document.head.append(meta);
  const fetchMock = vi.fn((...[input]: Parameters<typeof fetch>) =>
    Promise.resolve(
      String(input).endsWith("/info")
        ? response()
        : Response.json(
            { error: { code: "not_found", message: "No such route." } },
            { status: 404 },
          ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(clearStorage);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("the dock", () => {
  it("opens from the launcher on the default page, and leaves the URL alone", () => {
    renderDock("/?sort=name");
    const entries = window.history.length;
    expect(frame()).toBeNull();

    fireEvent.click(screen.getByTestId("ph-launcher"));

    expect(window.location.search).toBe("?sort=name");
    expect(window.history.length).toBe(entries);
    expect(savedView().open).toBe(true);
    expect(frame()?.getAttribute("data-mode")).toBe("docked");
    expect(panel().getAttribute("data-panel")).toBe("alpha");
    expect(panel().textContent).toContain("alpha page");
    expect(screen.queryByTestId("ph-launcher")).toBeNull();
  });

  it("rests the launcher left of what the app reserves at the bottom-right corner", () => {
    const x = () =>
      Number(
        /translate\((-?[\d.]+)px/.exec(
          screen.getByTestId("ph-launcher-bar").style.transform,
        )?.[1],
      );
    renderDock();
    const corner = x();
    expect(corner).toBeGreaterThan(0);
    cleanup();

    window.history.replaceState(null, "", "/");
    render(
      <DevtoolsRoot
        {...HOST}
        registry={TEST_REGISTRY}
        bottomRightReserved={72}
      />,
    );

    expect(x()).toBe(corner - 64);
  });

  it("keeps the inset for the bottom-right corner only", () => {
    localStorage.setItem(
      "ph-devtools:launcher-anchor",
      JSON.stringify("bottom-left"),
    );
    render(
      <DevtoolsRoot
        {...HOST}
        registry={TEST_REGISTRY}
        bottomRightReserved={72}
      />,
    );
    expect(screen.getByTestId("ph-launcher-bar").style.transform).toMatch(
      /^translate\(16px, /,
    );
  });

  it("shows the inset drop target while the launcher is dragged", () => {
    render(
      <DevtoolsRoot
        {...HOST}
        registry={TEST_REGISTRY}
        bottomRightReserved={72}
      />,
    );
    const launcher = screen.getByTestId("ph-launcher");
    screen.getByTestId("ph-launcher-bar").setPointerCapture = () => {};

    fireEvent.pointerDown(launcher, { button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(launcher, { clientX: 400, clientY: 300 });

    const targets = [
      ...document.querySelectorAll<HTMLElement>("[data-launcher-target]"),
    ].map((target) => target.style.transform);
    const { innerWidth: width, innerHeight: height } = window;
    expect(targets).toHaveLength(8);
    expect(targets).toContain(`translate(16px, ${height - 16}px)`);
    expect(targets).toContain(`translate(${width - 16}px, 16px)`);
    expect(targets).toContain(
      `translate(${width - 16 - 64}px, ${height - 16}px)`,
    );
    expect(targets).not.toContain(
      `translate(${width - 16}px, ${height - 16}px)`,
    );
  });

  it("goes to the page of a clicked nav item, with no history entry", () => {
    open("alpha");
    renderDock("/?sort=name");
    const entries = window.history.length;

    fireEvent.click(
      screen.getAllByRole("button", { name: "Beta" }).at(0) as HTMLElement,
    );

    expect(savedView().panel).toBe("beta");
    expect(window.location.search).toBe("?sort=name");
    expect(window.history.length).toBe(entries);
    expect(panel().getAttribute("data-panel")).toBe("beta");
    expect(panel().getAttribute("data-tab")).toBe("second");
    for (const item of screen.getAllByRole("button", { name: "Beta" }))
      expect(item.getAttribute("aria-current")).toBe("page");
    for (const item of screen.getAllByRole("button", { name: "Alpha" }))
      expect(item.getAttribute("aria-current")).toBeNull();
  });

  it("names DevTools in its bar, whichever page shows", () => {
    open("alpha");
    renderDock();
    const title = () => screen.getByTestId("ph-devtools-title").textContent;
    expect(title()).toBe("PH DevTools");

    fireEvent.click(
      screen.getAllByRole("button", { name: "Beta" }).at(0) as HTMLElement,
    );

    expect(panel().getAttribute("data-panel")).toBe("beta");
    expect(title()).toBe("PH DevTools");
  });

  it("changes the tab from the tab bar, with no history entry", () => {
    open("beta");
    renderDock();
    const entries = window.history.length;
    expect(
      screen.getByRole("tab", { name: "Second" }).getAttribute("aria-selected"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "First" }));

    expect(savedView().tab).toBe("first");
    expect(window.history.length).toBe(entries);
    expect(panel().getAttribute("data-tab")).toBe("first");
    expect(panel().textContent).toContain("beta first tab");
    expect(
      screen.getByRole("tab", { name: "First" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "Second" }).getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("shows no tab bar for a page with one tab", () => {
    open("alpha");
    renderDock();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("closes: shows the launcher and leaves the URL alone", () => {
    open("beta", "first");
    renderDock("/?sort=name");

    fireEvent.click(screen.getByTestId("ph-devtools-close"));

    expect(window.location.search).toBe("?sort=name");
    expect(savedView().open).toBe(false);
    expect(frame()).toBeNull();
    expect(screen.getByTestId("ph-launcher")).toBeTruthy();
  });

  it("reopens where it was closed, focus included", () => {
    seedView({
      open: true,
      target: { panel: "beta", tab: "first", focus: { kind: "a", id: "1" } },
    });
    renderDock();
    fireEvent.click(screen.getByTestId("ph-devtools-close"));
    fireEvent.click(screen.getByTestId("ph-launcher"));

    expect(panel().getAttribute("data-tab")).toBe("first");
    expect(savedView()).toEqual({
      open: true,
      panel: "beta",
      tab: "first",
      focus: "a:1",
    });
  });

  it("comes back as it was after a reload", () => {
    renderDock();
    fireEvent.click(screen.getByTestId("ph-launcher"));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Beta" }).at(0) as HTMLElement,
    );
    fireEvent.click(screen.getByRole("tab", { name: "First" }));
    cleanup();

    renderDock();

    expect(frame()?.getAttribute("data-mode")).toBe("docked");
    expect(panel().getAttribute("data-panel")).toBe("beta");
    expect(panel().getAttribute("data-tab")).toBe("first");
  });

  it("starts a new tab from the last tab's view, then keeps its own", () => {
    renderDock();
    fireEvent.click(screen.getByTestId("ph-launcher"));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Beta" }).at(0) as HTMLElement,
    );
    fireEvent.click(screen.getByRole("tab", { name: "First" }));
    cleanup();
    sessionStorage.clear();

    renderDock();
    expect(panel().getAttribute("data-tab")).toBe("first");
    fireEvent.click(screen.getByRole("tab", { name: "Second" }));
    // Another tab sets its own view later.
    localStorage.setItem(
      "ph-devtools:view",
      JSON.stringify({ open: false, target: { panel: "alpha" } }),
    );
    cleanup();

    renderDock();
    expect(panel().getAttribute("data-tab")).toBe("second");
  });

  it("leaves the shortcut's keys to a field of the app, and takes a held key as one press", () => {
    renderDock();
    const field = document.createElement("input");
    document.body.append(field);
    const typed = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      code: "KeyD",
      altKey: true,
      shiftKey: true,
    });
    act(() => {
      field.dispatchEvent(typed);
    });
    expect(typed.defaultPrevented).toBe(false);
    expect(frame()).toBeNull();

    chord("KeyD");
    expect(frame()).not.toBeNull();
    const held = press({
      code: "KeyD",
      altKey: true,
      shiftKey: true,
      repeat: true,
    });
    expect(held.defaultPrevented).toBe(true);
    expect(frame()).not.toBeNull();
  });

  it("toggles on Alt+Shift+D", () => {
    renderDock();

    const opened = chord("KeyD");
    expect(opened.defaultPrevented).toBe(true);
    expect(savedView().open).toBe(true);
    expect(frame()).not.toBeNull();

    chord("KeyD");
    expect(savedView().open).toBe(false);
    expect(frame()).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("opens the palette on Alt+Shift+K, and DevTools with it when closed", async () => {
    renderDock();

    const event = chord("KeyK");

    expect(event.defaultPrevented).toBe(true);
    expect(frame()).not.toBeNull();
    await waitFor(() => expect(palette()).not.toBeNull());
  });

  it("navigates to the page chosen in the palette and closes it", async () => {
    open("alpha");
    renderDock();
    chord("KeyK");
    await waitFor(() => expect(palette()).not.toBeNull());

    const items = [
      ...(palette() as HTMLElement).querySelectorAll("[cmdk-item]"),
    ];
    expect(items.map((item) => item.textContent)).toEqual([
      "Alpha",
      "Beta › First",
      "Beta › Second",
      "Dock to bottom",
      "Dock to right",
      "Open standalone",
      expect.stringContaining("Close DevTools"),
    ]);
    fireEvent.click(items[1]);

    expect(savedView()).toMatchObject({ panel: "beta", tab: "first" });
    expect(panel().getAttribute("data-tab")).toBe("first");
    await waitFor(() => expect(palette()).toBeNull());
  });

  it("closes the palette, not the dock, on Escape", async () => {
    open("alpha");
    renderDock();
    chord("KeyK");
    await waitFor(() => expect(palette()).not.toBeNull());

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() => expect(palette()).toBeNull());
    expect(frame()).not.toBeNull();
    expect(savedView().panel).toBe("alpha");
  });

  it("closes the palette with DevTools, and reopens without it", async () => {
    open("alpha");
    renderDock();
    chord("KeyK");
    await waitFor(() => expect(palette()).not.toBeNull());

    chord("KeyD");
    await waitFor(() => expect(palette()).toBeNull());
    expect(frame()).toBeNull();

    chord("KeyD");
    await act(() => Promise.resolve());
    expect(frame()).not.toBeNull();
    expect(palette()).toBeNull();
  });

  it.each([
    ["Cmd+K", { metaKey: true }],
    ["Ctrl+K", { ctrlKey: true }],
    ["Ctrl+Alt+Shift+K", { ctrlKey: true, altKey: true, shiftKey: true }],
  ])("leaves %s to the app", async (_name, modifiers) => {
    open("alpha");
    renderDock();

    const event = press({ key: "k", code: "KeyK", ...modifiers });
    await act(() => Promise.resolve());

    expect(event.defaultPrevented).toBe(false);
    expect(palette()).toBeNull();
  });

  it("switches the dock side and remembers it", () => {
    open("alpha");
    renderDock();
    expect(frame()?.getAttribute("data-dock")).toBe("bottom");

    fireEvent.click(screen.getByRole("button", { name: "Dock to right" }));

    expect(frame()?.getAttribute("data-dock")).toBe("right");

    cleanup();
    renderDock();
    expect(frame()?.getAttribute("data-dock")).toBe("right");
  });

  it("renders nothing on the standalone page's path", () => {
    open("alpha");
    const { container } = renderDock("/__ph/devtools");
    expect(container.innerHTML).toBe("");
    expect(chord("KeyD").defaultPrevented).toBe(false);
  });

  it("leaves DevTools closed for the router devtools' ?devtools=1", () => {
    renderDock("/?devtools=1");
    expect(frame()).toBeNull();
    expect(window.location.search).toBe("?devtools=1");
  });
});

describe("a share link", () => {
  it("opens the panel it names and leaves the URL in the same history entry", () => {
    const entries = window.history.length;
    renderDock("/?sort=name&ph-devtools=beta");

    expect(frame()?.getAttribute("data-mode")).toBe("docked");
    expect(panel().getAttribute("data-panel")).toBe("beta");
    expect(panel().getAttribute("data-tab")).toBe("second");
    expect(window.location.search).toBe("?sort=name");
    expect(window.history.length).toBe(entries);
  });

  it("takes the param out through the app's router when the app has one", () => {
    const removeSearchParam = vi.fn();
    window.history.replaceState(null, "", "/?ph-devtools=beta");
    render(
      <DevtoolsRoot app={{ removeSearchParam }} registry={TEST_REGISTRY} />,
    );
    expect(panel().getAttribute("data-panel")).toBe("beta");
    expect(removeSearchParam).toHaveBeenCalledExactlyOnceWith("ph-devtools");
    expect(window.location.search).toBe("?ph-devtools=beta");
  });

  it("replaces where the tab was, and a reload comes back there", () => {
    seedView({
      open: false,
      target: { panel: "alpha", focus: { kind: "a", id: "1" } },
    });
    renderDock("/?ph-devtools=beta");
    expect(savedView()).toEqual({
      open: true,
      panel: "beta",
      tab: undefined,
      focus: undefined,
    });
    cleanup();

    renderDock("/");
    expect(panel().getAttribute("data-panel")).toBe("beta");
  });

  it("opens the default page for a panel there is none of", () => {
    renderDock("/?ph-devtools=gone");
    expect(panel().getAttribute("data-panel")).toBe("alpha");
    expect(window.location.search).toBe("");
  });

  it("opens where the tab was without a panel", () => {
    seedView({ open: false, target: { panel: "beta", tab: "first" } });
    renderDock("/?ph-devtools");
    expect(panel().getAttribute("data-tab")).toBe("first");
    expect(window.location.search).toBe("");
  });
});

describe("the standalone page", () => {
  function renderPage(url: string) {
    window.history.replaceState(null, "", url);
    return render(<DevtoolsStandalone {...HOST} registry={TEST_REGISTRY} />);
  }

  it("shows the default page on a first visit, with no dock controls", () => {
    renderPage("/__ph/devtools");

    expect(frame()?.getAttribute("data-mode")).toBe("standalone");
    expect(panel().getAttribute("data-panel")).toBe("alpha");
    expect(screen.queryByTestId("ph-launcher")).toBeNull();
    expect(screen.queryByTestId("ph-devtools-close")).toBeNull();
    expect(screen.queryByRole("button", { name: /Dock to/ })).toBeNull();
    expect(screen.queryByLabelText("Open standalone")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to app" }).getAttribute("href"),
    ).toBe("/");
  });

  it("has one bar: the search sits beside Back to app, with no row of its own", async () => {
    open("beta");
    renderPage("/__ph/devtools");

    const bar = screen.getByTestId("ph-devtools-bar");
    expect(frame()?.querySelector(":scope > header")).toBeNull();
    expect(
      within(bar).getByRole("link", { name: "Back to app" }),
    ).toBeDefined();

    fireEvent.click(within(bar).getByTestId("ph-devtools-search"));
    await waitFor(() => expect(palette()).not.toBeNull());
  });

  it("names DevTools in its bar, as the dock does", () => {
    open("beta");
    renderPage("/__ph/devtools");

    const bar = screen.getByTestId("ph-devtools-bar");
    expect(within(bar).getByTestId("ph-devtools-title").textContent).toBe(
      "PH DevTools",
    );
    expect(bar.textContent).not.toContain("Served by");
  });

  it("shows the saved page and opens the palette on Alt+Shift+K", async () => {
    open("beta", "first");
    renderPage("/__ph/devtools");
    expect(panel().getAttribute("data-tab")).toBe("first");

    expect(chord("KeyD").defaultPrevented).toBe(false);
    chord("KeyK");

    await waitFor(() => expect(palette()).not.toBeNull());
    expect(
      (palette() as HTMLElement).querySelectorAll("[cmdk-item]"),
    ).toHaveLength(3);
  });

  it("leaves the dock closed when it changes page", () => {
    renderPage("/__ph/devtools");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Beta" }).at(0) as HTMLElement,
    );
    expect(savedView()).toMatchObject({ open: false, panel: "beta" });
  });

  it("opens the panel a share link names", () => {
    renderPage("/__ph/devtools?ph-devtools=beta");
    expect(panel().getAttribute("data-panel")).toBe("beta");
    expect(window.location.search).toBe("");
  });
});

describe("the Overview page", () => {
  const renderOverview = () => {
    open("overview");
    window.history.replaceState(null, "", "/");
    return render(<DevtoolsRoot {...HOST} registry={REGISTRY} />);
  };
  const overview = () => screen.getByTestId("ph-overview");
  const value = (field: string) => screen.getByTestId(`ph-info-${field}`);

  it("shows what the API answers", async () => {
    const fetchMock = stubInfo(() => Response.json(INFO));
    renderOverview();
    expect(overview().getAttribute("data-state")).toBe("loading");

    await waitFor(() =>
      expect(overview().getAttribute("data-state")).toBe("ready"),
    );

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/info")),
    ).toEqual([["/__ph/devtools/api/info", expect.anything()]]);
    expect(value("project").textContent).toBe("test-package");
    expect(value("version").textContent).toBe("1.2.3");
    expect(value("ph-version").textContent).toBe("6.3.0");
    const app = value("app-url").querySelector("a");
    expect(app?.getAttribute("href")).toBe("http://localhost:3001/");
    expect(app?.getAttribute("target")).toBe("_blank");
    expect(value("switchboard-url").textContent).toBe(
      "http://localhost:4002/graphql",
    );
    expect(value("mcp-url").textContent).toBe("—");
    expect(
      screen
        .getAllByTestId("ph-overview-service")
        .find((row) => row.dataset.service === "mcp-url")?.dataset.reach,
    ).toBe("off");
    expect(value("mcp-url").querySelector("a")).toBeNull();
    expect(value("started-at").textContent).toBe("2m ago");
  });

  it("says the dev server restarted, and offers a reload, on a 401", async () => {
    stubInfo(() =>
      Response.json(
        { error: { code: "bad_token", message: "The token does not match." } },
        { status: 401 },
      ),
    );
    renderOverview();

    await waitFor(() =>
      expect(overview().getAttribute("data-state")).toBe("unavailable"),
    );

    expect(overview().textContent).toContain("The dev server restarted");
    expect(overview().textContent).toContain("The token does not match.");
    expect(screen.getByTestId("ph-reload").textContent).toBe("Reload the page");
    expect(screen.queryByTestId("ph-info-project")).toBeNull();
  });

  it("offers a reload when the dev server restarts after it answered", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let restarted = false;
    stubInfo(() =>
      restarted
        ? Response.json(
            {
              error: {
                code: "bad_token",
                message: "The token does not match.",
              },
            },
            { status: 401 },
          )
        : Response.json(INFO),
    );
    renderOverview();
    await waitFor(() =>
      expect(overview().getAttribute("data-state")).toBe("ready"),
    );

    restarted = true;
    await act(() => vi.advanceTimersByTimeAsync(INFO_REFRESH_MS));

    await waitFor(() =>
      expect(overview().getAttribute("data-state")).toBe("unavailable"),
    );
    expect(screen.getByTestId("ph-reload").textContent).toBe("Reload the page");
    vi.useRealTimers();
  });

  it("asks again while the API does not answer, and shows the project once it does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let up = false;
    const fetchMock = stubInfo(() =>
      up
        ? Response.json(INFO)
        : Response.json(
            { error: { code: "internal", message: "EACCES" } },
            { status: 500 },
          ),
    );
    renderOverview();
    await waitFor(() =>
      expect(overview().getAttribute("data-state")).toBe("unavailable"),
    );
    expect(overview().textContent).toContain("EACCES");
    const asked = () =>
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/info"))
        .length;
    expect(asked()).toBe(1);

    up = true;
    await act(() => vi.advanceTimersByTimeAsync(INFO_RETRY_MS));
    await waitFor(() =>
      expect(overview().getAttribute("data-state")).toBe("ready"),
    );
    expect(asked()).toBe(2);
    vi.useRealTimers();
  });

  it("shows a service that comes up after the page did", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let info = stackInfo({ switchboard: { url: null } });
    stubInfo(() => Response.json(info));
    renderOverview();
    await waitFor(() =>
      expect(overview().getAttribute("data-state")).toBe("ready"),
    );
    expect(value("switchboard-url").textContent).toBe("—");

    info = stackInfo();
    await act(() => vi.advanceTimersByTimeAsync(INFO_REFRESH_MS));
    await waitFor(() =>
      expect(value("switchboard-url").textContent).toBe(
        "http://localhost:4002/graphql",
      ),
    );
    vi.useRealTimers();
  });

  it("says where to open the app, and asks no more, when the page came through another address", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubInfo(() =>
      Response.json(
        { error: { code: "bad_host", message: "Host is not loopback." } },
        { status: 403 },
      ),
    );
    renderOverview();
    await waitFor(() =>
      expect(overview().getAttribute("data-state")).toBe("unavailable"),
    );
    expect(overview().textContent).toContain(
      "DevTools answers on localhost only",
    );
    expect(overview().textContent).not.toContain("keeps trying");

    await act(() => vi.advanceTimersByTimeAsync(INFO_RETRY_MS * 3));
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/info")),
    ).toHaveLength(1);
    vi.useRealTimers();
  });
});
