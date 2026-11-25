import type { RunnerContext, RunnerHandle } from "@powerhousedao/host-core";
import { defineHostSchemas } from "@powerhousedao/host-core/schema";
import { z } from "zod";
import { buildProxyRouteTable } from "./proxy-route-table.js";

/**
 * proxy-runner (A7): the same-origin proxy as a member of a generic compound.
 * One front port routes to upstream URLs, WebSocket-aware, over the clint
 * package's createProxyServer. A route to a sibling member names that member
 * host's own output (`upstream: switchboard.origin`, or `{ $output: { host:
 * "switchboard", path: ["origin"] } }`): the compound resolves it from the
 * members started before the proxy, so the proxy starts after them, and
 * stops before them. The routes are fixed at start. The Cli in front reads
 * the proxy's address from its outputs (`proxy.url`), as any member's.
 */

export const kind = "reactor";

/** The verbs this runner exports. `build` is no work: it lets a compound
 * forward one `build` verb to every member. */
export const verbs = ["run", "serve", "dev", "build"] as const;

/**
 * The proxy host, from one definition in two forms: DECLARED (an upstream
 * may be an output token; what host.js authors write) and RESOLVED (what the
 * verbs receive). `runner.port` is the front port (0 = any free port) and
 * `runner.host` the bind address. The default is "127.0.0.1": a container or
 * cloud host sets "0.0.0.0" in its own host data.
 */
const schemas = defineHostSchemas((s) =>
  s.reactorHostSchema.extend({
    runner: s.runnerBaseSchema
      .extend({
        port: z.number().int().min(0).max(65535).optional(),
      })
      .strict(),
    config: z.strictObject({
      /** Browser-facing base URL when the proxy sits behind an ingress. */
      publicUrl: z.url().optional(),
      /** Route prefix -> target: an upstream URL, an optional path and ws. */
      routes: z.record(
        z.string(),
        z.strictObject({
          upstream: s.tokenable(z.url()),
          path: z.string().optional(),
          ws: z.boolean().optional(),
        }),
      ),
    }),
  }),
);
/** Declared form: what a host file may contain before resolution. */
export const declaredHostSchema = schemas.declaredHostSchema;
/** Resolved form: what the verbs receive (and `validateHost` checks). */
export const hostSchema = schemas.hostSchema;

/** What a proxy host.js author writes. */
export type ProxyHostInput = z.input<typeof declaredHostSchema>;
/** What the verbs receive. */
export type ProxyHost = z.output<typeof hostSchema>;

/** What starting the proxy produces: its address (the `publicUrl` when set). */
export const outputsSchema = z.strictObject({
  url: z.url(),
});

export type ProxyOutputs = z.infer<typeof outputsSchema>;

declare global {
  interface PHHostRunners {
    "@powerhousedao/clint/proxy-runner": {
      host: ProxyHostInput;
      outputs: ProxyOutputs;
    };
  }
}

export type ProxyHandle = RunnerHandle<ProxyOutputs>;

export async function run(
  host: ProxyHost,
  _ctx: RunnerContext,
): Promise<ProxyHandle> {
  const table = buildProxyRouteTable(host.config.routes);
  const { createProxyServer } = await import("../core/proxy.js");
  const instance = await createProxyServer({
    port: host.runner.port ?? 0,
    host: host.runner.host ?? "127.0.0.1",
    publicUrl: host.config.publicUrl,
    logger: console as never,
  });
  for (const route of table) {
    instance.addRoute({
      prefix: route.prefix,
      upstream: new URL(route.upstream),
      ws: route.ws,
      source: route.source,
    });
  }
  console.log(
    `[${host.name}] proxy listening on ${instance.url} — ${table.length} route(s)`,
  );
  let stopping: Promise<void> | undefined;
  return {
    outputs: outputsSchema.parse({ url: instance.url }),
    ready: Promise.resolve(),
    shutdown: () => (stopping ??= instance.stop()),
  };
}

export const serve = run;
export const dev = run;

/** Nothing to build. */
export async function build(): Promise<void> {}
