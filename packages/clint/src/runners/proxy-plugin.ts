import type { HostPlugin } from "@powerhousedao/host-core";
import { ref } from "@powerhousedao/host-core/schema";
import { z } from "zod";
import { removedKeyError } from "./removed-forms.js";

/**
 * R5 — the clint proxy as a COMPOUND plugin (rewire plan: appliesTo
 * "compound", the member-set branch of the hierarchy). One front port routes
 * to upstream URLs, WebSocket-aware. A route to a member names that member
 * host's own output (e.g. `{ $output: { host: "assistant", path: ["origin"] } }`),
 * resolved before the runner sees the config — the proxy never derives an
 * address from a declared port. Declarative veneer over the clint package's
 * createProxyServer; the route table assembly is pure
 * (buildProxyRouteTable) and unit-tested without sockets.
 */

/** The token form that replaced a route's `member` reference. */
function memberHint(input: Record<string, unknown>): string {
  const member =
    typeof input.member === "string" && input.member.length > 0
      ? `, member: ${JSON.stringify(input.member)}`
      : "";
  return `point \`upstream\` at the member host's output: upstream: <host>.origin from ../<host>/outputs.js, or { $output: { host: "<member's host>"${member}, path: ["origin"] } }.`;
}

/** The proxy config, built once per form: `url` is the upstream field —
 * `ref(z.url())` when declared, `z.url()` when resolved. */
function buildProxyPluginConfigSchema<U extends z.ZodType>(url: U) {
  /** One route: an upstream URL (literal or output token) plus optional
   * path + ws. */
  const proxyRouteSchema = z.strictObject(
    {
      upstream: url,
      path: z.string().optional(),
      ws: z.boolean().optional(),
    },
    { error: removedKeyError("member", memberHint) },
  );
  return z.strictObject({
    /** Front port (0 = any free port). */
    port: z.number().int().min(0),
    /** Bind address (default "0.0.0.0"). */
    host: z.string().min(1).optional(),
    publicUrl: z.url().optional(),
    /** Route prefix -> target. */
    routes: z.record(z.string(), proxyRouteSchema),
  });
}

/** `runner.proxy` on a clint-runner host, resolved (what the runner reads). */
export const proxyPluginConfigSchema = buildProxyPluginConfigSchema(z.url());

/** `runner.proxy` as declared: upstreams may be output tokens. */
export const declaredProxyPluginConfigSchema = buildProxyPluginConfigSchema(
  ref(z.url()),
);

export type ProxyPluginConfig = z.output<typeof proxyPluginConfigSchema>;
export type ProxyPluginConfigInput = z.input<
  typeof declaredProxyPluginConfigSchema
>;

export interface ResolvedProxyRoute {
  prefix: string;
  upstream: string;
  ws: boolean;
  source: string;
}

/** Pure route-table assembly: each upstream (+ optional path). */
export function buildProxyRouteTable(
  config: ProxyPluginConfig,
): ResolvedProxyRoute[] {
  return Object.entries(config.routes).map(([prefix, route]) => ({
    prefix,
    upstream: `${route.upstream.replace(/\/+$/, "")}${route.path ?? ""}`,
    ws: route.ws ?? false,
    source: `upstream:${route.upstream}`,
  }));
}

export interface ClintCompoundContext {
  proxyRoutes?: ResolvedProxyRoute[];
  /** The proxy's listening URL, set at onMembersReady. */
  proxyUrl?: string;
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
        const table = buildProxyRouteTable(config);
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
          });
        }
        ctx.proxyUrl = instance.url;
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
