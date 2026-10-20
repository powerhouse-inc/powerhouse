import {
  resolveOrder,
  runTransformHook,
} from "@powerhousedao/host-core/plugins";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type { ConnectPluginDefinitions } from "../registry.js";
import { getConnectRegistry } from "../registry.js";
import type {
  ConnectPlugin,
  ConnectPluginContext,
  ConnectPluginDefinition,
} from "./types.js";

export type { ConnectPluginContext } from "./types.js";

// ConnectCore's plugin pipeline (rewire plan R3). It runs only when the served
// config carries a `composition`; presence is activation.

type PluginDefinitions = ConnectPluginDefinitions;
type PluginLoader = () => Promise<PluginDefinitions>;

/** Makes plugin modules known by specifier; a loader runs when a composition applies. */
export function registerConnectPlugins(
  plugins: PluginDefinitions | PluginLoader,
) {
  const registry = getConnectRegistry();
  if (typeof plugins === "function") registry.pluginLoaders.push(plugins);
  else Object.assign(registry.plugins, plugins);
}

async function knownPlugins(): Promise<PluginDefinitions> {
  const registry = getConnectRegistry();
  const pending = registry.pluginLoaders;
  registry.pluginLoaders = [];
  for (const loaded of await Promise.all(pending.map((load) => load()))) {
    Object.assign(registry.plugins, loaded);
  }
  return registry.plugins;
}

/** The slices of known plugins absent from the composition, zeroed. */
function zeroAbsentSlices(
  config: PHConnectRuntimeConfig,
  present: ReadonlySet<string>,
  plugins: PluginDefinitions,
): PHConnectRuntimeConfig {
  let out = { ...config };
  for (const [module, definition] of Object.entries(plugins)) {
    if (!present.has(module) && definition.whenAbsent) {
      out = definition.whenAbsent(out);
    }
  }
  return out;
}

const LOG = "[connect:plugins]";

/** Applies the composition to the served config; pure, and logs the plan and
 * each hook it fires to the console. */
export async function applyComposition(
  config: PHConnectRuntimeConfig,
): Promise<PHConnectRuntimeConfig> {
  const composition = config.composition;
  if (!composition) return config;

  const definitions = await knownPlugins();
  const present = new Set(composition.map((entry) => entry.module));
  const plugins: ConnectPlugin[] = [];

  console.info(
    `${LOG} resolving composition — ${composition.length} entr${composition.length === 1 ? "y" : "ies"}`,
  );
  for (const entry of composition) {
    const definition: ConnectPluginDefinition | undefined =
      definitions[entry.module];
    if (!definition) {
      console.warn(
        `${LOG}   ✗ ${entry.module} — unknown (external plugin loading not wired); SKIPPED`,
      );
      continue;
    }
    const plugin = definition.create(entry.config ?? {});
    plugins.push(plugin);
    const cfgKeys = Object.keys(entry.config ?? {});
    console.info(
      `${LOG}   ✓ ${plugin.name} (${entry.module})` +
        (cfgKeys.length ? ` config: {${cfgKeys.join(", ")}}` : ""),
    );
  }

  const ordered = resolveOrder(plugins);
  const ctx: ConnectPluginContext = { entryConfig: {} };
  const ran = ordered
    .filter((p) => p.hooks?.transformConnectConfig)
    .map((p) => p.name);
  console.info(
    `${LOG} hook transformConnectConfig → ${ran.length ? ran.join(", ") : "(none)"}`,
  );
  return runTransformHook<PHConnectRuntimeConfig, ConnectPluginContext>(
    "transformConnectConfig",
    ordered,
    ctx,
    zeroAbsentSlices(config, present, definitions),
  );
}
