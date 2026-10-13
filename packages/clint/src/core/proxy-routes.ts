/**
 * Pure functions for building proxy routes from service definitions
 * and Switchboard configuration. No side effects — easily unit-testable.
 */
import type {
  ServiceDefinition,
  ServiceInstanceStatus,
  ServiceProxyRouteSpec,
  CaptureDefinition,
  EndpointType,
} from "./types.js";

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
 * Resolve the proxy info handed to service command/env builders from the
 * configured publicUrl. Single owner of the publicUrl normalization:
 * `publicUrl` must parse as an http(s) URL and is stripped of trailing
 * slashes, undefined when unset/invalid; `basePath` is the URL's pathname
 * normalized like `deriveBasePath`.
 */
export function resolveServiceProxyContext(publicUrl: string | undefined): {
  publicUrl?: string;
  basePath: string;
} {
  const trimmed = publicUrl?.trim();
  if (trimmed) {
    try {
      const url = new URL(trimmed);
      if (/^https?:$/.test(url.protocol)) {
        return {
          publicUrl: trimmed.replace(/\/+$/, ""),
          basePath: url.pathname.replace(/\/+$/, ""),
        };
      }
    } catch {
      // invalid publicUrl — treat as unset
    }
  }
  return { publicUrl: undefined, basePath: "" };
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

/**
 * Endpoint types that imply WebSocket transport. Websites need upgrades
 * forwarded for dev-server HMR sockets (Vite connects on the page's own
 * origin/path).
 */
export function isWsEndpointType(type: EndpointType): boolean {
  return type === "api-mcp" || type === "website";
}

/**
 * Relative-prefix route specs for a Powerhouse Switchboard, usable as
 * `ServiceDefinition.proxyRoutes` specs (mounted under `/{serviceId}/`).
 * The MCP route is included only when `mcpUrl` is provided.
 */
export function buildSwitchboardRouteSpecs(
  switchboardUrl: string,
  mcpUrl?: string,
  basePrefix = "switchboard",
): Array<ServiceProxyRouteSpec & { upstream: URL }> {
  const sbBase = new URL(switchboardUrl);

  const specs: Array<ServiceProxyRouteSpec & { upstream: URL }> = [
    {
      prefix: `${basePrefix}/graphql`,
      upstream: new URL("/graphql", sbBase),
      ws: false,
    },
    {
      prefix: `${basePrefix}/d/`,
      upstream: new URL("/d/", sbBase),
      ws: false,
    },
    {
      prefix: `${basePrefix}/attachments/`,
      upstream: new URL("/attachments/", sbBase),
      ws: false,
    },
  ];
  if (mcpUrl) {
    specs.push({
      prefix: `${basePrefix}/mcp`,
      upstream: new URL("/mcp", new URL(mcpUrl)),
      ws: true,
    });
  }
  return specs;
}

/**
 * Absolute proxy routes for the embedded Switchboard, mounted under
 * `/switchboard` with source `'switchboard'`. The MCP route is included
 * only when `mcpUrl` is provided.
 */
export function buildSwitchboardRoutes(
  switchboardUrl: string,
  mcpUrl?: string,
): Array<ProxyRoute & { upstream: URL }> {
  return buildSwitchboardRouteSpecs(switchboardUrl, mcpUrl).map((spec) => ({
    prefix: `/${spec.prefix}`,
    upstream: spec.upstream,
    ws: spec.ws ?? false,
    source: "switchboard",
  }));
}

/**
 * Browser-facing switchboard URLs through the proxy. Kept next to
 * `buildSwitchboardRoutes` so the `/switchboard` prefix scheme has a single
 * owner — a prefix change here updates both the routes and the URLs handed
 * out to consumers.
 */
export function buildSwitchboardProxyUrls(
  proxyUrl: string,
  switchboard: { driveUrl: string },
): { switchboardUrl: string; driveUrl: string; mcpUrl: string } {
  return {
    switchboardUrl: `${proxyUrl}/switchboard/graphql`,
    driveUrl: `${proxyUrl}/switchboard${new URL(switchboard.driveUrl).pathname}`,
    mcpUrl: `${proxyUrl}/switchboard/mcp`,
  };
}

/** A (serviceId, captureName) pair identifying the proxy-root website. */
export interface ProxyRootCapture {
  serviceId: string;
  captureName: string;
}

/**
 * Resolve which website capture implicitly owns the proxy root when none
 * sets `proxyRoot` explicitly. Exactly one website capture across all
 * definitions → that capture (preserves single-SPA behavior for CLIs that
 * predate the flag). Zero, several, or any explicit root → undefined.
 */
export function resolveImplicitProxyRoot(
  defs: ServiceDefinition[],
): ProxyRootCapture | undefined {
  let single: ProxyRootCapture | undefined;
  let count = 0;
  for (const def of defs) {
    for (const [captureName, captureDef] of getCapturesForDef(def)) {
      if (typeof captureDef === "number") continue;
      if (captureDef.type !== "website") continue;
      if (captureDef.proxyRoot) return undefined;
      count++;
      single ??= { serviceId: def.id, captureName };
    }
  }
  return count === 1 ? single : undefined;
}

/**
 * Proxy mount prefix for a service route: `/{serviceId}/{name}`. Single
 * owner of the convention used for capture routes and for mounting
 * `ServiceDefinition.proxyRoutes` specs.
 */
export function captureRoutePrefix(
  serviceId: string,
  captureName: string,
): string {
  return `/${serviceId}/${captureName}`;
}

/**
 * Build proxy routes from a service definition's readiness captures and its
 * `proxyRoutes` hook. Only captures with announceable endpoint types produce
 * routes; hook specs are mounted under `/{serviceId}/`.
 */
export function buildServiceRoutes(
  def: ServiceDefinition,
  instance: ServiceInstanceStatus,
  implicitRoot?: ProxyRootCapture,
  log?: { warn(msg: string): void },
): ProxyRoute[] {
  const routes: ProxyRoute[] = [];
  const captures = getCapturesForDef(def);

  for (const [captureName, captureDef] of captures) {
    const captureType =
      typeof captureDef === "number" ? undefined : captureDef.type;
    if (!captureType) continue;

    const url = instance.endpoints?.[captureName];
    if (!url) continue;

    try {
      const upstream = new URL(url);
      // Only the proxy-root capture claims the '/' catch-all — the primary
      // SPA whose root-relative asset requests (/assets/*, /icon.ico) must
      // resolve at the proxy root. Either flagged `proxyRoot` explicitly, or
      // the implicit fallback when it is the only website across all
      // services. Every other endpoint, websites included, is routed under
      // its own prefix; prefixed websites must serve themselves under that
      // base path.
      const proxyRoot =
        captureType === "website" &&
        ((typeof captureDef !== "number" && captureDef.proxyRoot === true) ||
          (implicitRoot?.serviceId === def.id &&
            implicitRoot.captureName === captureName));
      const prefix = proxyRoot ? "/" : captureRoutePrefix(def.id, captureName);
      routes.push({
        prefix,
        upstream,
        ws: isWsEndpointType(captureType),
        source: `service:${def.id}`,
      });
    } catch {
      // Skip invalid URLs
    }
  }

  if (def.proxyRoutes) {
    let specs: ServiceProxyRouteSpec[] = [];
    try {
      specs = def.proxyRoutes(instance) ?? [];
    } catch (err) {
      // Skip a throwing hook — capture routes still apply
      log?.warn(
        `proxyRoutes hook failed for service '${def.id}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    for (const spec of specs) {
      try {
        const upstream =
          spec.upstream instanceof URL ? spec.upstream : new URL(spec.upstream);
        routes.push({
          prefix: captureRoutePrefix(def.id, spec.prefix.replace(/^\/+/, "")),
          upstream,
          ws: spec.ws ?? false,
          source: `service:${def.id}`,
        });
      } catch (err) {
        // Skip invalid upstream URLs — other specs still apply
        log?.warn(
          `Invalid proxyRoutes spec '${spec.prefix}' for service '${def.id}': ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return routes;
}

function getCapturesForDef(
  def: ServiceDefinition,
): Array<[string, number | CaptureDefinition]> {
  const result: Array<[string, number | CaptureDefinition]> = [];
  if (!def.readiness) return result;

  if (def.readiness.captures) {
    for (const [name, capDef] of Object.entries(def.readiness.captures)) {
      result.push([name, capDef]);
    }
  }

  if (def.readiness.patterns) {
    for (const pattern of def.readiness.patterns) {
      if (pattern.captures) {
        for (const [name, capDef] of Object.entries(pattern.captures)) {
          result.push([name, capDef]);
        }
      }
    }
  }

  return result;
}
