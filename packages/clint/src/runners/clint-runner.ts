import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  defaultUserDataDir,
  loadHost,
  probeRun,
  refineStartOrder,
  resolveUserDataPlaceholders,
  runObserveHook,
  runObserveHookSequential,
  resolveHostPlugins,
  type RunnerContext,
  type RunnerHandle,
} from "@powerhousedao/host-core";
import {
  findToken,
  makeHostSchemas,
  ref,
  type HostSchemas,
} from "@powerhousedao/host-core/schema";
import { z } from "zod";
import {
  createProxyPlugin,
  declaredProxyPluginConfigSchema,
  proxyPluginConfigSchema,
  type ClintCompoundContext,
} from "./proxy-plugin.js";
import { quotedHost, removedKeyError } from "./removed-forms.js";
import fs from "node:fs";
import { createEventBus } from "../core/events.js";
import { isPortFree } from "../core/preflight.js";
import { createServiceManager, defineService } from "../core/services.js";
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
 * endpoints — each `url` a literal or an output token (an agent host's
 * `endpoints.openai`), resolved before the runner sees it. `dev` adds a line chat
 * loop against the first agent; the full ink REPL remains the library path
 * (defineCli) for implementation projects, as scaffolded clint CLIs use it
 * natively — noted in the phase-5 WBS.
 */

export const kind = "compound";

/** The token form that replaced an agent's sibling `host` reference. */
function agentHostHint(input: Record<string, unknown>): string {
  const host = quotedHost(input.host, '"<agent host>"');
  return `use url: <host>.endpoints.openai from ../<host>/outputs.js, or { url: { $output: { host: ${host}, path: ["endpoints", "openai"] } } }.`;
}

/** An agent the shell can chat with: the OpenAI-compatible base URL of an
 * agent API (an agent host's `endpoints.openai` output, or external). */
function agentRefSchema<U extends z.ZodType>(url: U) {
  return z.strictObject(
    { url },
    { error: removedKeyError("host", agentHostHint) },
  );
}

/**
 * The clint compound host, built once per form from one definition:
 * DECLARED (`tokens: "allow"`; what host.js authors write) and RESOLVED
 * (`tokens: "forbid"`; what `validateHost` checks before the verb).
 * Host-core's base blocks come from `makeHostSchemas` in the same form.
 *
 * `config.agents.*.url` and `runner.proxy.routes.*.upstream` are DEFERRED
 * self fields: they typically name outputs of this compound's own members,
 * which exist only once clint has started them inside the verb. They take
 * tokens in BOTH forms, and the runner resolves them after its members are
 * up (`resolveOwnFields`), then parses them with `ownFieldsSchema`.
 */
function buildHostSchema(base: HostSchemas) {
  /** clint-runner's own `runner` options, on top of the common base. */
  const clintRunnerOptionsSchema = base.runnerBaseSchema
    .extend({
      /** "detached" (default): children outlive the shell and are
       * re-attached on the next run. "attached": the shell tears them down
       * on exit. */
      lifecycle: z.enum(["attached", "detached"]).optional(),
      /** One front port routing to upstreams (the clint proxy plugin). */
      proxy: declaredProxyPluginConfigSchema.optional(),
    })
    .strict();

  /** A member's scheduling knobs. Members run as their own `ph-cli run
   * <host>` process, so the wrapper's `config` is read by clint (not passed
   * to the member) and holds only these. */
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

  const cliHostConfigSchema = z.strictObject({
    agents: z.record(z.string(), agentRefSchema(ref(z.url()))).optional(),
    /** Member start order; must name declared children. Unnamed members
     * start after the named ones, in declaration order. */
    startOrder: z.array(z.string().min(1)).optional(),
  });

  // Extend the unrefined base, refine last (zod refuses to extend a refined
  // object).
  return base.compoundHostSchema
    .extend({
      runner: clintRunnerOptionsSchema,
      children: z.record(
        z.string(),
        base.childWrapperSchema.extend({
          config: clintMemberConfigSchema.optional(),
        }),
      ),
      config: cliHostConfigSchema.optional(),
    })
    .superRefine(refineStartOrder);
}

/** Resolved form: what `validateHost` checks and the verbs receive (the
 * deferred self fields may still carry tokens; see buildHostSchema). */
export const hostSchema = buildHostSchema(
  makeHostSchemas({ tokens: "forbid" }),
);

/** Declared form: what a host file may contain before resolution. */
export const declaredHostSchema = buildHostSchema(
  makeHostSchemas({ tokens: "allow" }),
);

