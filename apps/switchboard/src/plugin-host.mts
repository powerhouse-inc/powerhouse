import { mcpPlugin } from "./plugins/mcp.mjs";
import {
  mergeContributions,
  resolveOrder,
  runObserveHook,
  runTransformHook,
  type HostPlugin,
  type MergedContribution,
  type ResolvedPlugin,
} from "@powerhousedao/host-core";

/**
 * R2 — SwitchboardCore's plugin pipeline (rewire plan, carve map:
 * uniform-runners-plan/rewire/r2-carve-map.md). Behind
 * FEATURE_PLUGIN_HOST_ENABLED: flag off, startSwitchboard runs the existing
 * inline path byte-identically; flag on, the five subsystems run as built-in
 * plugins through these hook moments. Subsystems carve one per commit; until
 * a subsystem is carved, its inline code runs on BOTH paths and its plugin
 * twin does not exist.
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

export const PLUGIN_HOST_FLAG = "FEATURE_PLUGIN_HOST_ENABLED";

export function isPluginHostEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[PLUGIN_HOST_FLAG]?.trim().toLowerCase();
  return value === "1" || value === "true";
}

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
  renown: unknown;
  api?: unknown;
  client?: unknown;
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

/** Built-in plugins, pre-listed (the default composition until host.js
 * entries map in R2 step 2). Subsystems join as R2 carves them. */
export function builtinSwitchboardPlugins(): ResolvedPlugin[] {
  const entry = { enabled: true, verbs: "*" as const, config: {} };
  return [
    {
      plugin: mcpPlugin as HostPlugin,
      provenance: "built-in",
      entry: { ...entry, module: "@powerhousedao/switchboard/plugins/mcp" },
    },
  ];
}

export function createSwitchboardPluginHost(
  ctx: Omit<SwitchboardHostContext, "contributions">,
  resolved: readonly ResolvedPlugin[] = builtinSwitchboardPlugins(),
): SwitchboardPluginHost {
  const ordered = resolveOrder(resolved.map((r) => r.plugin));
  const contributions = mergeContributions(
    resolved.map((r) => ({ plugin: r.plugin, provenance: r.provenance })),
  );
  const fullCtx: SwitchboardHostContext = { ...ctx, contributions };
  return {
    plugins: ordered,
    ctx: fullCtx,
    transformOptions: (seed) =>
      runTransformHook("transformServerOptions", ordered, fullCtx, seed),
    observe: (hook) => runObserveHook(hook, ordered, fullCtx),
  };
}
