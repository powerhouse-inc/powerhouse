import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import net from "node:net";
import zlib from "node:zlib";
import { createProxyServer } from "../src/core/proxy.js";
import type { ProxyServerInstance } from "../src/core/proxy.js";
import type { ProxyRoute } from "../src/core/proxy-routes.js";
import {
  buildSwitchboardRoutes,
  buildServiceRoutes,
} from "../src/core/proxy-routes.js";
import type {
  ServiceDefinition,
  ServiceInstanceStatus,
} from "../src/core/types.js";
import { createLogger } from "../src/core/logger.js";

const logger = createLogger("warn", () => {});

// Track servers for cleanup
const servers: Array<{ close: () => Promise<void> | void }> = [];

afterEach(async () => {
  for (const s of servers) {
    await s.close();
  }
  servers.length = 0;
});

/** Create a simple upstream HTTP server that echoes the request. */
function createUpstream(
  response = "ok",
): Promise<{ url: string; server: http.Server }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ echo: true, path: req.url, body: response }));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      servers.push({
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
      resolve({ url: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

/** Upstream that serves a fixed text/html document (the SPA index). */
function createHtmlUpstream(
  html: string,
): Promise<{ url: string; server: http.Server }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      servers.push({
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
      resolve({ url: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

/** Upstream that answers every request with a 302 to a fixed Location. */
function createRedirectUpstream(location: string): Promise<{ url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(302, { Location: location });
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      servers.push({
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
      resolve({ url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

/** GET that surfaces the redirect status + Location instead of following it. */
function getRedirect(
  url: string,
): Promise<{ status: number; location?: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        res.resume();
        resolve({ status: res.statusCode!, location: res.headers.location });
      })
      .on("error", reject);
  });
}

/**
 * SSE upstream: sends one event immediately, then holds the stream open for a
 * long time before ending. A buffering proxy would deliver nothing until end,
 * so a test can assert the first event arrives long before the stream closes.
 */
function createSseUpstream(
  endAfterMs = 3000,
): Promise<{ url: string; server: http.Server }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: first\n\n");
      setTimeout(() => {
        res.write("data: second\n\n");
        res.end();
      }, endAfterMs);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      servers.push({
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
      resolve({ url: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

/**
 * Upstream that completes a WebSocket-style upgrade handshake and records the
 * request URL it saw. Just the raw 101 exchange — enough to assert the proxy
 * matched the route and forwarded the full path.
 */
function createWsUpstream(): Promise<{ url: string; seenUrls: string[] }> {
  return new Promise((resolve) => {
    const seenUrls: string[] = [];
    const sockets = new Set<net.Socket>();
    const server = http.createServer();
    server.on("upgrade", (req, socket) => {
      seenUrls.push(req.url ?? "");
      sockets.add(socket as net.Socket);
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n\r\n",
      );
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      servers.push({
        close: () =>
          new Promise<void>((r) => {
            for (const s of sockets) s.destroy();
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
      resolve({ url: `http://127.0.0.1:${addr.port}`, seenUrls });
    });
  });
}

/** Upstream that sends non-SSE headers + a partial body, then stays silent. */
function createStalledUpstream(): Promise<{
  url: string;
  server: http.Server;
}> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.write("partial");
      // Never ends — exercise the mid-response idle timeout.
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      servers.push({
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
      resolve({ url: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

/** Upstream that accepts the connection but never sends a response. */
function createSilentUpstream(): Promise<{ url: string; server: http.Server }> {
  return new Promise((resolve) => {
    const server = http.createServer(() => {
      // Intentionally never respond — exercise the upstream timeout path.
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      servers.push({
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
      resolve({ url: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

/** Upstream that responds after a delay, to exercise in-flight drain. */
function createSlowUpstream(
  delayMs: number,
): Promise<{ url: string; server: http.Server }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ done: true }));
      }, delayMs);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      servers.push({
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
      resolve({ url: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

/** Simple HTTP GET. */
function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      })
      .on("error", reject);
  });
}

describe("createProxyServer", () => {
  let proxy: ProxyServerInstance;

  async function startProxy(): Promise<ProxyServerInstance> {
    proxy = await createProxyServer({ port: 0, host: "127.0.0.1", logger });
    servers.push({ close: () => proxy.stop() });
    return proxy;
  }

  it("starts and reports port/url", async () => {
    const p = await startProxy();
    expect(p.port).toBeGreaterThan(0);
    expect(p.url).toContain(`http://127.0.0.1:${p.port}`);
  });

  it("url returns publicUrl when set, trailing slash stripped", async () => {
    proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      publicUrl: "https://vetra-agent.tenant.vetra.io/",
      logger,
    });
    servers.push({ close: () => proxy.stop() });
    expect(proxy.url).toBe("https://vetra-agent.tenant.vetra.io");
    expect(proxy.port).toBeGreaterThan(0);
  });

  it("health endpoint returns ok", async () => {
    const p = await startProxy();
    const res = await httpGet(`${p.url}/_proxy/health`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, routes: 0 });
  });

  it("routes endpoint returns empty array initially", async () => {
    const p = await startProxy();
    const res = await httpGet(`${p.url}/_proxy/routes`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it("returns 404 for unmatched routes", async () => {
    const p = await startProxy();
    const res = await httpGet(`${p.url}/unknown`);
    expect(res.status).toBe(404);
  });

  it("forwards requests to upstream", async () => {
    const upstream = await createUpstream("hello");
    const p = await startProxy();

    const route: ProxyRoute = {
      prefix: "/api",
      upstream: new URL(upstream.url),
      ws: false,
      source: "test",
    };
    p.addRoute(route);

    const res = await httpGet(`${p.url}/api/some/path`);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.echo).toBe(true);
    expect(body.path).toBe("/some/path");
  });

  it("matches a prefix route when the request carries a query string", async () => {
    const upstream = await createUpstream("gql");
    const p = await startProxy();
    p.addRoute({
      prefix: "/switchboard/graphql",
      upstream: new URL("/graphql", upstream.url),
      ws: false,
      source: "switchboard",
    });

    const res = await httpGet(`${p.url}/switchboard/graphql?query=%7Bme%7D`);
    expect(res.status).toBe(200);
    // Query arrives upstream intact, appended to the rewritten path.
    expect(JSON.parse(res.body).path).toBe("/graphql?query=%7Bme%7D");
  });

  it("exact redirect route fires on the bare path with a query, preserving it", async () => {
    const p = await startProxy();
    p.addRoute({
      prefix: "/",
      exact: true,
      redirectTo: "/d/drive-123",
      ws: false,
      source: "studio-redirect",
    });

    const root = await new Promise<{ status: number; location?: string }>(
      (resolve, reject) => {
        http
          .get(`${p.url}/?utm=x`, (res) => {
            res.resume();
            resolve({
              status: res.statusCode!,
              location: res.headers.location,
            });
          })
          .on("error", reject);
      },
    );
    expect(root.status).toBe(302);
    expect(root.location).toBe("/d/drive-123?utm=x");
  });

  it("matches route prefixes on segment boundaries", async () => {
    const upstream = await createUpstream("foo-svc");
    const p = await startProxy();
    p.addRoute({
      prefix: "/foo",
      upstream: new URL(upstream.url),
      ws: false,
      source: "test",
    });

    // /foo and /foo/x match.
    expect((await httpGet(`${p.url}/foo`)).status).toBe(200);
    const sub = await httpGet(`${p.url}/foo/x`);
    expect(sub.status).toBe(200);
    expect(JSON.parse(sub.body).path).toBe("/x");

    // /foobar must NOT match the /foo route.
    expect((await httpGet(`${p.url}/foobar`)).status).toBe(404);
  });

  it("matches a trailing-slash prefix route on its <prefix>/<rest>", async () => {
    const upstream = await createUpstream("attach");
    const p = await startProxy();
    p.addRoute({
      prefix: "/switchboard/attachments/",
      upstream: new URL("/attachments/", upstream.url),
      ws: false,
      source: "switchboard",
    });

    const res = await httpGet(`${p.url}/switchboard/attachments/abc123`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).path).toBe("/attachments/abc123");

    // A non-boundary near-miss does not match.
    expect((await httpGet(`${p.url}/switchboard/attachmentsX`)).status).toBe(
      404,
    );
  });

  it("returns 502 when upstream is unreachable", async () => {
    const p = await startProxy();

    const route: ProxyRoute = {
      prefix: "/dead",
      upstream: new URL("http://127.0.0.1:1"), // unreachable port
      ws: false,
      source: "test",
    };
    p.addRoute(route);

    const res = await httpGet(`${p.url}/dead/path`);
    expect(res.status).toBe(502);
  });

  it("manages routes: add, remove, sort", async () => {
    const p = await startProxy();

    const route1: ProxyRoute = {
      prefix: "/a",
      upstream: new URL("http://localhost:1234"),
      ws: false,
      source: "src-a",
    };
    const route2: ProxyRoute = {
      prefix: "/a/b",
      upstream: new URL("http://localhost:1235"),
      ws: false,
      source: "src-b",
    };

    p.addRoute(route1);
    p.addRoute(route2);

    // Sorted longest-prefix-first
    const routes = p.getRoutes();
    expect(routes[0].prefix).toBe("/a/b");
    expect(routes[1].prefix).toBe("/a");

    p.removeRoutesBySource("src-b");
    expect(p.getRoutes()).toHaveLength(1);
    expect(p.getRoutes()[0].prefix).toBe("/a");
  });

  it("re-adding a prefix from the same source replaces the route in place", async () => {
    const warnings: string[] = [];
    const p = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      logger: createLogger("warn", (msg) => warnings.push(msg)),
    });
    servers.push({ close: () => p.stop() });

    p.addRoute({
      prefix: "/a",
      upstream: new URL("http://localhost:1234"),
      ws: false,
      source: "svc",
    });
    // Same-prefix route from another source: shadowed behind 'svc'.
    p.addRoute({
      prefix: "/a",
      upstream: new URL("http://localhost:9999"),
      ws: false,
      source: "other",
    });
    warnings.length = 0;
    p.addRoute({
      prefix: "/a",
      upstream: new URL("http://localhost:5678"),
      ws: false,
      source: "svc",
    });

    const routes = p.getRoutes();
    expect(routes).toHaveLength(2);
    // In-place replace keeps 'svc' ahead of the shadowed 'other' route.
    expect(routes[0].source).toBe("svc");
    expect(routes[0].upstream!.toString()).toBe("http://localhost:5678/");
    expect(routes[1].source).toBe("other");
    // A replace that changes the upstream warns.
    expect(warnings.some((w) => w.includes("Proxy route replaced"))).toBe(true);

    // A replace with the same upstream is silent.
    warnings.length = 0;
    p.addRoute({
      prefix: "/a",
      upstream: new URL("http://localhost:5678"),
      ws: false,
      source: "svc",
    });
    expect(warnings.some((w) => w.includes("Proxy route replaced"))).toBe(
      false,
    );
  });

  it("health endpoint reflects route count", async () => {
    const p = await startProxy();
    p.addRoute({
      prefix: "/x",
      upstream: new URL("http://localhost:1234"),
      ws: false,
      source: "x",
    });

    const res = await httpGet(`${p.url}/_proxy/health`);
    expect(JSON.parse(res.body).routes).toBe(1);
  });

  it("routes debug endpoint returns route details", async () => {
    const p = await startProxy();
    p.addRoute({
      prefix: "/foo",
      upstream: new URL("http://localhost:9999/bar"),
      ws: true,
      source: "test-src",
    });

    const res = await httpGet(`${p.url}/_proxy/routes`);
    const routes = JSON.parse(res.body);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({
      prefix: "/foo",
      upstream: "http://localhost:9999/bar",
      ws: true,
      source: "test-src",
    });
  });

  it("exact redirect route fires only on bare root; longer prefixes and assets pass through", async () => {
    const upstream = await createUpstream("catch-all");
    const p = await startProxy();

    // Connect-style '/' catch-all.
    p.addRoute({
      prefix: "/",
      upstream: new URL(upstream.url),
      ws: false,
      source: "connect",
    });
    // Always-on root redirect to the drive.
    p.addRoute({
      prefix: "/",
      exact: true,
      redirectTo: "/d/drive-123",
      ws: false,
      source: "studio-redirect",
    });
    // Drive announce route (longer prefix must win over '/').
    p.addRoute({
      prefix: "/d/drive-123",
      upstream: new URL("/switchboard/d/drive-123", upstream.url),
      ws: false,
      source: "studio-announce",
    });

    // Bare root → 302 to the drive.
    const root = await new Promise<{ status: number; location?: string }>(
      (resolve, reject) => {
        http
          .get(`${p.url}/`, (res) => {
            res.resume();
            resolve({
              status: res.statusCode!,
              location: res.headers.location,
            });
          })
          .on("error", reject);
      },
    );
    expect(root.status).toBe(302);
    expect(root.location).toBe("/d/drive-123");

    // Root-relative asset still reaches the catch-all upstream.
    const asset = await httpGet(`${p.url}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(JSON.parse(asset.body).body).toBe("catch-all");
    expect(JSON.parse(asset.body).path).toBe("/assets/app.js");

    // /d/<id> hits the longer-prefix announce route, not the redirect or catch-all.
    const drive = await httpGet(`${p.url}/d/drive-123`);
    expect(drive.status).toBe(200);
    expect(JSON.parse(drive.body).path).toBe("/switchboard/d/drive-123");

    // Debug endpoint surfaces the redirect + exact flags.
    const routesRes = await httpGet(`${p.url}/_proxy/routes`);
    const table = JSON.parse(routesRes.body) as Array<Record<string, unknown>>;
    const redirect = table.find((r) => r.source === "studio-redirect");
    expect(redirect).toMatchObject({
      prefix: "/",
      redirectTo: "/d/drive-123",
      exact: true,
    });
    const announce = table.find((r) => r.source === "studio-announce");
    expect(announce?.prefix).toBe("/d/drive-123");
  });

  it("mounts the whole surface under publicUrl base path", async () => {
    const upstream = await createUpstream("svc");
    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      publicUrl: "https://host.example/myagent/",
      logger,
    });
    servers.push({ close: () => proxy.stop() });

    // url advertises the full base, trailing slash stripped.
    expect(proxy.url).toBe("https://host.example/myagent");

    proxy.addRoute({
      prefix: "/api",
      upstream: new URL(upstream.url),
      ws: false,
      source: "test",
    });

    const local = `http://127.0.0.1:${proxy.port}`;

    // Prefixed request strips the base before matching/forwarding.
    const ok = await httpGet(`${local}/myagent/api/some/path`);
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body).path).toBe("/some/path");

    // Built-in endpoints live under the base path.
    const health = await httpGet(`${local}/myagent/_proxy/health`);
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ ok: true, routes: 1 });

    // Bare base path maps to root.
    const routesRes = await httpGet(`${local}/myagent/_proxy/routes`);
    expect(routesRes.status).toBe(200);
    expect(JSON.parse(routesRes.body)).toHaveLength(1);

    // A request without the base prefix 404s rather than matching root routes.
    const unprefixed = await httpGet(`${local}/api/some/path`);
    expect(unprefixed.status).toBe(404);

    // The bare mount path with a query still strips to root and matches.
    proxy.addRoute({
      prefix: "/",
      upstream: new URL(upstream.url),
      ws: false,
      source: "connect",
    });
    const bareWithQuery = await httpGet(`${local}/myagent?utm=x`);
    expect(bareWithQuery.status).toBe(200);
    expect(JSON.parse(bareWithQuery.body).path).toBe("/?utm=x");
  });

  it("redirect Location includes the base path under a subpath mount", async () => {
    const upstream = await createUpstream("catch-all");
    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      publicUrl: "https://host.example/myagent",
      logger,
    });
    servers.push({ close: () => proxy.stop() });

    proxy.addRoute({
      prefix: "/",
      exact: true,
      redirectTo: "/d/drive-123",
      ws: false,
      source: "studio-redirect",
    });
    proxy.addRoute({
      prefix: "/",
      upstream: new URL(upstream.url),
      ws: false,
      source: "connect",
    });

    const local = `http://127.0.0.1:${proxy.port}`;

    // Bare base path → 302 with the base path re-prefixed onto the Location.
    const root = await new Promise<{ status: number; location?: string }>(
      (resolve, reject) => {
        http
          .get(`${local}/myagent`, (res) => {
            res.resume();
            resolve({
              status: res.statusCode!,
              location: res.headers.location,
            });
          })
          .on("error", reject);
      },
    );
    expect(root.status).toBe(302);
    expect(root.location).toBe("/myagent/d/drive-123");

    // Root-relative asset under the base still reaches the catch-all upstream.
    const asset = await httpGet(`${local}/myagent/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(JSON.parse(asset.body).path).toBe("/assets/app.js");
  });

  it("forwards an HTML document unrewritten (pure forwarder)", async () => {
    // Dynamic-base substitution happens at connect-server startup, not in the
    // proxy: a document carrying the token arrives byte-identical even under
    // a subpath mount.
    const html =
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<script type="module" src="/__PH_DYNAMIC_BASE__/assets/index.js"></script>` +
      `</head><body><div id="root"></div></body></html>`;
    const upstream = await createHtmlUpstream(html);
    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      publicUrl: "https://host.example/myagent",
      logger,
    });
    servers.push({ close: () => proxy.stop() });
    proxy.addRoute({
      prefix: "/",
      upstream: new URL(upstream.url),
      ws: false,
      source: "connect",
    });

    const local = `http://127.0.0.1:${proxy.port}`;
    const res = await httpGet(`${local}/myagent/`);
    expect(res.status).toBe(200);
    expect(res.body).toBe(html);
  });

  it("passes a gzip-encoded response through with its content-encoding intact", async () => {
    const payload = JSON.stringify({ data: { ok: true } });
    const gzipped = zlib.gzipSync(Buffer.from(payload, "utf8"));
    const upstream = await new Promise<{ url: string }>((resolve) => {
      const server = http.createServer((_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          "Content-Length": String(gzipped.length),
        });
        res.end(gzipped);
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        servers.push({
          close: () => new Promise<void>((r) => server.close(() => r())),
        });
        resolve({ url: `http://127.0.0.1:${addr.port}` });
      });
    });
    const p = await startProxy();
    p.addRoute({
      prefix: "/api",
      upstream: new URL(upstream.url),
      ws: false,
      source: "test",
    });

    const res = await new Promise<{
      status: number;
      encoding?: string;
      body: Buffer;
    }>((resolve, reject) => {
      http
        .get(
          `${p.url}/api/graphql`,
          { headers: { "accept-encoding": "gzip" } },
          (r) => {
            const chunks: Buffer[] = [];
            r.on("data", (c: Buffer) => chunks.push(c));
            r.on("end", () =>
              resolve({
                status: r.statusCode!,
                encoding: r.headers["content-encoding"],
                body: Buffer.concat(chunks),
              }),
            );
          },
        )
        .on("error", reject);
    });

    expect(res.status).toBe(200);
    expect(res.encoding).toBe("gzip");
    expect(zlib.gunzipSync(res.body).toString("utf8")).toBe(payload);
  });

  it("streams an SSE response through unbuffered", async () => {
    const upstream = await createSseUpstream();
    const p = await startProxy();
    p.addRoute({
      prefix: "/preview",
      upstream: new URL(upstream.url),
      ws: false,
      source: "preview",
    });

    // The upstream holds the stream open for 3s after the first event. A
    // buffering proxy would deliver nothing until then; assert the first event
    // arrives well before the stream ends. The wide margin (first event by 1s
    // vs a 3s hold) tolerates cold-start jitter under parallel test load.
    const firstEvent = await new Promise<{ data: string; ended: boolean }>(
      (resolve, reject) => {
        let buf = "";
        const req = http.get(`${p.url}/preview/events`, (res) => {
          expect(res.headers["content-type"]).toContain("text/event-stream");
          res.on("data", (chunk: Buffer) => {
            buf += chunk.toString();
            if (buf.includes("data: first")) {
              req.destroy();
              resolve({ data: buf, ended: false });
            }
          });
          res.on("end", () => resolve({ data: buf, ended: true }));
        });
        req.on("error", (e: NodeJS.ErrnoException) => {
          // The destroy() above surfaces as ECONNRESET on this side — ignore it.
          if (e.code !== "ECONNRESET") reject(e);
        });
        setTimeout(
          () =>
            reject(
              new Error("first SSE event did not arrive within 1s (buffered?)"),
            ),
          1000,
        );
      },
    );

    // First event received while the upstream is still holding the stream open
    // — i.e. not buffered to end.
    expect(firstEvent.ended).toBe(false);
    expect(firstEvent.data).toContain("data: first");
  });

  it("prefixes a root-relative upstream redirect Location under a base-path mount", async () => {
    const upstream = await createRedirectUpstream("/d/abc");
    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      publicUrl: "https://host.example/myagent",
      logger,
    });
    servers.push({ close: () => proxy.stop() });
    proxy.addRoute({
      prefix: "/",
      upstream: new URL(upstream.url),
      ws: false,
      source: "connect",
    });

    const res = await getRedirect(`http://127.0.0.1:${proxy.port}/myagent/old`);
    expect(res.status).toBe(302);
    expect(res.location).toBe("/myagent/d/abc");
  });

  it("does not double-prefix an upstream Location already carrying the base path", async () => {
    const upstream = await createRedirectUpstream("/myagent/d/abc");
    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      publicUrl: "https://host.example/myagent",
      logger,
    });
    servers.push({ close: () => proxy.stop() });
    proxy.addRoute({
      prefix: "/",
      upstream: new URL(upstream.url),
      ws: false,
      source: "connect",
    });

    const res = await getRedirect(`http://127.0.0.1:${proxy.port}/myagent/old`);
    expect(res.location).toBe("/myagent/d/abc");
  });

  it("leaves absolute-URL upstream Locations untouched under a mount", async () => {
    const upstream = await createRedirectUpstream(
      "https://elsewhere.example/d/abc",
    );
    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      publicUrl: "https://host.example/myagent",
      logger,
    });
    servers.push({ close: () => proxy.stop() });
    proxy.addRoute({
      prefix: "/",
      upstream: new URL(upstream.url),
      ws: false,
      source: "connect",
    });

    const res = await getRedirect(`http://127.0.0.1:${proxy.port}/myagent/old`);
    expect(res.location).toBe("https://elsewhere.example/d/abc");
  });

  it("leaves an upstream redirect Location unchanged at root mount", async () => {
    const upstream = await createRedirectUpstream("/d/abc");
    const p = await startProxy();
    p.addRoute({
      prefix: "/",
      upstream: new URL(upstream.url),
      ws: false,
      source: "connect",
    });

    const res = await getRedirect(`${p.url}/old`);
    expect(res.status).toBe(302);
    expect(res.location).toBe("/d/abc");
  });

  it("root-mount redirect Location is unchanged without a base path", async () => {
    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      logger,
    });
    servers.push({ close: () => proxy.stop() });

    proxy.addRoute({
      prefix: "/",
      exact: true,
      redirectTo: "/d/drive-123",
      ws: false,
      source: "studio-redirect",
    });

    const root = await new Promise<{ status: number; location?: string }>(
      (resolve, reject) => {
        http
          .get(`${proxy.url}/`, (res) => {
            res.resume();
            resolve({
              status: res.statusCode!,
              location: res.headers.location,
            });
          })
          .on("error", reject);
      },
    );
    expect(root.status).toBe(302);
    expect(root.location).toBe("/d/drive-123");
  });

  it("keeps a quiet SSE stream alive past the idle timeouts", async () => {
    // First event immediately, then silence well past the 300ms timeouts
    // before the second event + end.
    const upstream = await createSseUpstream(900);
    const prevUp = process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS;
    const prevIn = process.env.PH_PROXY_INCOMING_TIMEOUT_MS;
    process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS = "300";
    process.env.PH_PROXY_INCOMING_TIMEOUT_MS = "300";
    try {
      proxy = await createProxyServer({ port: 0, host: "127.0.0.1", logger });
      servers.push({ close: () => proxy.stop() });
      proxy.addRoute({
        prefix: "/events",
        upstream: new URL(upstream.url),
        ws: false,
        source: "test",
      });

      const result = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          http
            .get(`${proxy.url}/events/stream`, (res) => {
              let body = "";
              res.on("data", (chunk: Buffer) => {
                body += chunk.toString();
              });
              res.on("end", () => resolve({ status: res.statusCode!, body }));
              res.on("error", reject);
            })
            .on("error", reject);
        },
      );

      // The late event arrived after the quiet window — the stream survived
      // the idle timeouts and ended normally.
      expect(result.status).toBe(200);
      expect(result.body).toContain("data: first");
      expect(result.body).toContain("data: second");
    } finally {
      if (prevUp === undefined) delete process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS;
      else process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS = prevUp;
      if (prevIn === undefined) delete process.env.PH_PROXY_INCOMING_TIMEOUT_MS;
      else process.env.PH_PROXY_INCOMING_TIMEOUT_MS = prevIn;
    }
  });

  it("still reaps a non-SSE response that stalls mid-body past the timeout", async () => {
    const upstream = await createStalledUpstream();
    const prev = process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS;
    process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS = "300";
    try {
      proxy = await createProxyServer({ port: 0, host: "127.0.0.1", logger });
      servers.push({ close: () => proxy.stop() });
      proxy.addRoute({
        prefix: "/stall",
        upstream: new URL(upstream.url),
        ws: false,
        source: "test",
      });

      const start = Date.now();
      // The truncated response surfaces as a premature close on the client;
      // 'close' fires either way — assert it happens promptly, not after a hang.
      await new Promise<void>((resolve, reject) => {
        http
          .get(`${proxy.url}/stall/x`, (res) => {
            res.on("data", () => {});
            res.on("error", () => {});
            res.on("close", () => resolve());
          })
          .on("error", () => resolve());
        setTimeout(
          () => reject(new Error("stalled response was not reaped within 5s")),
          5000,
        );
      });
      expect(Date.now() - start).toBeLessThan(5000);
    } finally {
      if (prev === undefined) delete process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS;
      else process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS = prev;
    }
  });

  it("returns 504 (not a hang) when the upstream is silent past the timeout", async () => {
    const upstream = await createSilentUpstream();
    const prev = process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS;
    process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS = "300";
    try {
      proxy = await createProxyServer({ port: 0, host: "127.0.0.1", logger });
      servers.push({ close: () => proxy.stop() });
      proxy.addRoute({
        prefix: "/slow",
        upstream: new URL(upstream.url),
        ws: false,
        source: "test",
      });

      const start = Date.now();
      const res = await httpGet(`${proxy.url}/slow/x`);
      const elapsed = Date.now() - start;
      expect(res.status).toBe(504);
      // Returned promptly via the timeout, not after some long default hang.
      expect(elapsed).toBeLessThan(5000);
    } finally {
      if (prev === undefined) delete process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS;
      else process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS = prev;
    }
  });

  it("matches a WS upgrade carrying a query string and forwards it upstream", async () => {
    const upstream = await createWsUpstream();
    const p = await startProxy();
    p.addRoute({
      prefix: "/ws",
      upstream: new URL(upstream.url),
      ws: true,
      source: "test",
    });

    const response = await new Promise<string>((resolve, reject) => {
      let buf = "";
      const sock = net.connect(p.port, "127.0.0.1", () => {
        sock.write(
          "GET /ws/echo?token=abc HTTP/1.1\r\n" +
            `Host: 127.0.0.1:${p.port}\r\n` +
            "Connection: Upgrade\r\n" +
            "Upgrade: websocket\r\n" +
            "Sec-WebSocket-Version: 13\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
        );
      });
      sock.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        if (buf.includes("\r\n\r\n")) {
          sock.destroy();
          resolve(buf);
        }
      });
      sock.on("error", reject);
      setTimeout(() => {
        sock.destroy();
        reject(new Error("no upgrade response within 1s"));
      }, 1000);
    });

    expect(response).toContain("101");
    expect(upstream.seenUrls).toEqual(["/echo?token=abc"]);
  });

  it("a client socket reset during WS upgrade does not crash the process", async () => {
    const p = await startProxy();
    // A ws route whose upstream is unreachable, so the upstream upgrade never
    // completes and the client-reset window stays open.
    p.addRoute({
      prefix: "/ws",
      upstream: new URL("http://127.0.0.1:1"),
      ws: true,
      source: "test",
    });

    // Open a raw TCP connection, send an Upgrade request, then abruptly reset
    // it (destroy with an error) before the handshake resolves.
    await new Promise<void>((resolve) => {
      const sock = net.connect(p.port, "127.0.0.1", () => {
        sock.write(
          "GET /ws HTTP/1.1\r\n" +
            `Host: 127.0.0.1:${p.port}\r\n` +
            "Connection: Upgrade\r\n" +
            "Upgrade: websocket\r\n" +
            "Sec-WebSocket-Version: 13\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
        );
        // Force an RST shortly after sending, mid-handshake.
        setTimeout(() => sock.destroy(new Error("client reset")), 20);
      });
      sock.on("error", () => {}); // ignore the local-side error
      sock.on("close", () => resolve());
    });

    // Give any error propagation a tick, then assert the proxy still serves —
    // i.e. the process did not exit and the server is intact.
    await new Promise((r) => setTimeout(r, 50));
    const health = await httpGet(`${p.url}/_proxy/health`);
    expect(health.status).toBe(200);
  });

  it("does not register process-wide exception handlers", async () => {
    const uncaughtBefore = process.listenerCount("uncaughtException");
    const rejectionBefore = process.listenerCount("unhandledRejection");
    await startProxy();
    expect(process.listenerCount("uncaughtException")).toBe(uncaughtBefore);
    expect(process.listenerCount("unhandledRejection")).toBe(rejectionBefore);
  });

  it("an abrupt client destroy mid-request does not kill the server", async () => {
    const upstream = await createSlowUpstream(500);
    const p = await startProxy();
    p.addRoute({
      prefix: "/slow",
      upstream: new URL(upstream.url),
      ws: false,
      source: "test",
    });

    // Send a full request, then reset the socket while the upstream is still
    // working on the response.
    await new Promise<void>((resolve) => {
      const sock = net.connect(p.port, "127.0.0.1", () => {
        sock.write(`GET /slow/x HTTP/1.1\r\nHost: 127.0.0.1:${p.port}\r\n\r\n`);
        setTimeout(() => sock.destroy(new Error("client reset")), 50);
      });
      sock.on("error", () => {}); // ignore the local-side error
      sock.on("close", () => resolve());
    });

    await new Promise((r) => setTimeout(r, 50));
    const health = await httpGet(`${p.url}/_proxy/health`);
    expect(health.status).toBe(200);
  });

  it("stop closes the server", async () => {
    const p = await createProxyServer({ port: 0, host: "127.0.0.1", logger });
    await p.stop();
    // After stop, connecting should fail
    await expect(httpGet(`${p.url}/_proxy/health`)).rejects.toThrow();
  });

  it("stop drains an in-flight request to completion before closing", async () => {
    const upstream = await createSlowUpstream(300);
    const p = await createProxyServer({ port: 0, host: "127.0.0.1", logger });
    p.addRoute({
      prefix: "/slow",
      upstream: new URL(upstream.url),
      ws: false,
      source: "test",
    });

    // Fire a request that won't finish for 300ms, then stop the proxy while
    // it's in flight. The drain (10s default) must let it complete with 200.
    const inflight = httpGet(`${p.url}/slow/x`);
    await new Promise((r) => setTimeout(r, 50)); // ensure the request is in flight
    await p.stop();
    const res = await inflight;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).done).toBe(true);
  });

  it("stop resolves within the drain timeout when a connection is stuck", async () => {
    const upstream = await createSilentUpstream();
    const prev = process.env.PH_PROXY_DRAIN_TIMEOUT_MS;
    process.env.PH_PROXY_DRAIN_TIMEOUT_MS = "300";
    // Loosen the upstream timeout so the silent upstream stays connected past
    // the drain window rather than 504ing first.
    const prevUp = process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS;
    process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS = "30000";
    try {
      const p = await createProxyServer({ port: 0, host: "127.0.0.1", logger });
      p.addRoute({
        prefix: "/stuck",
        upstream: new URL(upstream.url),
        ws: false,
        source: "test",
      });

      // Open a request that the upstream never answers — holds a connection.
      const stuck = httpGet(`${p.url}/stuck/x`).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 50));

      const start = Date.now();
      await p.stop();
      const elapsed = Date.now() - start;
      // Resolved via the 300ms drain deadline (force-close), not hung.
      expect(elapsed).toBeLessThan(3000);
      await stuck;
    } finally {
      if (prev === undefined) delete process.env.PH_PROXY_DRAIN_TIMEOUT_MS;
      else process.env.PH_PROXY_DRAIN_TIMEOUT_MS = prev;
      if (prevUp === undefined) delete process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS;
      else process.env.PH_PROXY_UPSTREAM_TIMEOUT_MS = prevUp;
    }
  });
});

