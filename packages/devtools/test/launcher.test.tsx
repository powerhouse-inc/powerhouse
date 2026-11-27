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
import { History } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DevtoolsRoot,
  DevtoolsShell,
  DevtoolsStandalone,
} from "../src/shell/root.js";
import type { Badge, PanelMark, Registry } from "../src/shell/registry.js";
import { TEST_REGISTRY } from "./registry.fixture.js";
import { stackInfo } from "./stack.fixture.js";
import { clearStorage, savedView } from "./storage.fixture.js";

const PINS_KEY = "ph-devtools:launcher-pins";

const bar = () => screen.queryByTestId("ph-launcher-bar");
const onBar = () =>
  [...document.querySelectorAll<HTMLElement>("[data-launcher-panel]")].map(
    (button) => button.dataset.launcherPanel,
  );
const panelsButton = () => screen.getByTestId("ph-launcher-panels");
const shownPanel = () =>
  screen.getByTestId("ph-panel").getAttribute("data-panel");

function withBadges(badges: Record<string, Badge>): Registry {
  const [first, ...rest] = TEST_REGISTRY.panels.map((panel) => ({
    ...panel,
    useBadge: () => badges[panel.id],
  }));
  return { ...TEST_REGISTRY, panels: [first, ...rest] };
}

const LEGACY: PanelMark = {
  icon: History,
  label: "2 legacy things",
  text: "2 legacy",
};

function withMarks(
  marks: Record<string, PanelMark>,
  registry: Registry = TEST_REGISTRY,
): Registry {
  const [first, ...rest] = registry.panels.map((panel) => ({
    ...panel,
    useMark: () => marks[panel.id],
  }));
  return { ...registry, panels: [first, ...rest] };
}

function renderDock(registry: Registry = TEST_REGISTRY) {
  window.history.replaceState(null, "", "/");
  return render(<DevtoolsRoot registry={registry} />);
}

async function openPanelList() {
  act(() => {
    fireEvent.click(panelsButton());
  });
  return screen.findByRole("dialog", { name: "All panels" });
}

const chord = (code: string) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code,
        altKey: true,
        shiftKey: true,
      }),
    );
  });

beforeEach(clearStorage);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.title = "";
});

