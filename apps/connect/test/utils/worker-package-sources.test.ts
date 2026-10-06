import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEV_PROJECT_MODELS_PATH,
  PROJECT_PACKAGE_SOURCE_NAME,
  resolveDevProjectSource,
  resolveLocalPackageSources,
  subscribeLocalPackageChanges,
  WORKER_PACKAGES_MANIFEST,
} from "../../src/utils/worker-package-sources.js";

const ORIGIN = "https://app.test";

type Responder = (url: string, method: string) => Response;

function installFetch(responder: Responder) {
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: URL | string, init?: { method?: string }) =>
      Promise.resolve(responder(String(input), init?.method ?? "GET")),
    ),
  );
}

function js(): Response {
  return new Response("", {
    status: 200,
    headers: { "content-type": "text/javascript" },
  });
}

function html(): Response {
  return new Response("<!doctype html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function missing(): Response {
  return new Response("", { status: 404 });
}

describe("resolveDevProjectSource", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(1000)));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a cache-busted source when the dev server serves the models", async () => {
    installFetch((url) =>
      url.includes(DEV_PROJECT_MODELS_PATH) ? js() : missing(),
    );

    const source = await resolveDevProjectSource("/");

    expect(source?.name).toBe(PROJECT_PACKAGE_SOURCE_NAME);
    expect(source?.url).toBe(`${ORIGIN}/${DEV_PROJECT_MODELS_PATH}?t=1000`);
  });

  it("busts the cache differently per call, so a rebuild re-imports", async () => {
    installFetch(() => js());

    const first = await resolveDevProjectSource("/");
    vi.setSystemTime(new Date(2000));
    const second = await resolveDevProjectSource("/");

    expect(first?.url).not.toBe(second?.url);
  });

  it("respects a subpath deploy base", async () => {
    installFetch(() => js());

    const source = await resolveDevProjectSource("/app/");

    expect(source?.url).toBe(`${ORIGIN}/app/${DEV_PROJECT_MODELS_PATH}?t=1000`);
  });

  it("rejects an SPA fallback serving index.html with a 200", async () => {
    installFetch(() => html());

    expect(await resolveDevProjectSource("/")).toBeNull();
  });

  it("returns null when nothing is served there", async () => {
    installFetch(() => missing());

    expect(await resolveDevProjectSource("/")).toBeNull();
  });
});

describe("resolveLocalPackageSources", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(1000)));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("turns manifest entries into sources under the deploy base", async () => {
    installFetch((url) => {
      if (url.includes(WORKER_PACKAGES_MANIFEST)) {
        return json([
          { name: "@scope/pkg", version: "1.2.3", file: "scope__pkg.js" },
        ]);
      }
      return missing();
    });

    const sources = await resolveLocalPackageSources("/app/");

    expect(sources).toEqual([
      {
        name: "@scope/pkg",
        version: "1.2.3",
        url: `${ORIGIN}/app/__reactor_worker__/packages/scope__pkg.js`,
      },
    ]);
  });

  it("appends the dev project source beside manifest entries", async () => {
    installFetch((url) => {
      if (url.includes(WORKER_PACKAGES_MANIFEST)) {
        return json([{ name: "pkg", file: "pkg.js" }]);
      }
      if (url.includes(DEV_PROJECT_MODELS_PATH)) return js();
      return missing();
    });

    const names = (await resolveLocalPackageSources("/")).map((s) => s.name);

    expect(names).toEqual(["pkg", PROJECT_PACKAGE_SOURCE_NAME]);
  });

  it("is empty when there is no manifest and no dev models entry", async () => {
    installFetch(() => missing());

    expect(await resolveLocalPackageSources("/")).toEqual([]);
  });

  it("ignores a malformed manifest rather than throwing", async () => {
    installFetch((url) =>
      url.includes(WORKER_PACKAGES_MANIFEST) ? json({ nope: true }) : missing(),
    );

    expect(await resolveLocalPackageSources("/")).toEqual([]);
  });

  it("drops manifest entries missing required fields", async () => {
    installFetch((url) =>
      url.includes(WORKER_PACKAGES_MANIFEST)
        ? json([{ name: "ok", file: "ok.js" }, { name: "no-file" }, 42])
        : missing(),
    );

    const sources = await resolveLocalPackageSources("/");

    expect(sources.map((s) => s.name)).toEqual(["ok"]);
  });
});

describe("subscribeLocalPackageChanges", () => {
  function fakeManager(localPackage: object | undefined) {
    const handlers = new Set<() => void>();
    return {
      localPackage,
      subscribe(handler: () => void) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      notify() {
        for (const handler of handlers) handler();
      },
    };
  }

  it("ignores notifications that leave the local package unchanged", () => {
    const manager = fakeManager({ id: 1 });
    const onChange = vi.fn();
    subscribeLocalPackageChanges(manager, onChange);

    manager.notify();
    manager.notify();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires once per replacement of the local package", () => {
    const manager = fakeManager(undefined);
    const onChange = vi.fn();
    subscribeLocalPackageChanges(manager, onChange);

    manager.localPackage = { id: 2 };
    manager.notify();
    manager.notify();
    expect(onChange).toHaveBeenCalledTimes(1);

    manager.localPackage = { id: 3 };
    manager.notify();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("stops after unsubscribe", () => {
    const manager = fakeManager({ id: 1 });
    const onChange = vi.fn();
    const unsubscribe = subscribeLocalPackageChanges(manager, onChange);

    unsubscribe();
    manager.localPackage = { id: 2 };
    manager.notify();

    expect(onChange).not.toHaveBeenCalled();
  });
});
