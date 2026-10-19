import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  compoundHostSchema,
  defaultUserDataDir,
  loadHost,
  probeRun,
  resolveUserDataPlaceholders,
  runObserveHook,
  runObserveHookSequential,
  resolveHostPlugins,
  type HostDefinition,
  type RunnerContext,
} from "@powerhousedao/host-core";
import {
  createProxyPlugin,
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

export const hostSchema = compoundHostSchema;

interface ChildWrapper {
  host: string;
  runner?: { port?: number } & Record<string, unknown>;
  config?: { readiness?: { pattern?: string; timeout?: number } } & Record<
    string,
    unknown
  >;
}

interface AgentRef {
  host?: string;
  url?: string;
}

interface CliHostConfig {
  agents?: Record<string, AgentRef>;
  startOrder?: string[];
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
  host: HostDefinition,
  ctx: RunnerContext,
  phCliEntry: string,
): ServiceDefinition<Record<string, unknown>>[] {
  const children = (host.children ?? {}) as Record<string, ChildWrapper>;
  return Object.entries(children).map(([name, wrapper]) =>
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

export interface CliRunHandle {
  services: ServiceManager;
  agents: Record<string, string>;
  shutdown: () => Promise<void>;
}

async function startShell(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<CliRunHandle> {
  const userData = defaultUserDataDir(ctx.projectRoot, ctx.env);
  const resolved = resolveUserDataPlaceholders(host, userData);
  const config = (resolved.config ?? {}) as CliHostConfig;
  const lifecycle =
    (resolved.runner.lifecycle as string | undefined) ?? "detached";

  const phCliEntry = resolvePhCliEntry(ctx.projectRoot);
  const children = (resolved.children ?? {}) as Record<string, ChildWrapper>;
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
  const pluginEntries = (resolved.runner as { plugins?: unknown }).plugins as
    | Parameters<typeof resolveHostPlugins>[3]
    | undefined;
  const resolvedPlugins = pluginEntries
    ? (
        await resolveHostPlugins(
          ctx.projectRoot,
          "compound",
          ctx.verb ?? "run",
          pluginEntries,
          `hosts/${host.name}/host.js`,
        )
      ).map((r) => r.plugin)
    : [];
  const proxyBlock = (resolved.runner as { proxy?: unknown }).proxy;
  if (proxyBlock && typeof proxyBlock === "object") {
    resolvedPlugins.push(createProxyPlugin(proxyBlock as never) as never);
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

  if (lifecycle === "attached") {
    const onSignal = () => {
      void shutdown().finally(() => process.exit(130));
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  }

  return { services, agents, shutdown };
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
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<CliRunHandle> {
  const handle = await startShell(host, ctx);
  console.log(
    `[${host.name}] services up. ` +
      `(ph run ${host.name} dev for the chat shell; Ctrl+C ${
        (host.runner.lifecycle as string | undefined) === "attached"
          ? "stops the children"
          : "leaves children running"
      }.)`,
  );
  return handle;
}

export const serve = run;

/** dev = services up + the line chat shell (blocks until /exit). */
export async function dev(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<void> {
  const handle = await startShell(host, ctx);
  await chatLoop(handle.agents);
  await handle.shutdown();
}

/** build = forward build to each member host that exports it (fail loud on
 * members that do not — a silent skip would report success on an unbuilt
 * set), same posture as the generic compound. */
export async function build(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<void> {
  const { getVerb, resolveRunnerModule, validateHost } =
    await import("@powerhousedao/host-core");
  const children = (host.children ?? {}) as Record<string, ChildWrapper>;
  for (const [name, wrapper] of Object.entries(children)) {
    const member = await loadHost(ctx.projectRoot, wrapper.host);
    const specifier = member.host.runner.module;
    const runner = await resolveRunnerModule(ctx.projectRoot, specifier);
    validateHost(
      runner,
      specifier,
      member.host,
      `hosts/${wrapper.host}/host.js`,
    );
    const fn = getVerb(runner, specifier, "build");
    console.log(`[${host.name}] build → ${name} (${wrapper.host})`);
    await fn(member.host, { ...ctx, verb: "build" });
  }
}