describe("proxy routes end-to-end", () => {
  it("switchboard routes forward to correct upstreams", async () => {
    // Simulate switchboard (graphql + d/) and MCP as two separate upstreams
    const sbUpstream = await createUpstream("switchboard");
    const mcpUpstream = await createUpstream("mcp");

    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      logger,
    });
    servers.push({ close: () => proxy.stop() });

    const routes = buildSwitchboardRoutes(sbUpstream.url, mcpUpstream.url);
    for (const r of routes) proxy.addRoute(r);

    // GraphQL endpoint → switchboard upstream
    const gqlRes = await httpGet(`${proxy.url}/switchboard/graphql`);
    expect(gqlRes.status).toBe(200);
    const gqlBody = JSON.parse(gqlRes.body);
    expect(gqlBody.body).toBe("switchboard");
    expect(gqlBody.path).toBe("/graphql");

    // Drive endpoint → switchboard upstream
    const driveRes = await httpGet(`${proxy.url}/switchboard/d/some-drive`);
    expect(driveRes.status).toBe(200);
    const driveBody = JSON.parse(driveRes.body);
    expect(driveBody.body).toBe("switchboard");
    expect(driveBody.path).toBe("/d/some-drive");

    // MCP endpoint → MCP upstream
    const mcpRes = await httpGet(`${proxy.url}/switchboard/mcp`);
    expect(mcpRes.status).toBe(200);
    const mcpBody = JSON.parse(mcpRes.body);
    expect(mcpBody.body).toBe("mcp");
    expect(mcpBody.path).toBe("/mcp");
  });

  it("service routes forward to service upstreams", async () => {
    const svcUpstream = await createUpstream("service-mcp");

    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      logger,
    });
    servers.push({ close: () => proxy.stop() });

    const def: ServiceDefinition = {
      id: "my-registry",
      command: "echo",
      readiness: {
        pattern: /listening on (http:\/\/\S+)/,
        captures: {
          mcp: { group: 1, type: "api-mcp" },
        },
        timeout: 5000,
      },
    };

    const instance: ServiceInstanceStatus = {
      serviceId: "my-registry",
      instanceId: "i1",
      name: "my-registry",
      status: "ready",
      endpoints: { mcp: `${svcUpstream.url}/mcp` },
    };

    const routes = buildServiceRoutes(def, instance);
    for (const r of routes) proxy.addRoute(r);

    const res = await httpGet(`${proxy.url}/my-registry/mcp`);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.body).toBe("service-mcp");
    expect(body.path).toBe("/mcp");
  });

  it("switchboard and service routes coexist with correct routing", async () => {
    const sbUpstream = await createUpstream("sb");
    const mcpUpstream = await createUpstream("mcp-sb");
    const svcUpstream = await createUpstream("svc");

    const proxy = await createProxyServer({
      port: 0,
      host: "127.0.0.1",
      logger,
    });
    servers.push({ close: () => proxy.stop() });

    // Add switchboard routes
    for (const r of buildSwitchboardRoutes(sbUpstream.url, mcpUpstream.url)) {
      proxy.addRoute(r);
    }

    // Add service routes
    const def: ServiceDefinition = {
      id: "ext-svc",
      command: "echo",
      readiness: {
        patterns: [
          {
            name: "rest",
            pattern: /REST at (http:\/\/\S+)/,
            captures: { api: { group: 1, type: "api-rest" } },
          },
          {
            name: "mcp",
            pattern: /MCP at (http:\/\/\S+)/,
            captures: { mcp: { group: 1, type: "api-mcp" } },
          },
        ],
        timeout: 5000,
      },
    };
    const instance: ServiceInstanceStatus = {
      serviceId: "ext-svc",
      instanceId: "i1",
      name: "ext-svc",
      status: "ready",
      endpoints: {
        api: `${svcUpstream.url}/api`,
        mcp: `${svcUpstream.url}/mcp`,
      },
    };
    for (const r of buildServiceRoutes(def, instance)) {
      proxy.addRoute(r);
    }

    // Switchboard graphql → sb upstream
    const gqlRes = await httpGet(`${proxy.url}/switchboard/graphql`);
    expect(JSON.parse(gqlRes.body).body).toBe("sb");

    // Switchboard MCP → mcp upstream
    const mcpRes = await httpGet(`${proxy.url}/switchboard/mcp`);
    expect(JSON.parse(mcpRes.body).body).toBe("mcp-sb");

    // Service REST → svc upstream
    const apiRes = await httpGet(`${proxy.url}/ext-svc/api/data`);
    expect(apiRes.status).toBe(200);
    expect(JSON.parse(apiRes.body).body).toBe("svc");
    expect(JSON.parse(apiRes.body).path).toBe("/api/data");

    // Service MCP → svc upstream
    const svcMcpRes = await httpGet(`${proxy.url}/ext-svc/mcp`);
    expect(JSON.parse(svcMcpRes.body).body).toBe("svc");
    expect(JSON.parse(svcMcpRes.body).path).toBe("/mcp");

    // Unmatched → 404
    const notFound = await httpGet(`${proxy.url}/unknown`);
    expect(notFound.status).toBe(404);

    // Verify route count
    const health = await httpGet(`${proxy.url}/_proxy/health`);
    expect(JSON.parse(health.body).routes).toBe(6); // 4 switchboard + 2 service

    // Remove service routes, switchboard stays
    proxy.removeRoutesBySource("service:ext-svc");
    const afterRemove = await httpGet(`${proxy.url}/_proxy/health`);
    expect(JSON.parse(afterRemove.body).routes).toBe(4);

    // Service routes gone
    const gone = await httpGet(`${proxy.url}/ext-svc/mcp`);
    expect(gone.status).toBe(404);

    // Switchboard still works
    const stillUp = await httpGet(`${proxy.url}/switchboard/graphql`);
    expect(stillUp.status).toBe(200);
  });
});
