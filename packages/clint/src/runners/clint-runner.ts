import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  childWrapperSchema,
  compoundHostSchema,
  defaultUserDataDir,
  loadHost,
  probeRun,
  refineStartOrder,
  resolveUserDataPlaceholders,
  runObserveHook,
  runObserveHookSequential,
  resolveHostPlugins,
  runnerBaseSchema,
  type RunnerContext,
  type RunnerHandle,
} from "@powerhousedao/host-core";
import { z } from "zod";
import {
  createProxyPlugin,
  proxyPluginConfigSchema,
  type ClintCompoundContext,
  type MemberEndpoints,
} from "./proxy-plugin.js";
import fs from "node:fs";
import { createEventBus } from "../core/events.js";
import { isPortFree } from "../core/preflight.js";
import {
  createServiceManager,
  defineService,
  resolveServiceName,
} from "../core/services.js";
import { formatStatus } from "../core/service-command.js";
import type { ServiceDefinition, ServiceManager } from "../core/types.js";

/**
 * clint-runner (P5.4): the clint framework shell as a compound-kind runner.
 * Children declared in hosts/cli/host.js are SCHEDULED as clint services —
 * each member runs as `ph-cli run <member>` in its own (hidden) process with
 * state files, logs, readiness patterns and restart policies from the ported
 * services manager; `lifecycle: "detached"` (the default, clint's own
 * posture) leaves children running when the shell exits and re-attaches on
 * the next run, `"attached"` tears them down vetra-style.
 *
 * The agents manager (config.agents) maps names to OpenAI-compatible
 * endpoints — a sibling host reference resolves through that host's
 * runner.port (the mastra-runner serves /v1 there). `dev` adds a line chat
 * loop against the first agent; the full ink REPL remains the library path
 * (defineCli) for implementation projects, as scaffolded clint CLIs use it
 * natively — noted in the phase-5 WBS.
 */

export const kind = "compound";

/** clint-runner's own `runner` options, on top of the common base. */
const clintRunnerOptionsSchema = runnerBaseSchema
  .extend({
    /** "detached" (default): children outlive the shell and are re-attached
     * on the next run. "attached": the shell tears them down on exit. */
    lifecycle: z.enum(["attached", "detached"]).optional(),
    /** One front port routing to the members (the clint proxy plugin). */
    proxy: proxyPluginConfigSchema.optional(),
  })
  .strict();

/** A member's scheduling knobs. Members run as their own `ph-cli run
 * <host>` process, so the wrapper's `config` is read by clint (not passed to
 * the member) and holds only these. */
const clintMemberConfigSchema = z.strictObject({
  /** When the member counts as up: a stdout pattern (regex source, case
   * insensitive) and a timeout in ms. */
  readiness: z
    .strictObject({
      pattern: z.string().min(1).optional(),
      timeout: z.number().int().positive().optional(),
    })
    .optional(),
});

/** An agent the shell can chat with: a sibling host serving the mastra
 * agent API (resolved through its runner.port) or an explicit URL. */
const agentRefSchema = z
  .strictObject({
    host: z.string().min(1).optional(),
    url: z.url().optional(),
  })
  .refine((agent) => agent.host !== undefined || agent.url !== undefined, {
    message: "an agents entry needs { host } or { url }",
  });

const cliHostConfigSchema = z.strictObject({
  agents: z.record(z.string(), agentRefSchema).optional(),
  /** Member start order; must name declared children. Unnamed members start
   * after the named ones, in declaration order. */
  startOrder: z.array(z.string().min(1)).optional(),
});

/** The clint compound host. Extend the unrefined base, refine last (zod
 * refuses to extend a refined object). */
export const hostSchema = compoundHostSchema
  .extend({
    runner: clintRunnerOptionsSchema,
    children: z.record(
      z.string(),
      childWrapperSchema.extend({ config: clintMemberConfigSchema.optional() }),
    ),
    config: cliHostConfigSchema.optional(),
  })
  .superRefine(refineStartOrder);

