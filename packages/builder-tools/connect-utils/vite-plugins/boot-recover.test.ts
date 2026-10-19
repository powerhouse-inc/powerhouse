import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  BOOT_RECOVER_KEY,
  BOOT_RECOVER_SCRIPT,
  injectAppShell,
  rebaseShellLinks,
} from "./app-shell.js";

type Listener = (event: unknown) => void;

class FakeTarget {
  listeners = new Map<string, Listener[]>();
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, event: unknown = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

class FakeWorker extends FakeTarget {
  state = "installing";
  messages: unknown[] = [];
  postMessage(message: unknown) {
    this.messages.push(message);
  }
}

// Runs the inline script against a stand-in page and service worker container.
function boot(opts: {
  mounted?: boolean;
  waiting?: FakeWorker;
  installing?: FakeWorker;
  storage?: Map<string, string>;
  noServiceWorker?: boolean;
}) {
  const storage = opts.storage ?? new Map<string, string>();
  const timers: (() => void)[] = [];
  const reloads: number[] = [];
  const container = new FakeTarget();
  const registration = Object.assign(new FakeTarget(), {
    waiting: opts.waiting ?? null,
    installing: opts.installing ?? null,
    update: () => Promise.resolve(),
  });
  const page = new FakeTarget();
  const context = createContext({
    navigator: opts.noServiceWorker
      ? {}
      : {
          serviceWorker: Object.assign(container, {
            getRegistration: () => Promise.resolve(registration),
          }),
        },
    sessionStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
    document: {
      querySelector: (sel: string) =>
        opts.mounted ? null : sel.startsWith("style") ? {} : null,
    },
    location: { reload: () => reloads.push(1) },
    setTimeout: (fn: () => void) => timers.push(fn),
    addEventListener: page.addEventListener.bind(page),
  });
  runInContext(BOOT_RECOVER_SCRIPT, context);
  const flush = () => new Promise((r) => setImmediate(r));
  const inContext = (code: string): unknown => runInContext(code, context);
  return {
    page,
    container,
    registration,
    storage,
    reloads,
    flush,
    inContext,
    fireTimers: () => timers.splice(0).forEach((fn) => fn()),
  };
}

const SKIP = { type: "SKIP_WAITING" };

describe("boot recovery script", () => {
  it("activates a waiting worker when a module fails before the app mounts", async () => {
    const waiting = new FakeWorker();
    const env = boot({ waiting });
    env.page.emit("error", {
      error: env.inContext("new SyntaxError('no export named x')"),
    });
    await env.flush();
    expect(waiting.messages).toEqual([SKIP]);
    expect(env.storage.get(BOOT_RECOVER_KEY)).toBe("1");
    env.container.emit("controllerchange");
    expect(env.reloads).toHaveLength(1);
  });

  it("waits for an installing worker after a stalled boot", async () => {
    const installing = new FakeWorker();
    const env = boot({ installing });
    env.fireTimers();
    await env.flush();
    expect(installing.messages).toEqual([]);
    installing.state = "installed";
    installing.emit("statechange");
    expect(installing.messages).toEqual([SKIP]);
  });

  it("checks for an update when no worker is pending yet", async () => {
    const env = boot({});
    env.fireTimers();
    await env.flush();
    const worker = new FakeWorker();
    env.registration.installing = worker as never;
    env.registration.emit("updatefound");
    worker.state = "installed";
    worker.emit("statechange");
    expect(worker.messages).toEqual([SKIP]);
  });

  it("does nothing once the app has mounted", async () => {
    const waiting = new FakeWorker();
    const env = boot({ waiting, mounted: true });
    env.fireTimers();
    env.page.emit("error", { error: env.inContext("new TypeError('x')") });
    await env.flush();
    expect(waiting.messages).toEqual([]);
  });

  it("recovers at most once per session", async () => {
    const waiting = new FakeWorker();
    const env = boot({
      waiting,
      storage: new Map([[BOOT_RECOVER_KEY, "1"]]),
    });
    env.fireTimers();
    await env.flush();
    expect(waiting.messages).toEqual([]);
  });

  it("ignores unrelated errors and pages without service workers", async () => {
    const waiting = new FakeWorker();
    const env = boot({ waiting });
    env.page.emit("error", { error: env.inContext("new RangeError('x')") });
    await env.flush();
    expect(waiting.messages).toEqual([]);
    expect(() => boot({ noServiceWorker: true }).fireTimers()).not.toThrow();
  });
});

describe("shell links under a base", () => {
  const body = `<a href="/settings/package-manager">S</a><a href="//cdn/x">C</a><a href="https://x/y">X</a>`;

  it("prefixes root-relative links and leaves others alone", () => {
    expect(rebaseShellLinks(body, "/connect/")).toBe(
      `<a href="/connect/settings/package-manager">S</a><a href="//cdn/x">C</a><a href="https://x/y">X</a>`,
    );
    expect(rebaseShellLinks(body, "/")).toBe(body);
  });

  it("is applied by injectAppShell, which also adds the recovery script", () => {
    const html = `<html><head></head><body><div id="root"></div></body></html>`;
    const out = injectAppShell(
      html,
      { body: `<div data-ph-shell>${body}</div>`, head: "" },
      "/connect/",
    );
    expect(out).toContain(`href="/connect/settings/package-manager"`);
    expect(out).toContain("data-ph-boot-recover");
  });
});