describe("the launcher", () => {
  it("shows no panel while none fails, and names the ones with warnings on the panel list", () => {
    renderDock(withBadges({ beta: { count: 2, tone: "warn" } }));

    expect(bar()).not.toBeNull();
    expect(onBar()).toEqual([]);
    expect(panelsButton().textContent).toContain("Beta: 2 warnings");
  });

  it("keeps a panel with failing checks on the launcher, and opens it", () => {
    renderDock(withBadges({ beta: { count: 1, tone: "error" } }));

    expect(onBar()).toEqual(["beta"]);
    expect(panelsButton().textContent).not.toContain("Beta");

    fireEvent.click(
      screen.getByRole("button", { name: "Open Beta · 1 failing" }),
    );

    expect(savedView().open).toBe(true);
    expect(shownPanel()).toBe("beta");
  });

  it("opens DevTools where it was from the mark", () => {
    renderDock();
    fireEvent.click(screen.getByTestId("ph-launcher"));
    expect(savedView().open).toBe(true);
    expect(bar()).toBeNull();
  });

  it("lists every panel with its status, and opens the one picked", async () => {
    renderDock(withBadges({ alpha: { count: 1, tone: "warn" } }));

    const list = await openPanelList();
    const rows = [
      ...list.querySelectorAll<HTMLElement>("[data-panel-row]"),
    ].map((row) => row.textContent);
    expect(rows).toEqual(["Alpha1 warning", "Beta"]);

    fireEvent.click(within(list).getByText("Beta"));

    expect(savedView().open).toBe(true);
    expect(shownPanel()).toBe("beta");
  });

  it("shows a panel's mark beside its warnings on the panel list", async () => {
    renderDock(
      withMarks(
        { alpha: LEGACY, beta: LEGACY },
        withBadges({ beta: { count: 1, tone: "warn" } }),
      ),
    );

    expect(panelsButton().textContent).toContain(
      "Beta: 1 warning, 2 legacy things",
    );

    const list = await openPanelList();
    const rows = [
      ...list.querySelectorAll<HTMLElement>("[data-panel-row]"),
    ].map((row) => row.textContent);
    expect(rows).toEqual(["Alpha2 legacy", "Beta2 legacy1 warning"]);
    expect(
      within(list)
        .getAllByTestId("ph-panel-row-mark")
        .map((mark) => mark.title),
    ).toEqual(["2 legacy things", "2 legacy things"]);
  });

  it("flags the panel list for a mark alone", () => {
    renderDock(withMarks({ beta: LEGACY }));
    expect(onBar()).toEqual([]);
    expect(panelsButton().textContent).toContain("Beta: 2 legacy things");
  });

  it("names the mark on a pinned panel", () => {
    localStorage.setItem(PINS_KEY, JSON.stringify(["beta"]));
    renderDock(withMarks({ beta: LEGACY }));

    expect(onBar()).toEqual(["beta"]);
    expect(
      screen.getByRole("button", { name: "Open Beta · 2 legacy things" }),
    ).not.toBeNull();
  });

  it("pins a panel to the launcher for every tab, and unpins it", async () => {
    renderDock();

    const list = await openPanelList();
    const pin = within(list).getByRole("button", {
      name: "Pin Beta to the launcher",
    });
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pin);

    expect(onBar()).toEqual(["beta"]);
    expect(JSON.parse(localStorage.getItem(PINS_KEY) ?? "null")).toEqual([
      "beta",
    ]);
    const unpin = within(list).getByRole("button", {
      name: "Unpin Beta from the launcher",
    });
    expect(unpin.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(unpin);
    expect(onBar()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(PINS_KEY) ?? "null")).toEqual([]);
  });

  it("offers no pin for the default panel, which the mark opens", async () => {
    localStorage.setItem(PINS_KEY, JSON.stringify(["alpha"]));
    renderDock(withBadges({ alpha: { count: 1, tone: "error" } }));

    expect(onBar()).toEqual([]);
    const list = await openPanelList();
    expect(
      within(list).queryByRole("button", { name: /Alpha to the launcher/ }),
    ).toBeNull();
    expect(
      within(list).getByRole("button", { name: "Pin Beta to the launcher" }),
    ).not.toBeNull();
  });

  it("keeps a pinned panel after a reload, and ignores a pin list that does not parse", () => {
    localStorage.setItem(PINS_KEY, JSON.stringify(["beta"]));
    renderDock();
    expect(onBar()).toEqual(["beta"]);
    cleanup();

    localStorage.setItem(PINS_KEY, JSON.stringify("beta"));
    renderDock();
    expect(onBar()).toEqual([]);
  });

  it("hides until reload, while the shortcut still opens DevTools", async () => {
    renderDock();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Launcher options" }));
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Hide until reload/ }),
    );
    expect(bar()).toBeNull();

    chord("KeyD");
    expect(screen.queryByTestId("ph-devtools")).not.toBeNull();
    chord("KeyD");
    expect(screen.queryByTestId("ph-devtools")).toBeNull();
    expect(bar()).toBeNull();
  });

  it("stays put away while DevTools shows its page and comes back to the dock", async () => {
    const shell = (surface: "dock" | "page") => (
      <DevtoolsShell surface={surface} registry={TEST_REGISTRY} />
    );
    const view = render(shell("dock"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Launcher options" }));
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Hide until reload/ }),
    );

    view.rerender(shell("page"));
    view.rerender(shell("dock"));
    expect(bar()).toBeNull();
  });

  it("moves when dragged from a button, without pressing the button", () => {
    renderDock(withBadges({ beta: { count: 1, tone: "error" } }));
    const button = screen.getByRole("button", {
      name: "Open Beta · 1 failing",
    });
    const launcher = bar() as HTMLElement;
    launcher.setPointerCapture = () => {};

    fireEvent.pointerDown(button, { button: 0, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(button, { clientX: 300, clientY: 300 });
    fireEvent.pointerUp(button, { clientX: 300, clientY: 300 });
    // Under pointer capture, the browser sends the click to the bar.
    fireEvent.click(launcher);

    expect(savedView().open).toBeUndefined();
    expect(localStorage.getItem("ph-devtools:launcher-anchor")).not.toBeNull();

    fireEvent.pointerDown(button, { button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(button, { clientX: 300, clientY: 300 });
    fireEvent.click(button);
    expect(shownPanel()).toBe("beta");
  });

  it("follows a press whose first move already left it", () => {
    renderDock();
    const launcher = bar() as HTMLElement;
    launcher.setPointerCapture = () => {};

    fireEvent.pointerDown(screen.getByTestId("ph-launcher"), {
      button: 0,
      clientX: 500,
      clientY: 500,
    });
    fireEvent.pointerMove(document.body, { clientX: 100, clientY: 100 });

    expect(document.querySelector("[data-launcher-target]")).not.toBeNull();
    fireEvent.pointerUp(document.body, { clientX: 100, clientY: 100 });
    expect(localStorage.getItem("ph-devtools:launcher-anchor")).toBe(
      JSON.stringify("top-left"),
    );
  });

  it("stays put when a press inside its panel list moves", async () => {
    renderDock();
    const list = await openPanelList();
    const row = within(list).getByText("Alpha");

    fireEvent.pointerDown(row, { button: 0, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(row, { clientX: 300, clientY: 300 });

    expect(document.querySelector("[data-launcher-target]")).toBeNull();
  });
});

describe("the standalone page's tab", () => {
  const INFO = stackInfo();

  function stubInfo() {
    const meta = document.createElement("meta");
    meta.name = "ph-devtools-token";
    meta.content = "token";
    document.head.append(meta);
    vi.stubGlobal(
      "fetch",
      vi.fn((...[input]: Parameters<typeof fetch>) =>
        Promise.resolve(
          (input instanceof Request ? input.url : input.toString()).endsWith(
            "/info",
          )
            ? Response.json(INFO)
            : Response.json(
                { error: { code: "not_found", message: "No such route." } },
                { status: 404 },
              ),
        ),
      ),
    );
  }

  const icons = () =>
    [...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
      .map((link) => link.getAttribute("href") ?? "")
      .map((href) => (href.startsWith("data:image/svg+xml,") ? "mark" : href));

  it("shows DevTools' icon and the project's name, and gives the app's back", async () => {
    stubInfo();
    document.title = "Powerhouse Connect";
    const appIcon = document.createElement("link");
    appIcon.rel = "icon";
    appIcon.href = "/icon.ico";
    document.head.append(appIcon);
    window.history.replaceState(null, "", "/__ph/devtools");

    const { unmount } = render(<DevtoolsStandalone registry={TEST_REGISTRY} />);

    expect(icons()).toEqual(["mark"]);
    await waitFor(() => expect(document.title).toBe("DevTools · test-package"));

    unmount();
    expect(icons()).toEqual(["/icon.ico"]);
    expect(document.title).toBe("Powerhouse Connect");
  });
});
