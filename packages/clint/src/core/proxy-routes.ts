/**
 * The proxy server's route type and its pure path helpers. No side effects —
 * easily unit-testable.
 */

export interface ProxyRoute {
  /** URL path prefix matched against incoming requests (e.g. '/switchboard/graphql'). */
  prefix: string;
  /**
   * Upstream target URL (e.g. new URL('http://localhost:4001/graphql')).
   * Optional only for pure redirect routes (`redirectTo` set).
   */
  upstream?: URL;
  /** Whether WebSocket upgrade should be forwarded on this route. */
  ws: boolean;
  /** Origin label for route management (e.g. 'switchboard', 'service:my-svc'). */
  source: string;
  /**
   * When set, matching requests get a 302 to this location instead of being
   * proxied. No upstream connection is made.
   */
  redirectTo?: string;
  /**
   * Match the prefix exactly rather than as a `startsWith` prefix. Exact
   * routes are matched before prefix routes so a `'/'` redirect can coexist
   * with a `'/'` catch-all without shadowing longer prefixes.
   */
  exact?: boolean;
  /**
   * The upstream behind this prefix is still starting: matching requests get
   * 503 + Retry-After instead of being proxied. A 404 would tell clients the
   * endpoint does not exist, which some treat as permanent.
   */
  unavailable?: boolean;
}

/**
 * Match a route prefix against a request pathname on path-segment boundaries:
 * the prefix matches only when the pathname equals it or continues with a `/`.
 * A bare `startsWith` would let `/foobar` match a `/foo` route. The root prefix
 * `/` matches everything. A prefix already carrying a trailing `/`
 * (e.g. `/switchboard/attachments/`) matches `<prefix>` and `<prefix><rest>`
 * without doubling the separator.
 */
export function prefixMatches(prefix: string, pathname: string): boolean {
  if (prefix === "/") return true;
  if (prefix.endsWith("/")) {
    return pathname === prefix.slice(0, -1) || pathname.startsWith(prefix);
  }
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * Derive the mount base path from publicUrl's pathname. Returns '' for an
 * absent/invalid/root pathname, otherwise a leading-slash, no-trailing-slash
 * form ('/myagent'). Mirrors the trailing-slash stripping the proxy's
 * advertised `url` applies, so the base path and `url` stay aligned.
 */
export function deriveBasePath(publicUrl: string | undefined): string {
  const trimmed = publicUrl?.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    // `new URL('localhost:8090')` parses with protocol 'localhost:' —
    // anything but http(s) is treated as invalid.
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Rewrite a loopback `localhost` host to `127.0.0.1` so a pinned-family agent
 * (autoSelectFamily:false) connects deterministically over IPv4 instead of
 * racing `::1`/`127.0.0.1` (Happy-Eyeballs). Preserves any `:port`. Non-loopback
 * hosts are returned unchanged.
 */
export function normalizeLoopbackHost(host: string): string {
  const [hostname, ...rest] = host.split(":");
  if (hostname.toLowerCase() === "localhost") {
    return ["127.0.0.1", ...rest].join(":");
  }
  return host;
}
