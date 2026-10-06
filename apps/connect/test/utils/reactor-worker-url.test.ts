import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isWorkerBundleResponse,
  joinBase,
  packagedReactorWorkerUrl,
  REACTOR_WORKER_META_PATH,
  resolvePackagedReactorWorker,
  selectReactorWorkerSource,
} from "../../src/utils/reactor-worker-url.js";

const ORIGIN = "https://app.test";

describe("joinBase", () => {
  it("joins the root base without doubling slashes", () => {
    expect(joinBase("/", "a/b.json", ORIGIN).href).toBe(`${ORIGIN}/a/b.json`);
  });

  it("keeps a subpath deploy base, with or without a trailing slash", () => {
    expect(joinBase("/app/", "a/b.json", ORIGIN).href).toBe(
      `${ORIGIN}/app/a/b.json`,
    );
    expect(joinBase("/app", "a/b.json", ORIGIN).href).toBe(
      `${ORIGIN}/app/a/b.json`,
    );
  });
});

describe("packagedReactorWorkerUrl", () => {
  it("joins the root base without doubling slashes", () => {
    expect(packagedReactorWorkerUrl("/", "https://example.test").href).toBe(
      "https://example.test/__reactor_worker__/reactor.worker.js",
    );
  });

  it("keeps a subpath deploy base", () => {
    expect(packagedReactorWorkerUrl("/app/", "https://example.test").href).toBe(
      "https://example.test/app/__reactor_worker__/reactor.worker.js",
    );
  });
});

describe("isWorkerBundleResponse", () => {
  it("accepts an ok JavaScript response", () => {
    expect(
      isWorkerBundleResponse({ ok: true, contentType: "text/javascript" }),
    ).toBe(true);
    expect(
      isWorkerBundleResponse({
        ok: true,
        contentType: "application/javascript; charset=utf-8",
      }),
    ).toBe(true);
  });

  it("rejects an SPA fallback: 200 with an HTML body", () => {
    expect(
      isWorkerBundleResponse({
        ok: true,
        contentType: "text/html; charset=utf-8",
      }),
    ).toBe(false);
  });

  it("rejects errors and missing content types", () => {
    expect(isWorkerBundleResponse({ ok: false, contentType: null })).toBe(
      false,
    );
    expect(isWorkerBundleResponse({ ok: true, contentType: null })).toBe(false);
  });
});

describe("resolvePackagedReactorWorker", () => {
  afterEach(() => vi.unstubAllGlobals());

  function installFetch(response: () => Response) {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
    const fetchMock = vi.fn((_input: URL | string, _init?: RequestInit) =>
      Promise.resolve(response()),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function respond(body: string, status: number, contentType: string) {
    return () =>
      new Response(body, { status, headers: { "content-type": contentType } });
  }

  it("returns the bundle URL and digest from worker-meta.json", async () => {
    const fetchMock = installFetch(
      respond(
        JSON.stringify({ sourceDigest: "abc123", nodeEnv: "production" }),
        200,
        "application/json",
      ),
    );

    expect(await resolvePackagedReactorWorker("/app/")).toEqual({
      url: `${ORIGIN}/app/__reactor_worker__/reactor.worker.js`,
      sourceDigest: "abc123",
    });
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(`${ORIGIN}/app/${REACTOR_WORKER_META_PATH}`);
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.cache).toBe("no-cache");
  });

  it("rejects an SPA fallback serving index.html with a 200", async () => {
    installFetch(respond("<!doctype html>", 200, "text/html"));
    expect(await resolvePackagedReactorWorker("/")).toBeNull();
  });

  it.each([404, 503])("returns null on a %i", async (status) => {
    installFetch(respond("{}", status, "application/json"));
    expect(await resolvePackagedReactorWorker("/")).toBeNull();
  });

  it("returns null on unparseable JSON", async () => {
    installFetch(respond("{not json", 200, "application/json"));
    expect(await resolvePackagedReactorWorker("/")).toBeNull();
  });

  it("returns null when the metadata has no digest", async () => {
    installFetch(respond(JSON.stringify({}), 200, "application/json"));
    expect(await resolvePackagedReactorWorker("/")).toBeNull();
  });

  it("returns null when the fetch itself fails", async () => {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );
    expect(await resolvePackagedReactorWorker("/")).toBeNull();
  });
});

describe("selectReactorWorkerSource", () => {
  const bundle = {
    url: `${ORIGIN}/__reactor_worker__/reactor.worker.js`,
    sourceDigest: "d1",
  };

  it("uses a served bundle, packaged or not", () => {
    for (const packaged of [true, false]) {
      expect(selectReactorWorkerSource({ packaged, bundle })).toEqual({
        kind: "bundle",
        url: bundle.url,
        digest: "d1",
      });
    }
  });

  it("reports a packaged dist without a bundle unavailable", () => {
    expect(selectReactorWorkerSource({ packaged: true, bundle: null })).toEqual(
      {
        kind: "unavailable",
      },
    );
  });

  it("falls back to the Vite-bundled source in the monorepo app", () => {
    expect(
      selectReactorWorkerSource({ packaged: false, bundle: null }),
    ).toEqual({
      kind: "source",
    });
  });
});
