// @vitest-environment happy-dom
import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountDevtools, type DevtoolsHandle } from "../src/mount.js";
import { clearStorage, seedView } from "./storage.fixture.js";

const hosts = () => document.querySelectorAll("[data-ph-devtools]");
const launcher = () =>
  hosts()[0]?.shadowRoot?.querySelector('[data-testid="ph-launcher"]');

function serveToken(base?: string) {
  const meta = document.createElement("meta");
  meta.name = "ph-devtools-token";
  meta.content = "token";
  if (base) meta.setAttribute("data-base", base);
  document.head.append(meta);
}

let devtools: DevtoolsHandle | undefined;

beforeEach(() => {
  clearStorage();
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("no server"))),
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(() => {
  act(() => devtools?.unmount());
  devtools = undefined;
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("mountDevtools", () => {
  it("does nothing on a page no DevTools dev server served", () => {
    devtools = mountDevtools();
    expect(devtools).toBeUndefined();
    expect(hosts()).toHaveLength(0);
  });

  it("renders the launcher in a shadow root, apart from the page", () => {
    serveToken();
    act(() => {
      devtools = mountDevtools();
    });
    expect(hosts()).toHaveLength(1);
    expect(launcher()).not.toBeNull();
    expect(document.querySelector('[data-testid="ph-launcher"]')).toBeNull();
  });

  it("keeps the keys typed into its fields from the app, and takes its own there", async () => {
    serveToken();
    act(() => {
      devtools = mountDevtools();
    });
    const shadow = hosts()[0]?.shadowRoot as ShadowRoot;
    const press = (target: EventTarget, init: KeyboardEventInit) =>
      act(() => {
        target.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            composed: true,
            ...init,
          }),
        );
      });
    const field = () => shadow.querySelector("input");
    const openPalette = async () => {
      press(window, { code: "KeyK", altKey: true, shiftKey: true });
      await vi.waitFor(() => expect(field()).not.toBeNull());
      return field() as HTMLInputElement;
    };
    const seen: string[] = [];
    const listen = (event: KeyboardEvent) => seen.push(event.key);
    window.addEventListener("keydown", listen);
    document.addEventListener("keydown", listen);
    try {
      const palette = await openPalette();
      seen.length = 0;
      press(palette, { key: "a" });
      press(palette, { key: "Escape" });
      await vi.waitFor(() => expect(field()).toBeNull());
      expect(launcher()).toBeNull();
      expect(seen).toEqual([]);

      const again = await openPalette();
      seen.length = 0;
      press(again, { key: "D", code: "KeyD", altKey: true, shiftKey: true });
      await vi.waitFor(() => expect(launcher()).not.toBeNull());
      expect(seen).toEqual([]);
    } finally {
      window.removeEventListener("keydown", listen);
      document.removeEventListener("keydown", listen);
    }
  });

  it("mounts once, however often it is called", () => {
    serveToken();
    act(() => {
      devtools = mountDevtools();
    });
    expect(mountDevtools()).toBe(devtools);
    expect(hosts()).toHaveLength(1);
  });

  it("removes what it added, and can mount again", () => {
    serveToken();
    act(() => {
      devtools = mountDevtools();
    });
    act(() => devtools?.unmount());
    expect(hosts()).toHaveLength(0);
    act(() => {
      devtools = mountDevtools();
    });
    expect(hosts()).toHaveLength(1);
  });

  it("goes where the host says", () => {
    serveToken();
    const target = document.createElement("section");
    document.body.append(target);
    act(() => {
      devtools = mountDevtools({ target });
    });
    expect(target.querySelector("[data-ph-devtools]")).not.toBeNull();
  });

  it("shows the page instead of the dock at the page's path, below the tag's base", () => {
    serveToken("/app/");
    window.history.replaceState(null, "", "/app/__ph/devtools");
    act(() => {
      devtools = mountDevtools();
    });
    const shadow = hosts()[0]?.shadowRoot;
    expect(
      shadow?.querySelector('[data-testid="ph-devtools-bar"]'),
    ).not.toBeNull();
    expect(launcher()).toBeNull();
  });

  it("shows the page when an app says its router is on it, whatever the location says", () => {
    serveToken();
    act(() => {
      devtools = mountDevtools();
    });
    const bar = () =>
      hosts()[0]?.shadowRoot?.querySelector('[data-testid="ph-devtools-bar"]');
    expect(bar()).toBeNull();

    act(() => devtools?.update({ surface: "page" }));
    expect(bar()).not.toBeNull();
    expect(launcher()).toBeNull();

    act(() => devtools?.update({ surface: "auto" }));
    expect(bar()).toBeNull();
    expect(launcher()).not.toBeNull();
  });

  it("lays the options of a later call over the mount the page has", () => {
    serveToken();
    const target = document.createElement("section");
    document.body.append(target);
    act(() => {
      devtools = mountDevtools();
    });
    act(() => {
      expect(mountDevtools({ target, surface: "page" })).toBe(devtools);
    });
    expect(hosts()).toHaveLength(1);
    expect(target.querySelector("[data-ph-devtools]")).not.toBeNull();
    expect(
      hosts()[0]?.shadowRoot?.querySelector('[data-testid="ph-devtools-bar"]'),
    ).not.toBeNull();
  });

  it("registers nothing on the page's own stylesheets", () => {
    serveToken();
    act(() => {
      devtools = mountDevtools();
    });
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("goes away, and leaves the page standing, when what the app gives it throws", () => {
    serveToken();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const appSource = {
      read: (): never => {
        throw new Error("the app changed its shape");
      },
      subscribe: () => () => {},
    };
    act(() => {
      devtools = mountDevtools({ appSource });
    });
    expect(hosts()).toHaveLength(1);
    expect(launcher()).toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("DevTools stopped after an error"),
      expect.any(Error),
    );
    error.mockRestore();
  });

  describe("between the app and the standalone page", () => {
    const within = (selector: string) =>
      hosts()[0]?.shadowRoot?.querySelector<HTMLElement>(selector) ?? null;
    const bar = () => within('[data-testid="ph-devtools-bar"]');
    const backToApp = () =>
      [...(hosts()[0]?.shadowRoot?.querySelectorAll("a") ?? [])].find(
        (link) => link.textContent === "Back to app",
      );

    it("opens the page from the dock without loading the page again", () => {
      serveToken();
      seedView({ open: true });
      act(() => {
        devtools = mountDevtools();
      });
      const entries = window.history.length;
      const link = within('a[aria-label="Open standalone"]');
      expect(link?.getAttribute("href")).toBe("/__ph/devtools");

      let loaded = true;
      act(() => {
        loaded = fireEvent.click(link!);
      });

      // The click was taken over: the browser was not left to follow the link.
      expect(loaded).toBe(false);
      expect(window.location.pathname).toBe("/__ph/devtools");
      expect(window.history.length).toBe(entries + 1);
      expect(bar()).not.toBeNull();
    });

    it("leaves a click with a modifier to the browser, for a new tab", () => {
      serveToken();
      seedView({ open: true });
      act(() => {
        devtools = mountDevtools();
      });
      const link = within('a[aria-label="Open standalone"]');
      link!.addEventListener("click", (event) => event.preventDefault());

      act(() => {
        fireEvent.click(link!, { ctrlKey: true });
      });

      expect(window.location.pathname).toBe("/");
      expect(bar()).toBeNull();
    });

    it("goes back to the app from a page that was loaded as the page", () => {
      serveToken();
      window.history.replaceState(null, "", "/__ph/devtools");
      act(() => {
        devtools = mountDevtools();
      });
      expect(bar()).not.toBeNull();

      let loaded = true;
      act(() => {
        loaded = fireEvent.click(backToApp()!);
      });

      expect(loaded).toBe(false);
      expect(window.location.pathname).toBe("/");
      expect(bar()).toBeNull();
      expect(launcher()).not.toBeNull();
    });

    it("moves through the app's own router when the app gives one", () => {
      serveToken();
      seedView({ open: true });
      const navigate = vi.fn((href: string) =>
        window.history.pushState(null, "", href),
      );
      act(() => {
        devtools = mountDevtools({ app: { navigate } });
      });

      act(() => {
        fireEvent.click(within('a[aria-label="Open standalone"]')!);
      });

      expect(navigate).toHaveBeenCalledExactlyOnceWith("/__ph/devtools");
      expect(bar()).not.toBeNull();
    });

    it("shows the page once a router that moves later has moved", async () => {
      serveToken();
      seedView({ open: true });
      const navigate = (href: string) =>
        Promise.resolve().then(() => window.history.pushState(null, "", href));
      act(() => {
        devtools = mountDevtools({ app: { navigate } });
      });

      await act(async () => {
        fireEvent.click(within('a[aria-label="Open standalone"]')!);
        await Promise.resolve();
      });

      expect(bar()).not.toBeNull();
    });

    it("reads what the app knows from the source it is given", () => {
      serveToken();
      seedView({ open: true });
      const app = {
        navigate: vi.fn((href: string) =>
          window.history.pushState(null, "", href),
        ),
      };
      act(() => {
        devtools = mountDevtools({
          appSource: { read: () => app, subscribe: () => () => undefined },
        });
      });

      act(() => {
        fireEvent.click(within('a[aria-label="Open standalone"]')!);
      });

      expect(app.navigate).toHaveBeenCalledExactlyOnceWith("/__ph/devtools");
    });
  });

  it("takes what the app learns later", () => {
    serveToken();
    act(() => {
      devtools = mountDevtools();
    });
    const x = () =>
      Number(
        /translate\((-?[\d.]+)px/.exec(
          (launcher() as HTMLElement).style.transform,
        )?.[1],
      );
    const corner = x();
    act(() => devtools?.update({ bottomRightReserved: 72 }));
    expect(x()).toBe(corner - 64);
  });
});
