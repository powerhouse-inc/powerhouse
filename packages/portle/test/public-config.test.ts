import { describe, expect, it, vi } from "vitest";
import {
  createPublicConfigHandler,
  PUBLIC_CONFIG_PATH,
  rewritePublicConfig,
  type PublicConfigSource,
} from "../src/public-config.js";

const source: PublicConfigSource = {
  appUrl: "http://localhost:2540",
  apiPort: "7540",
  publicOrigin: "https://app.dev.sektar.be",
};

const served = JSON.stringify({
  connect: {
    drives: { defaultDrives: [{ url: "http://127.0.0.1:7540/d/sektar" }] },
    plugins: [{ config: { drive: "http://localhost:7540/d/workflows" } }],
    six: "http://[::1]:7540/graphql",
    other: "http://127.0.0.1:2540/keep",
    text: "127.0.0.1:7540 is not an origin",
  },
});

describe("rewritePublicConfig", () => {
  it("replaces the switchboard's local origin, on every loopback spelling, and nothing else", () => {
    const out = JSON.parse(rewritePublicConfig(served, source)) as {
      connect: Record<string, unknown> & {
        drives: { defaultDrives: { url: string }[] };
        plugins: { config: { drive: string } }[];
      };
    };
    expect(out.connect.drives.defaultDrives[0].url).toBe(
      "https://app.dev.sektar.be/d/sektar",
    );
    expect(out.connect.plugins[0].config.drive).toBe(
      "https://app.dev.sektar.be/d/workflows",
    );
    expect(out.connect.six).toBe("https://app.dev.sektar.be/graphql");
    expect(out.connect.other).toBe("http://127.0.0.1:2540/keep");
    expect(out.connect.text).toBe("127.0.0.1:7540 is not an origin");
  });

  it("refuses what is not JSON (a dev server's HTML fallback)", () => {
    expect(() => rewritePublicConfig("<!doctype html>", source)).toThrow();
  });
});

describe("createPublicConfigHandler", () => {
  const fetching = (answer: () => Response | Promise<Response>) =>
    vi.fn((url: string | URL | Request) => {
      const u =
        typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      expect(u).toBe("http://localhost:2540/powerhouse.config.json");
      return Promise.resolve(answer());
    }) as unknown as typeof fetch;
  const get = (handler: (r: Request) => Promise<Response>, method = "GET") =>
    handler(new Request(`http://sb${PUBLIC_CONFIG_PATH}`, { method }));

  it("serves the app's config rewritten, uncached, when the site is published same-origin", async () => {
    const fetchImpl = fetching(() => new Response(served, { status: 200 }));
    const handler = createPublicConfigHandler({
      source: () => source,
      fetchImpl,
    });
    const res = await get(handler);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as {
      connect: { drives: { defaultDrives: { url: string }[] } };
    };
    expect(body.connect.drives.defaultDrives[0].url).toBe(
      "https://app.dev.sektar.be/d/sektar",
    );
    // Read when asked, not once: the app may have restarted in between.
    await get(handler);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const head = await get(handler, "HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("answers 404 while the site is not published same-origin, without asking the app", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const handler = createPublicConfigHandler({
      source: () => null,
      fetchImpl,
    });
    expect((await get(handler)).status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers 502 and logs when the app is down or serves no config", async () => {
    const log = vi.fn();
    const down = createPublicConfigHandler({
      source: () => source,
      fetchImpl: fetching(() => {
        throw new Error("fetch failed");
      }),
      log,
    });
    const res = await get(down);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /could not be read from http:\/\/localhost:2540\/powerhouse\.config\.json: fetch failed/,
    );
    expect(log).toHaveBeenCalledWith(
      "public runtime config unavailable",
      expect.objectContaining({ error: "fetch failed" }),
    );
    const html = createPublicConfigHandler({
      source: () => source,
      fetchImpl: fetching(() => new Response("<html>", { status: 200 })),
    });
    expect((await get(html)).status).toBe(502);
    const notFound = createPublicConfigHandler({
      source: () => source,
      fetchImpl: fetching(() => new Response("nope", { status: 503 })),
    });
    expect((await get(notFound)).status).toBe(502);
  });

  it("allows GET and HEAD only", async () => {
    const handler = createPublicConfigHandler({ source: () => source });
    const res = await get(handler, "POST");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });
});
