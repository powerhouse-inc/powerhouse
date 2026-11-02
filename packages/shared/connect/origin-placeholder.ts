/**
 * The origin placeholder in Connect's runtime config.
 *
 * A Connect served next to its switchboard reaches it through its own
 * origin: the server Connect is served by (the dev server, the preview
 * server, a published site's edge) proxies the switchboard's paths to it.
 * The served config then names the switchboard as `${origin}` and the
 * browser substitutes the page's origin when it loads the config, so one
 * config is right wherever the page is loaded from: `http://localhost:2540`
 * on the developer's machine, `https://app.example.com` from the internet.
 *
 * Host files may write `${origin}/...` directly (a remote backend's drive
 * address, `${origin}/d/<slug>`); a runner that proxies
 * a sibling rewrites that sibling's absolute URLs to the placeholder as
 * well (`withOriginPlaceholders`), so output tokens keep working unchanged.
 */

export const ORIGIN_PLACEHOLDER = "${origin}";

/**
 * The switchboard's HTTP surface, as path prefixes, which a server that
 * fronts Connect proxies to the switchboard: GraphQL (and its websocket),
 * the drives, attachments, MCP and package routes. Not the readiness and
 * health probes: those stay the fronting server's own.
 */
export const SWITCHBOARD_PROXY_PATHS: readonly string[] = [
  "/graphql",
  "/d/",
  "/attachments",
  "/mcp",
  "/api/",
];

/** True for a request path the switchboard serves (see SWITCHBOARD_PROXY_PATHS). */
export function isSwitchboardProxyPath(pathname: string): boolean {
  return SWITCHBOARD_PROXY_PATHS.some((prefix) =>
    prefix.endsWith("/")
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * True when a request is a browser navigation (it accepts HTML): Connect's
 * own routes live under `/d/<drive>` too, and a page load there must reach
 * the SPA, not the switchboard's drive endpoint of the same path.
 */
export function isHtmlNavigation(accept: string | undefined | null): boolean {
  return typeof accept === "string" && accept.includes("text/html");
}

/** True for a URL written against the placeholder (`${origin}/graphql`). */
export function isOriginPlaceholderUrl(value: string): boolean {
  return (
    value === ORIGIN_PLACEHOLDER || value.startsWith(`${ORIGIN_PLACEHOLDER}/`)
  );
}

/**
 * Replaces the placeholder with `origin` in every string of `value`,
 * recursively. `origin` is an origin (`https://app.example.com`), without a
 * trailing slash.
 */
export function resolveOriginPlaceholders<T>(value: T, origin: string): T {
  const base = origin.replace(/\/+$/, "");
  return mapStrings(value, (s) =>
    s.includes(ORIGIN_PLACEHOLDER) ? s.split(ORIGIN_PLACEHOLDER).join(base) : s,
  ) as T;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Protocol and port, with the loopback names folded into one. */
function originKey(url: URL): string {
  const host = LOOPBACK_HOSTS.has(url.hostname) ? "loopback" : url.hostname;
  return `${url.protocol}//${host}:${url.port}`;
}

/**
 * `url` written against the placeholder when its origin is `proxiedOrigin`
 * (the three loopback spellings count as one host); any other string, and
 * anything that is not a URL, comes back unchanged.
 */
export function toOriginPlaceholder(
  url: string,
  proxiedOrigin: string,
): string {
  let target: URL;
  let candidate: URL;
  try {
    target = new URL(proxiedOrigin);
    candidate = new URL(url);
  } catch {
    return url;
  }
  if (originKey(candidate) !== originKey(target)) return url;
  return `${ORIGIN_PLACEHOLDER}${candidate.pathname}${candidate.search}${candidate.hash}`;
}

/** `toOriginPlaceholder` over every string of `value`, recursively. */
export function withOriginPlaceholders<T>(value: T, proxiedOrigin: string): T {
  return mapStrings(value, (s) => toOriginPlaceholder(s, proxiedOrigin)) as T;
}

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn);
    return out;
  }
  return value;
}