/** What a clint host.js author writes. */
export type ClintHostInput = z.input<typeof hostSchema>;
/** What the verbs receive. */
export type ClintHost = z.output<typeof hostSchema>;
type AgentRef = z.output<typeof agentRefSchema>;

/** What starting the shell produces: the resolved agent endpoints and, when
 * `runner.proxy` is set, the proxy's URL. Member outputs belong to the
 * members. */
export const outputsSchema = z.strictObject({
  agents: z.record(z.string(), z.url()),
  proxy: z.strictObject({ url: z.url() }).optional(),
});

export type ClintOutputs = z.infer<typeof outputsSchema>;

declare global {
  interface PHHostRunners {
    "@powerhousedao/clint/clint-runner": {
      host: ClintHostInput;
      outputs: ClintOutputs;
    };
  }
}

// A URL in stdout is the universal "I am serving" signal across member kinds
// (switchboard prints "MCP server available at http://…", preview "Local:",
// the agent "agent API … http://…").
const DEFAULT_READINESS = "https?://|listening|ready";

/** Resolve the project's ph-cli entry the same way host-core resolves runner
 * modules: from the PROJECT's dependency tree. */
function resolvePhCliEntry(projectRoot: string): string {
  const require_ = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  const pkgPath = require_.resolve("@powerhousedao/ph-cli/package.json");
  return path.join(path.dirname(pkgPath), "dist", "cli.mjs");
}

function childServices(
  host: ClintHost,
  ctx: RunnerContext,
  phCliEntry: string,
): ServiceDefinition<Record<string, unknown>>[] {
  return Object.entries(host.children).map(([name, wrapper]) =>
    defineService({
      id: name,
      name,
      command: () => `node "${phCliEntry}" run ${wrapper.host}`,
      env: () => ({
        FEATURE_UNIFORM_RUNNERS_ENABLED: "1",
        PH_USER_DATA_DIR: defaultUserDataDir(ctx.projectRoot, ctx.env),
      }),
      readiness: {
        patterns: [
          {
            name: "up",
            pattern: new RegExp(
              wrapper.config?.readiness?.pattern ?? DEFAULT_READINESS,
              "i",
            ),
          },
        ],
        timeout: wrapper.config?.readiness?.timeout ?? 180_000,
      },
    }),
  );
}

async function resolveAgentEndpoint(
  ref: AgentRef,
  ctx: RunnerContext,
): Promise<string> {
  if (ref.url) return ref.url.replace(/\/$/, "");
  if (ref.host) {
    const sibling = await loadHost(ctx.projectRoot, ref.host);
    const port = sibling.host.runner.port ?? 4910;
    return `http://127.0.0.1:${String(port)}/v1`;
  }
  // The schema requires one of them; a verb called with an unparsed host
  // still fails loudly.
  throw new Error("agents entries need { host } or { url }");
}

function readProjectName(projectRoot: string, fallback: string): string {
  try {
    return (
      (
        JSON.parse(
          fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
        ) as { name?: string }
      ).name ?? fallback
    );
  } catch {
    return fallback;
  }
}

/** The shell's handle: the runner contract plus the services manager. */
export interface CliRunHandle extends RunnerHandle<ClintOutputs> {
  services: ServiceManager;
}

