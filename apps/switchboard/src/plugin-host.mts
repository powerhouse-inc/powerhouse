import { attachmentsPlugin } from "./plugins/attachments.mjs";
import { privacyPlugin } from "./plugins/privacy.mjs";
import { workflowsPlugin } from "./plugins/workflows.mjs";
import { mcpPlugin } from "./plugins/mcp.mjs";
import {
  mergeContributions,
  resolveOrder,
  runObserveHook,
  runObserveHookSequential,
  runTransformHook,
  type HostPlugin,
  type MergedContribution,
  type ResolvedPlugin,
} from "@powerhousedao/host-core";
import type { SwitchboardConfig } from "./config/schema.js";

/**
 * R2 — SwitchboardCore's plugin pipeline (rewire plan, carve map:
 * uniform-runners-plan/rewire/r2-carve-map.md). Every switchboard boots
 * through it: the carved subsystems (mcp, attachments, privacy, workflows) run
 * as built-in plugins through these hook moments. A declared composition
 * (`features.pluginHost: true`, FEATURE_PLUGIN_HOST_ENABLED=1) runs the
 * plugins it lists; without one the default composition runs
 * (defaultSwitchboardPlugins). Only an explicit `features.pluginHost: false`
 * (FEATURE_PLUGIN_HOST_ENABLED=false) still takes startSwitchboard's inline
 * path, which is deprecated.
 *
 * Hook vocabulary (SwitchboardHooks), anchored to the boot spine:
 * - transformServerOptions   — after option/flag resolution, before anything opens
 * - onReadModelsRegistering  — inside reactor construction (build-time read models)
 * - onHttpMounting           — api exists; routes mount here
 * - onSubgraphsRegistering   — push into lateSubgraphs before the drain
 * - onReactorReady           — client + graphqlManager destructured
 * - onDrivesReady            — after core drive seeding / remote attachment
 * - onShutdown               — first in the subsystem-ordered teardown
 */

export {
  isPluginHostEnabled,
  PLUGIN_HOST_FLAG,
  pluginHostFromEnv,
} from "./plugin-host-flag.mjs";

/**
 * The context plugins receive. Fields are populated as the boot spine reaches
 * them (api/client/graphqlManager are undefined before stage 17); concrete
 * types stay in server.mts — subsystem carves tighten their own slices.
 */
export interface SwitchboardHostContext {
  /** The switchboard's ILogger; typed loosely here to avoid pinning the
   * logger package in the scaffold — subsystem carves use it as-is. */
  logger: unknown;
  options: Record<string, unknown>;
  /** The parsed config the switchboard booted with. */
  config?: SwitchboardConfig;
  renown: unknown;
  serverPort?: number;
  /** Set by the attachments plugin at onHttpMounting; the boot reads it for
   * the returned handle. */
  attachmentService?: unknown;
  /** Privacy plugin state: config resolved at transformServerOptions
   * (fail-fast), the running subsystem set at onSubgraphsRegistering. */
  privacyConfig?: unknown;
  privacy?: unknown;
  /** Workflows plugin: wiring closures handed in by server.mts, runtime +
   * retry handles stored by the plugin. */
  workflowsOrchestration?: unknown;
  workflows?: unknown;
  workflowsRetry?: unknown;
  api?: unknown;
  /** @deprecated The facade; plugins that have moved take `read` and `write`. */
  client?: unknown;
  /** The reactor's read half (IReactorReadClient), set at onReactorReady. */
  read?: unknown;
  /** The reactor's write half (IReactorWriteClient), set at onReactorReady. */
  write?: unknown;
  graphqlManager?: unknown;
  reactorClientModule?: unknown;
  /** Late subgraph registrations drain before the readiness router update. */
  lateSubgraphs?: Promise<unknown>[];
  contributions: Record<string, MergedContribution[]>;
}

export interface SwitchboardPluginHost {
  readonly plugins: readonly HostPlugin[];
  readonly ctx: SwitchboardHostContext;
  transformOptions<T>(seed: T): Promise<T>;
  observe(
    hook:
      | "onReadModelsRegistering"
      | "onHttpMounting"
      | "onSubgraphsRegistering"
      | "onReactorReady"
      | "onDrivesReady"
      | "onShutdown",
  ): Promise<void>;
}

/** Built-in plugins, pre-listed: what a declared composition that names no
 * plugins of its own boots with. Subsystems join as R2 carves them. */
