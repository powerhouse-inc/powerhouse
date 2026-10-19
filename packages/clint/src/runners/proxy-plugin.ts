import type { HostPlugin } from "@powerhousedao/host-core";

/**
 * R5 — the clint proxy as a COMPOUND plugin (rewire plan: appliesTo
 * "compound", the member-set branch of the hierarchy). One front port routes
 * to the scheduled members, WebSocket-aware; member references resolve
 * through each child's runner.{host,port} (the agents-manager convention).
 * Declarative veneer over the clint package's createProxyServer; the route
 * table assembly is pure (buildProxyRouteTable) and unit-tested without
 * sockets.
 */

export interface ProxyPluginConfig {
  port: number;
  host?: string;
  publicUrl?: string;
  /** Route prefix -> target: a member reference (resolved to the child's
   * host:port) or an explicit upstream URL; optional path + ws. */
  routes: Record<
    string,
    {
      member?: string;
      upstream?: string;
      path?: string;
      ws?: boolean;
    }
  >;
}

export interface ResolvedProxyRoute {
  prefix: string;
  upstream: string;
  ws: boolean;
  source: string;
}

/** Member endpoints the compound runner knows at onMemberReady: name ->
 * { host, port }. */
export type MemberEndpoints = Record<string, { host: string; port: number }>;

/**
 * Pure route-table assembly: member refs become loopback upstreams via the
 * member's host:port (+ optional path); explicit upstreams pass through.
 * A member ref with no known endpoint throws naming the member — a routing
 * declaration that cannot resolve must fail loudly, not silently drop.
 */
export function buildProxyRouteTable(
  config: ProxyPluginConfig,
  members: MemberEndpoints,
): ResolvedProxyRoute[] {
  const table: ResolvedProxyRoute[] = [];
  for (const [prefix, route] of Object.entries(config.routes)) {
    if (route.upstream) {
      table.push({
        prefix,
        upstream: `${route.upstream.replace(/\/+$/, "")}${route.path ?? ""}`,
        ws: route.ws ?? false,
        source: `upstream:${route.upstream}`,
      });
      continue;
    }
    if (!route.member) {
      throw new Error(
        `proxy route "${prefix}" names neither a member nor an upstream.`,
      );
    }
    const endpoint = members[route.member];
    if (!endpoint) {
      throw new Error(
        `proxy route "${prefix}" references member "${route.member}", which has no resolved endpoint (known: ${Object.keys(members).join(", ") || "none"}).`,
      );
    }
    const host = endpoint.host === "0.0.0.0" ? "127.0.0.1" : endpoint.host;
    table.push({
      prefix,
      upstream: `http://${host}:${endpoint.port}${route.path ?? ""}`,
      ws: route.ws ?? false,
      source: `member:${route.member}`,
    });
  }
  return table;
}

export interface ClintCompoundContext {
  memberEndpoints: MemberEndpoints;
  proxyRoutes?: ResolvedProxyRoute[];
  proxyStop?: () => Promise<void>;
  logger?: { info: (m: string) => void };
}

export function createProxyPlugin(config: ProxyPluginConfig): HostPlugin<{
  onMembersReady: (ctx: ClintCompoundContext) => Promise<void>;
  onShutdown: (ctx: ClintCompoundContext) => Promise<void>;
}> {
  return {
    name: "clint-proxy",
    appliesTo: "compound",
    hooks: {
      onMembersReady: async (ctx) => {
        const table = buildProxyRouteTable(config, ctx.memberEndpoints);
        ctx.proxyRoutes = table;
        const { createProxyServer } = await import("../core/proxy.js");
        const instance = await createProxyServer({
          port: config.port,
          host: config.host ?? "0.0.0.0",
          publicUrl: config.publicUrl,
          logger: (ctx.logger ?? console) as never,
        });
        for (const route of table) {
          instance.addRoute({
            prefix: route.prefix,
            upstream: new URL(route.upstream),
            ws: route.ws,
            source: route.source,
          } as never);
        }
        ctx.proxyStop = () => instance.stop();
        ctx.logger?.info(
          `[clint-proxy] listening on ${instance.url} — ${table.length} route(s)`,
        );
      },
      onShutdown: async (ctx) => {
        await ctx.proxyStop?.();
      },
    },
  };
}

export default createProxyPlugin;