async function startShell(
  host: ClintHost,
  ctx: RunnerContext,
): Promise<CliRunHandle> {
  const userData = defaultUserDataDir(ctx.projectRoot, ctx.env);
  const resolved = resolveUserDataPlaceholders(host, userData);
  const config = resolved.config ?? {};
  const lifecycle = resolved.runner.lifecycle ?? "detached";

  const phCliEntry = resolvePhCliEntry(ctx.projectRoot);
  const children = resolved.children;
  const projectName = readProjectName(ctx.projectRoot, resolved.name);
  const definitions = childServices(resolved, ctx, phCliEntry);
  const eventBus = createEventBus();
  // R5: compound plugins (appliesTo "compound" — e.g. the proxy) run over the
  // member set. Built-ins resolve from a declared `runner.plugins`; the proxy
  // is registered when a `runner.proxy` block is present (ergonomic alias).
  const memberEndpoints: MemberEndpoints = {};
  const servicesDir = path.join(ctx.projectRoot, ".ph", "services");
  const services = createServiceManager(definitions, {
    config: {},
    servicesDir,
    eventBus,
  });

  // Start order: config.startOrder first, then declaration order.
  const names = definitions.map((d) => d.id);
  const ordered = [
    ...(config.startOrder ?? []).filter((n) => names.includes(n)),
    ...names.filter((n) => !(config.startOrder ?? []).includes(n)),
  ];
  for (const id of ordered) {
    // Re-attach checks, strongest first. (1) The member's OWN run record —
    // written with the member process's real pid (mastra-runner, the generic
    // compound). (2) Port occupancy for record-less bridge members. (3) The
    // service state file — weakest on Windows, where it records the cmd shim
    // pid, which dies on console teardown while the node grandchild survives.
    const wrapper = children[id];
    const member = await loadHost(ctx.projectRoot, wrapper.host);
    const record = probeRun(ctx.projectRoot, member.host.name, projectName);
    if (record.status === "live") {
      console.log(
        `[${resolved.name}] ${id}: already running (pid ${record.record.pid}) — re-attached`,
      );
      continue;
    }
    const memberPort =
      typeof wrapper.runner?.port === "number"
        ? wrapper.runner.port
        : typeof member.host.runner.port === "number"
          ? member.host.runner.port
          : undefined;
    if (memberPort !== undefined) {
      const memberHost =
        (typeof wrapper.runner?.host === "string" && wrapper.runner.host) ||
        (typeof member.host.runner.host === "string" &&
          member.host.runner.host) ||
        "127.0.0.1";
      memberEndpoints[id] = { host: memberHost, port: memberPort };
    }
    if (memberPort !== undefined && !(await isPortFree(memberPort))) {
      console.log(
        `[${resolved.name}] ${id}: port ${memberPort} already serving — re-attached`,
      );
      continue;
    }
    const already = services
      .list(id)
      .some((s) => s.status === "ready" || s.status === "starting");
    if (already) {
      console.log(`[${resolved.name}] ${id}: already running — re-attached`);
      continue;
    }
    console.log(`[${resolved.name}] starting ${id}…`);
    await services.start(id, {
      workdir: ctx.projectRoot,
      cwd: ctx.projectRoot,
    });
    const status = services.list(id).find((s) => s.serviceId === id);
    if (status) console.log(`  ${formatStatus(status)}`);
  }

  // Compound-plugin pipeline (CompoundCore): resolve entries + the proxy
  // ergonomic alias, then fire onMembersReady now that endpoints are known.
  const pluginEntries = resolved.runner.plugins;
  const resolvedPlugins = pluginEntries
    ? (
        await resolveHostPlugins(
          ctx.projectRoot,
          "compound",
          ctx.verb,
          pluginEntries,
          `hosts/${host.name}/host.js`,
        )
      ).map((r) => r.plugin)
    : [];
  const proxyBlock = resolved.runner.proxy;
  if (proxyBlock) {
    resolvedPlugins.push(createProxyPlugin(proxyBlock));
  }
  const compoundCtx: ClintCompoundContext = {
    memberEndpoints,
    logger: { info: (m: string) => console.log(m) },
  };
  if (resolvedPlugins.length > 0) {
    await runObserveHook("onMembersReady", resolvedPlugins, compoundCtx);
  }

  const agents: Record<string, string> = {};
  for (const [name, ref] of Object.entries(config.agents ?? {})) {
    agents[name] = await resolveAgentEndpoint(ref, ctx);
  }
  if (Object.keys(agents).length > 0) {
    console.log(
      `[${resolved.name}] agents: ${Object.entries(agents)
        .map(([n, u]) => `${n} → ${u}`)
        .join(", ")}`,
    );
  }

  const shutdown = async () => {
    if (resolvedPlugins.length > 0) {
      await runObserveHookSequential(
        "onShutdown",
        resolvedPlugins,
        compoundCtx,
      );
    }
    if (lifecycle === "attached") {
      for (const id of names) {
        try {
          await services.stop(id);
        } catch {
          // already stopped
        }
      }
    } else {
      console.log(
        `[${resolved.name}] detached lifecycle: children keep running ` +
          `(stop them with the ${resolved.name} service commands or taskkill).`,
      );
    }
  };

  // Validated before the stack is handed out: an invalid output (e.g. a proxy
  // bound to a bare IPv6 host, which does not form a URL) tears down what
  // was started instead of leaving it half-up.
  const parsedOutputs = outputsSchema.safeParse({
    agents,
    ...(compoundCtx.proxyUrl ? { proxy: { url: compoundCtx.proxyUrl } } : {}),
  });
  if (!parsedOutputs.success) {
    await shutdown();
    throw new Error(
      `hosts/${host.name}: the shell produced invalid outputs:\n${z.prettifyError(parsedOutputs.error)}`,
    );
  }
  const outputs = parsedOutputs.data;

  if (lifecycle === "attached") {
    const onSignal = () => {
      void shutdown().finally(() => process.exit(130));
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  }

  // Members were started (and awaited to readiness) above.
  return { outputs, ready: Promise.resolve(), services, shutdown };
}

/** Minimal line chat against an agent's OpenAI-compatible endpoint. */
async function chatLoop(agents: Record<string, string>): Promise<void> {
  const [agentName, endpoint] = Object.entries(agents)[0] ?? [];
  if (!agentName || !endpoint) {
    console.log("No agents configured (config.agents) — chat unavailable.");
    return;
  }
  console.log(`Chatting with ${agentName} (${endpoint}). /exit to quit.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) =>
    new Promise<string>((resolve) => rl.question(q, resolve));
  for (;;) {
    const line = (await ask("> ")).trim();
    if (line === "/exit" || line === "exit") break;
    if (!line) continue;
    try {
      const res = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: line }],
        }),
      });
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      console.log(
        body.choices?.[0]?.message?.content ??
          `[error] ${body.error?.message ?? res.status}`,
      );
    } catch (error) {
      console.log(`[transport error] ${String(error)}`);
    }
  }
  rl.close();
}

export async function run(
  host: ClintHost,
  ctx: RunnerContext,
): Promise<CliRunHandle> {
  const handle = await startShell(host, ctx);
  console.log(
    `[${host.name}] services up. ` +
      `(ph run ${host.name} dev for the chat shell; Ctrl+C ${
        host.runner.lifecycle === "attached"
          ? "stops the children"
          : "leaves children running"
      }.)`,
  );
  return handle;
}

export const serve = run;

/** dev = services up + the line chat shell (blocks until /exit). */
export async function dev(host: ClintHost, ctx: RunnerContext): Promise<void> {
  const handle = await startShell(host, ctx);
  await chatLoop(handle.outputs.agents);
  await handle.shutdown();
}

/** build = forward build to each member host that exports it (fail loud on
 * members that do not — a silent skip would report success on an unbuilt
 * set), same posture as the generic compound. */
export async function build(
  host: ClintHost,
  ctx: RunnerContext,
): Promise<void> {
  const { getVerb, resolveRunnerModule, validateHost } =
    await import("@powerhousedao/host-core");
  for (const [name, wrapper] of Object.entries(host.children)) {
    const member = await loadHost(ctx.projectRoot, wrapper.host);
    const specifier = member.host.runner.module;
    const runner = await resolveRunnerModule(ctx.projectRoot, specifier);
    const validated = validateHost(
      runner,
      specifier,
      member.host,
      `hosts/${wrapper.host}/host.js`,
    );
    const fn = getVerb(runner, specifier, "build");
    console.log(`[${host.name}] build → ${name} (${wrapper.host})`);
    await fn(validated, {
      ...ctx,
      verb: "build",
      parent: { host: host.name, verb: ctx.verb },
    });
  }
}