export function builtinSwitchboardPlugins(): ResolvedPlugin[] {
  const entry = { enabled: true, verbs: "*" as const, config: {} };
  return [
    {
      plugin: mcpPlugin as HostPlugin,
      provenance: "built-in",
      entry: { ...entry, module: "@powerhousedao/switchboard/plugins/mcp" },
    },
    {
      plugin: attachmentsPlugin as HostPlugin,
      provenance: "built-in",
      entry: {
        ...entry,
        module: "@powerhousedao/switchboard/plugins/attachments",
      },
    },
    {
      plugin: privacyPlugin as HostPlugin,
      provenance: "built-in",
      entry: {
        ...entry,
        module: "@powerhousedao/switchboard/plugins/privacy",
      },
    },
    // Registered after privacy ON PURPOSE: onShutdown runs sequentially in
    // registration order, preserving the inline teardown (privacy stops
    // before workflows, both before api.dispose — carve map).
    {
      plugin: workflowsPlugin as HostPlugin,
      provenance: "built-in",
      entry: {
        ...entry,
        module: "@powerhousedao/switchboard/plugins/workflows",
      },
    },
  ];
}

/** The classic resolution of the two switches a composition can leave out
 * (startSwitchboard: the env, the caller, then powerhouse.config.json). */
export interface DefaultSwitchboardSwitches {
  /** MCP mounts: on unless MCP_ENABLED or the caller says false. */
  mcp: boolean;
  /** Workflows run: PH_WORKFLOWS_ENABLED, the caller or the config file. */
  workflows: boolean;
}

/** The default composition: what a switchboard without a declared composition
 * ran before the plugin host became the only path. Attachments always and
 * privacy by its own config, as inline; mcp and workflows only when their
 * classic switch is on, so the same subsystems run as before. Built-in order
 * kept (privacy before workflows, for teardown). */
export function defaultSwitchboardPlugins(
  switches: DefaultSwitchboardSwitches,
): ResolvedPlugin[] {
  return builtinSwitchboardPlugins().filter(({ plugin }) => {
    if (plugin.name === mcpPlugin.name) return switches.mcp;
    if (plugin.name === workflowsPlugin.name) return switches.workflows;
    return true;
  });
}

export function createSwitchboardPluginHost(
  ctx: Omit<SwitchboardHostContext, "contributions">,
  resolved?: readonly ResolvedPlugin[],
): SwitchboardPluginHost {
  resolved ??= builtinSwitchboardPlugins();
  const ordered = resolveOrder(resolved.map((r) => r.plugin));
  const contributions = mergeContributions(
    resolved.map((r) => ({ plugin: r.plugin, provenance: r.provenance })),
  );
  const fullCtx: SwitchboardHostContext = { ...ctx, contributions };

  // Change 2: the composition is observable on the `ph run` terminal. Report
  // the activated plugins once at construction, then which plugins run each
  // lifecycle hook as it fires.
  const LOG = "[switchboard:plugins]";
  console.log(
    `${LOG} composition: ${ordered.length} plugin(s) in order — ${ordered.map((p) => p.name).join(", ") || "(none)"}`,
  );
  for (const r of resolved) {
    const cfg = Object.keys(r.entry.config ?? {});
    console.log(
      `${LOG}   • ${r.plugin.name} [${r.provenance}] (${r.entry.module})` +
        (cfg.length ? ` config: {${cfg.join(", ")}}` : ""),
    );
  }
  const ranBy = (hook: string) =>
    ordered.filter((p) => (p.hooks as Record<string, unknown>)?.[hook]);
  const logHook = (hook: string) => {
    const names = ranBy(hook).map((p) => p.name);
    console.log(
      `${LOG} hook ${hook} → ${names.length ? names.join(", ") : "(no implementers)"}`,
    );
  };

  return {
    plugins: ordered,
    ctx: fullCtx,
    transformOptions: (seed) => {
      logHook("transformServerOptions");
      return runTransformHook("transformServerOptions", ordered, fullCtx, seed);
    },
    observe: (hook) => {
      logHook(hook);
      // One at a time where a failure must find what already started: the
      // subsystems start in turn, as inline, so the caller can stop them.
      return hook === "onShutdown" || hook === "onSubgraphsRegistering"
        ? runObserveHookSequential(hook, ordered, fullCtx)
        : runObserveHook(hook, ordered, fullCtx);
    },
  };
}
