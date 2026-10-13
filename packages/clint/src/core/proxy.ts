/**
 * Embedded reverse proxy — exposes all service endpoints through a single port.
 * Uses http-proxy for HTTP + WebSocket forwarding.
 */
import http from "node:http";
import httpProxy from "http-proxy";
import type { Logger } from "./types.js";
import type { ProxyRoute } from "./proxy-routes.js";
import {
  deriveBasePath,
  normalizeLoopbackHost,
  prefixMatches,
} from "./proxy-routes.js";

export interface ProxyServerOptions {
  /** Port to listen on (0 = auto-assign). */
  port: number;
  /** Bind address (default '0.0.0.0'). */
  host: string;
  /**
   * Browser-facing base URL when the proxy sits behind an ingress /
   * reverse proxy (e.g. `https://vetra-agent.<tenant>.vetra.io`). When
   * set, `url` returns this instead of the local listen address, so
   * everything composed from it (the ready event's proxied switchboard /
   * drive / mcp URLs) is reachable from outside the pod.
   *
   * A non-root pathname mounts the whole proxy surface under that base
   * path (e.g. `https://host/myagent` → base path `/myagent`): incoming
   * requests carry the prefix, it is stripped before route matching, and
   * redirect Locations are re-prefixed with it.
   */
  publicUrl?: string;
  logger: Logger;
}

export interface ProxyServerInstance {
  readonly port: number;
  readonly host: string;
  readonly url: string;
  addRoute(route: ProxyRoute): void;
  removeRoutesBySource(source: string): void;
  getRoutes(): ReadonlyArray<Readonly<ProxyRoute>>;
  stop(): Promise<void>;
}

/**
 * Compute the X-Forwarded-Prefix value to send upstream. `base` is the
 * mount base path ('' | '/x') prepended so upstreams emitting absolute
 * paths reconstruct the externally-visible prefix.
 */
function computeForwardedPrefix(
  route: ProxyRoute,
  base: string,
): string | undefined {
  if (!route.upstream) return undefined;
  const strip = (s: string) => s.replace(/\/$/, "");
  const prefix = strip(route.prefix);
  const upstreamPath = strip(route.upstream.pathname);
  const routePrefix =
    upstreamPath && prefix.endsWith(upstreamPath)
      ? prefix.slice(0, -upstreamPath.length)
      : prefix;
  const result = base + routePrefix;
  return result || undefined;
}

// Upstream/incoming socket timeouts (ms), overridable via env. The proxy
// fronts only loopback dev services that should answer in well under a second;
// 30s upstream is generous headroom for a cold start yet fails fast on a dead
// or silent upstream instead of hanging the client. Incoming client timeout is
// looser (60s) to reap stuck/half-open clients without cutting slow uploads.
// WS routes are not bound by proxyTimeout here (long-lived upgrades).
function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_INCOMING_TIMEOUT_MS = 60_000;

// Split a request URL into pathname and query tail ('' or leading-'?').
// Route matching and base stripping operate on the pathname only; the tail
// is re-appended to the path forwarded upstream (and to redirect Locations).
function splitUrl(url: string): [pathname: string, query: string] {
  const qIdx = url.indexOf("?");
  return qIdx === -1 ? [url, ""] : [url.slice(0, qIdx), url.slice(qIdx)];
}

// Max time to wait for in-flight requests to finish on shutdown before
// force-closing remaining sockets. Overridable via PH_PROXY_DRAIN_TIMEOUT_MS.
const DEFAULT_DRAIN_TIMEOUT_MS = 10_000;

/**
 * Create and start an embedded reverse proxy server.
 */
