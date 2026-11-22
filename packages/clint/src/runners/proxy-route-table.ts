/* Kept out of proxy-runner.ts: a runner module exports only its verb
 * functions (plus schemas and constants). */

/** One declared route of a proxy host, resolved (its upstream a URL). */
export interface ProxyRouteInput {
  upstream: string;
  path?: string;
  ws?: boolean;
}

/** A route as the proxy server takes it. */
export interface ResolvedProxyRoute {
  prefix: string;
  upstream: string;
  ws: boolean;
  source: string;
}

/** Pure route-table assembly: each upstream, trailing slashes trimmed, plus
 * its optional path. */
export function buildProxyRouteTable(
  routes: Record<string, ProxyRouteInput>,
): ResolvedProxyRoute[] {
  return Object.entries(routes).map(([prefix, route]) => ({
    prefix,
    upstream: `${route.upstream.replace(/\/+$/, "")}${route.path ?? ""}`,
    ws: route.ws ?? false,
    source: `upstream:${route.upstream}`,
  }));
}