/** The deferred self fields once resolved (after member start). */
const ownFieldsSchema = z.strictObject({
  agents: z.record(z.string(), agentRefSchema(z.url())).optional(),
  proxy: proxyPluginConfigSchema.optional(),
});

/** What a clint host.js author writes. */
export type ClintHostInput = z.input<typeof declaredHostSchema>;
/** What the verbs receive. */
export type ClintHost = z.output<typeof hostSchema>;
type OwnFields = z.output<typeof ownFieldsSchema>;

/** The verbs this runner exports (the rest of its exports are not verbs). */
export const verbs = ["run", "serve", "dev", "build"] as const;

/** Live outputs of the compound's members, keyed by child name
 * (`outputs` undefined when the member published no live run record). */
export type LiveMemberOutputs = Record<
  string,
  { host: string; outputs: unknown }
>;

/**
 * Resolve the deferred self fields against the members' live outputs.
 *
 * TODO(typed-host-configs T3-A): delegate to host-core's deferred
 * self-resolution — expected as `resolveHostOutputs(host, sources,
 * { deferSelf: true })` with a source over `members` — once it merges. The
 * integrator wires it; until then a field that still carries a token after
 * the pre-verb resolve fails here, naming its path. Literal values (and
 * tokens the pre-verb resolve already substituted) pass through.
 */
function resolveOwnFields(
  fields: { agents?: unknown; proxy?: unknown },
  members: LiveMemberOutputs,
  file: string,
): unknown {
  const token = findToken(fields);
  if (token) {
    throw new Error(
      `${file}: \`${token.path}\` is an output token (${token.key}) that clint resolves after starting its members (${Object.keys(members).join(", ") || "none"}); deferred self-resolution is not wired to host-core yet. Spell the value literally for now.`,
    );
  }
  return fields;
}

/** Started members' outputs, read from their own run records (members run
 * as separate `ph-cli run` processes, which publish their outputs there). */
function liveMemberOutputs(
  projectRoot: string,
  projectName: string,
  memberHosts: Record<string, string>,
): LiveMemberOutputs {
  const members: LiveMemberOutputs = {};
  for (const [id, hostName] of Object.entries(memberHosts)) {
    const probe = probeRun(projectRoot, hostName, projectName);
    members[id] = {
      host: hostName,
      outputs: probe.status === "live" ? probe.record.outputs : undefined,
    };
  }
  return members;
}

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

async function stopAll(
  services: ServiceManager,
  names: string[],
): Promise<void> {
  for (const id of names) {
    try {
      await services.stop(id);
    } catch {
      // already stopped
    }
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
  const memberHosts: Record<string, string> = {};
  for (const id of ordered) {
    // Re-attach checks, strongest first. (1) The member's OWN run record —
    // written with the member process's real pid (mastra-runner, the generic
    // compound). (2) Port occupancy for record-less bridge members. (3) The
    // service state file — weakest on Windows, where it records the cmd shim
    // pid, which dies on console teardown while the node grandchild survives.
    const wrapper = children[id];
    const member = await loadHost(ctx.projectRoot, wrapper.host);
    memberHosts[id] = member.host.name;
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

  // The deferred self fields (agent urls, proxy upstreams) name the
  // members' outputs, which exist now.
  let own: OwnFields;
  try {
    const parsedOwn = ownFieldsSchema.safeParse(
      resolveOwnFields(
        { agents: config.agents, proxy: resolved.runner.proxy },
        liveMemberOutputs(ctx.projectRoot, projectName, memberHosts),
        `hosts/${host.name}/host.js`,
      ),
    );
    if (!parsedOwn.success) {
      throw new Error(
        `hosts/${host.name}: agents/proxy resolved to invalid values:\n${z.prettifyError(parsedOwn.error)}`,
      );
    }
    own = parsedOwn.data;
  } catch (error) {
    if (lifecycle === "attached") await stopAll(services, names);
    throw error;
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
  const proxyBlock = own.proxy;
  if (proxyBlock) {
    resolvedPlugins.push(createProxyPlugin(proxyBlock));
  }
  const compoundCtx: ClintCompoundContext = {
    logger: { info: (m: string) => console.log(m) },
  };
  if (resolvedPlugins.length > 0) {
    await runObserveHook("onMembersReady", resolvedPlugins, compoundCtx);
  }

  const agents: Record<string, string> = {};
  for (const [name, agent] of Object.entries(own.agents ?? {})) {
    agents[name] = agent.url.replace(/\/$/, "");
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
      await stopAll(services, names);
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