export async function createProxyServer(
  options: ProxyServerOptions,
): Promise<ProxyServerInstance> {
  const { host, logger } = options;
  let routes: ProxyRoute[] = [];
  // Idempotent stop: a duplicate signal during teardown must not re-drain.
  let stopped = false;

  // Base path the whole proxy surface is mounted under, derived from a
  // non-root pathname on publicUrl. Empty when serving from the origin
  // root. Normalized to a leading-slash, no-trailing-slash form ('' | '/x').
  const basePath = deriveBasePath(options.publicUrl);

  // Strip the base path from an incoming request path before route
  // matching. Requests that don't carry the prefix yield undefined so the
  // caller can 404 rather than mismatch a root route.
  function stripBase(pathname: string): string | undefined {
    if (!basePath) return pathname;
    if (!prefixMatches(basePath, pathname)) return undefined;
    return pathname === basePath ? "/" : pathname.slice(basePath.length);
  }

  // Re-prefix a root-relative redirect Location with the base path so the
  // browser stays under the mount. Absolute URLs and other-prefixed paths
  // pass through untouched.
  function prefixRedirect(location: string): string {
    if (!basePath) return location;
    if (!location.startsWith("/") || location.startsWith("//")) return location;
    if (prefixMatches(basePath, location)) return location;
    return basePath + location;
  }

  // Shared keep-alive agent for all upstreams (every target is loopback HTTP).
  // autoSelectFamily:false pins Node to the first resolved address; paired with
  // localhost→127.0.0.1 normalization on the target host so the pinned family
  // is deterministically IPv4 (avoids the Happy-Eyeballs dual-stack stall).
  const upstreamAgent = new http.Agent({
    keepAlive: true,
    autoSelectFamily: false,
  });

  const proxy = httpProxy.createProxyServer({
    xfwd: true,
    agent: upstreamAgent,
    proxyTimeout: envMs(
      "PH_PROXY_UPSTREAM_TIMEOUT_MS",
      DEFAULT_UPSTREAM_TIMEOUT_MS,
    ),
    timeout: envMs("PH_PROXY_INCOMING_TIMEOUT_MS", DEFAULT_INCOMING_TIMEOUT_MS),
  });

  // Event streams legitimately go quiet between events; the fail-fast idle
  // timeouts (proxyTimeout/timeout) must not reap them. Clear both the
  // upstream and client socket idle timers for text/event-stream responses.
  proxy.on("proxyRes", (proxyRes, _req, res) => {
    const contentType = String(
      proxyRes.headers["content-type"] ?? "",
    ).toLowerCase();
    if (!contentType.includes("text/event-stream")) return;
    proxyRes.socket?.setTimeout(0);
    (res as http.ServerResponse).socket?.setTimeout(0);
  });

  // proxyTimeout fires mid-response as proxyReq.abort(); Node suppresses the
  // request 'error' after an explicit abort, so http-proxy's error handler
  // never runs and the client would hang on a truncated body. If the upstream
  // body closes without ending, tear down the client response (destroy, not
  // end — a clean end would mis-signal a complete chunked body).
  proxy.on("proxyRes", (proxyRes, _req, res) => {
    const serverRes = res as http.ServerResponse;
    proxyRes.on("close", () => {
      if (!proxyRes.readableEnded && !serverRes.writableEnded) {
        serverRes.destroy();
      }
    });
  });

  // Upstream 3xx responses pass through verbatim; under a base-path mount a
  // root-relative Location would escape the mount. Re-prefix it the same way
  // built-in redirect routes are (prefixRedirect: no-op at root mount, for
  // absolute/protocol-relative URLs, and for already-prefixed paths).
  // http-proxy emits 'proxyRes' before writing headers in default mode, so
  // mutating proxyRes.headers takes effect.
  proxy.on("proxyRes", (proxyRes) => {
    const status = proxyRes.statusCode ?? 0;
    if (status < 300 || status >= 400) return;
    const location = proxyRes.headers.location;
    if (typeof location !== "string") return;
    proxyRes.headers.location = prefixRedirect(location);
  });

  proxy.on("error", (err, req, res) => {
    logger.warn(`Proxy error for ${req.url}: ${err.message}`);
    // 504 on an upstream that accepted/connected but stalled past proxyTimeout
    // (http-proxy surfaces this as ECONNRESET/ETIMEDOUT); 502 on a refused or
    // unreachable connect. Default to 502 for anything else.
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "ETIMEDOUT" || code === "ECONNRESET" ? 504 : 502;
    const message = status === 504 ? "Gateway Timeout" : "Bad Gateway";
    // Guard against double-send: the response may be a WS socket, or headers
    // may already be in flight from a partially-streamed response.
    if (res && "writeHead" in res) {
      const serverRes = res as http.ServerResponse;
      if (!serverRes.headersSent && serverRes.writable) {
        serverRes.writeHead(status, { "Content-Type": "application/json" });
        serverRes.end(JSON.stringify({ error: message, message: err.message }));
      } else if (!serverRes.writableEnded) {
        serverRes.end();
      }
    } else if (res && "destroy" in res) {
      (res as import("node:net").Socket).destroy();
    }
  });

  function matchRoute(pathname: string): ProxyRoute | undefined {
    // Exact routes win first, so a `'/'` exact redirect fires only on the bare
    // root while `/assets/*`, `/d/<id>`, etc. fall through to prefix routes
    // (including a `'/'` catch-all).
    for (const route of routes) {
      if (route.exact && pathname === route.prefix) {
        return route;
      }
    }
    // Routes are kept sorted longest-prefix-first.
    for (const route of routes) {
      if (route.exact) continue;
      if (prefixMatches(route.prefix, pathname)) {
        return route;
      }
    }
    return undefined;
  }

  function sortRoutes(): void {
    routes.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  function rewriteTarget(
    route: ProxyRoute,
    upstream: URL,
    requestPath: string,
  ): string {
    const suffix = requestPath.slice(route.prefix.length);
    const upstreamPath = upstream.pathname;
    // Avoid double slashes when both upstream ends with / and suffix starts with /
    if (upstreamPath.endsWith("/") && suffix.startsWith("/")) {
      return upstreamPath + suffix.slice(1);
    }
    // Ensure a separator when upstream doesn't end with / and suffix doesn't start with /
    if (
      !upstreamPath.endsWith("/") &&
      suffix.length > 0 &&
      !suffix.startsWith("/")
    ) {
      return upstreamPath + "/" + suffix;
    }
    return upstreamPath + suffix;
  }

  const server = http.createServer((req, res) => {
    const [rawPath, query] = splitUrl(req.url ?? "/");
    const stripped = stripBase(rawPath);
    if (stripped === undefined) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found", path: rawPath }));
      return;
    }
    const pathname = stripped;

    // Built-in health endpoint
    if (pathname === "/_proxy/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, routes: routes.length }));
      return;
    }

    // Built-in debug endpoint
    if (pathname === "/_proxy/routes") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          routes.map((r) => ({
            prefix: r.prefix,
            upstream: r.upstream?.toString(),
            ws: r.ws,
            source: r.source,
            ...(r.redirectTo ? { redirectTo: r.redirectTo } : {}),
            ...(r.exact ? { exact: true } : {}),
          })),
        ),
      );
      return;
    }

    const route = matchRoute(pathname);
    if (!route) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found", path: pathname }));
      return;
    }

    if (route.redirectTo) {
      res.writeHead(302, {
        Location: prefixRedirect(route.redirectTo) + query,
      });
      res.end();
      return;
    }

    if (!route.upstream) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Bad Gateway",
          message: "route has no upstream",
        }),
      );
      return;
    }

    const upstream = route.upstream;
    const targetPath = rewriteTarget(route, upstream, pathname);
    const target = `${upstream.protocol}//${normalizeLoopbackHost(upstream.host)}`;

    const forwardedPrefix = computeForwardedPrefix(route, basePath);
    if (forwardedPrefix) {
      req.headers["x-forwarded-prefix"] = forwardedPrefix;
    } else {
      delete req.headers["x-forwarded-prefix"];
    }
    req.url = (targetPath || "/") + query;
    proxy.web(req, res, { target, changeOrigin: true });
  });

  // Errors on accepted client sockets (resets, aborts) must surface on the
  // socket, never as an uncaught exception: destroy and move on.
  server.on("connection", (socket) => {
    socket.on("error", (err) => {
      logger.debug(`Proxy client socket error: ${err.message}`);
      socket.destroy();
    });
  });

  // Malformed or aborted requests before a response object exists: answer 400
  // when the socket is still usable, otherwise just drop it.
  server.on("clientError", (err, socket) => {
    logger.debug(`Proxy client error: ${err.message}`);
    if (
      (err as NodeJS.ErrnoException).code !== "ECONNRESET" &&
      socket.writable
    ) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    socket.destroy();
  });

  // Tracked upgrade/WS client sockets, closed on drain so a long-lived socket
  // can't block shutdown indefinitely.
  const upgradeSockets = new Set<import("node:stream").Duplex>();

  // WebSocket upgrade handling
  server.on("upgrade", (req, socket, head) => {
    upgradeSockets.add(socket);
    socket.on("close", () => upgradeSockets.delete(socket));
    // http-proxy only attaches its client-socket error handler after the
    // upstream upgrade succeeds; a client reset during the handshake would
    // otherwise surface as an unhandled 'error' and crash the process. Attach
    // ours first, before any validation or proxy.ws().
    socket.on("error", (err) => {
      logger.warn(
        `Proxy WS client socket error for ${req.url}: ${err.message}`,
      );
      socket.destroy();
    });

    const [rawPath, query] = splitUrl(req.url ?? "/");
    const stripped = stripBase(rawPath);
    if (stripped === undefined) {
      socket.destroy();
      return;
    }
    const pathname = stripped;
    const route = matchRoute(pathname);

    if (!route || !route.ws || !route.upstream) {
      socket.destroy();
      return;
    }

    const upstream = route.upstream;
    const targetPath = rewriteTarget(route, upstream, pathname);
    const target = `${upstream.protocol}//${normalizeLoopbackHost(upstream.host)}`;

    const forwardedPrefix = computeForwardedPrefix(route, basePath);
    if (forwardedPrefix) {
      req.headers["x-forwarded-prefix"] = forwardedPrefix;
    } else {
      delete req.headers["x-forwarded-prefix"];
    }
    req.url = (targetPath || "/") + query;
    proxy.ws(req, socket, head, { target, changeOrigin: true });
  });

  // Start listening
  const assignedPort = await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(options.port, host, () => {
      const addr = server.address();
      const p = typeof addr === "object" && addr ? addr.port : options.port;
      resolve(p);
    });
  });

  // `url` advertises the browser-facing base, including any base path on
  // publicUrl. `xfwd` relies on the fronting ingress to set
  // X-Forwarded-Proto/Host; the base path is folded into X-Forwarded-Prefix
  // here so upstreams emitting absolute paths reconstruct the full prefix.
  // `|| fallback` (not `??`) so an empty/whitespace-only publicUrl is treated
  // as unset rather than producing an empty `url`. The CLI also validates this
  // as a URL, but createProxyServer is callable directly so we guard here too.
  const url =
    options.publicUrl?.trim().replace(/\/+$/, "") ||
    `http://${host === "0.0.0.0" ? "localhost" : host}:${assignedPort}`;

  const instance: ProxyServerInstance = {
    get port() {
      return assignedPort;
    },
    get host() {
      return host;
    },
    get url() {
      return url;
    },

    addRoute(route: ProxyRoute): void {
      // Same prefix only conflicts when both match the same way: an exact
      // route and a prefix route on the same prefix (e.g. a `'/'` redirect vs
      // Connect's `'/'` catch-all) coexist — matchRoute dispatches exact first.
      // Re-adding from the same source replaces the existing route, so
      // repeated registration (boot-adoption + service:ready) is idempotent.
      const sameMatch = (r: ProxyRoute) =>
        r.prefix === route.prefix && !!r.exact === !!route.exact;
      const ownIdx = routes.findIndex(
        (r) => sameMatch(r) && r.source === route.source,
      );
      if (ownIdx !== -1) {
        // Replace in place: equal prefix length means the sorted position is
        // unchanged, and re-sorting must not let a previously-shadowed
        // same-prefix route from another source jump ahead.
        const prev = routes[ownIdx];
        routes[ownIdx] = route;
        const prevDest =
          prev.redirectTo ?? prev.upstream?.toString() ?? "(no upstream)";
        const newDest =
          route.redirectTo ?? route.upstream?.toString() ?? "(no upstream)";
        if (prevDest !== newDest) {
          logger.warn(
            `Proxy route replaced: '${route.prefix}' (${route.source}) upstream ${prevDest} → ${newDest}`,
          );
        }
      } else {
        const existing = routes.find(sameMatch);
        if (existing) {
          logger.warn(
            `Proxy route conflict: '${route.prefix}'${route.exact ? " (exact)" : ""} already registered by ${existing.source}; ` +
              `route from ${route.source} will be shadowed`,
          );
        }
        routes.push(route);
        sortRoutes();
      }
      const dest = route.redirectTo
        ? `redirect → ${route.redirectTo}`
        : (route.upstream?.toString() ?? "(no upstream)");
      logger.debug(
        `Proxy route added: ${route.prefix} → ${dest} (${route.source})`,
      );
    },

    removeRoutesBySource(source: string): void {
      const before = routes.length;
      routes = routes.filter((r) => r.source !== source);
      const removed = before - routes.length;
      if (removed > 0) {
        logger.debug(
          `Proxy: removed ${removed} route(s) for source '${source}'`,
        );
      }
    },

    getRoutes(): ReadonlyArray<Readonly<ProxyRoute>> {
      return routes;
    },

    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;

      const drainTimeout = envMs(
        "PH_PROXY_DRAIN_TIMEOUT_MS",
        DEFAULT_DRAIN_TIMEOUT_MS,
      );

      // Stop accepting new connections; server.close resolves once all
      // in-flight HTTP requests finish.
      const drained = new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      // Close tracked WS/upgrade sockets so they don't hold the drain open.
      for (const socket of upgradeSockets) socket.destroy();
      upgradeSockets.clear();

      // Bound the drain: after the timeout, force-close any sockets still
      // serving in-flight HTTP requests and resolve.
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          logger.warn(
            `Proxy drain timed out after ${drainTimeout}ms; force-closing connections`,
          );
          server.closeAllConnections?.();
          resolve();
        }, drainTimeout);
        timer.unref?.();
      });

      await Promise.race([drained, deadline]);
      if (timer) clearTimeout(timer);
      proxy.close();
      upstreamAgent.destroy();
      logger.debug("Proxy server stopped");
    },
  };

  return instance;
}
