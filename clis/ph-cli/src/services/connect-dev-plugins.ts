import {
  normalizePluginEntries,
  PluginError,
  resolveHostPlugins,
  type ConnectDevHooks,
  type ConnectDevServerContext,
  type PluginEntryData,
} from "@powerhousedao/host-core";
import type { PluginOption } from "vite";

/** The verb the plugins of a dev server are resolved for. */
const DEV_VERB = "dev";

/**
 * The dev-server plugins every Connect dev server loads, resolved from the
 * CLI's own dependencies. A host turns one off with an entry of the same
 * module and `enabled: false` in its `runner.devPlugins`.
 */
export const DEFAULT_CONNECT_DEV_PLUGINS: readonly PluginEntryData[] = [
  "@powerhousedao/devtools/connect",
];

export type ConnectDevPluginsOptions = {
  projectRoot: string;
  /** The host's `runner.devPlugins`, resolved from the project. */
  entries?: readonly PluginEntryData[];
  /** Where `entries` are written, for error messages. */
  where: string;
  context: ConnectDevServerContext;
  /** In place of {@link DEFAULT_CONNECT_DEV_PLUGINS}. */
  defaults?: readonly PluginEntryData[];
};

type Resolved = Awaited<
  ReturnType<typeof resolveHostPlugins<ConnectDevHooks<PluginOption>>>
>;

const DEFAULTS_WHERE = "the dev server's default plugins";

/** Resolves from the CLI's own dependencies, where the default plugins are. */
const fromCli = (entries: readonly PluginEntryData[], where: string) =>
  resolveHostPlugins<ConnectDevHooks<PluginOption>>(
    import.meta.dirname,
    "connect",
    DEV_VERB,
    entries,
    where,
  );

/** What the plugins' `devServer` hooks give. */
async function vitePluginsOf(
  resolved: Resolved,
  where: string,
  context: ConnectDevServerContext,
): Promise<PluginOption[]> {
  const plugins: PluginOption[] = [];
  for (const { plugin, entry } of resolved) {
    const devServer = plugin.hooks?.devServer;
    const shape =
      'A dev-server plugin default-exports `{ name, appliesTo: "connect", hooks: { devServer } }`, and the hook returns a list of Vite plugins.';
    if (!devServer) {
      throw new PluginError(
        `${where}: dev-server plugin "${entry.module}" has no devServer hook.`,
        shape,
      );
    }
    const given: unknown = await devServer(context);
    if (!Array.isArray(given)) {
      throw new PluginError(
        `${where}: the devServer hook of "${entry.module}" did not return a list.`,
        shape,
      );
    }
    plugins.push(...(given as PluginOption[]));
  }
  return plugins;
}

/** A default plugin is an aid, not a part of the dev server: one that cannot
 * load, or whose hook fails, is left out with a warning, and the server
 * starts without it. */
async function defaultPlugins(
  entries: readonly PluginEntryData[],
  context: ConnectDevServerContext,
): Promise<PluginOption[]> {
  const plugins: PluginOption[] = [];
  for (const entry of entries) {
    try {
      const resolved = await fromCli([entry], DEFAULTS_WHERE);
      plugins.push(...(await vitePluginsOf(resolved, DEFAULTS_WHERE, context)));
    } catch (error) {
      console.warn(
        `[connect] Leaving out a default dev-server plugin: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return plugins;
}

/**
 * The Vite plugins of a Connect dev server's plugins: the default ones and
 * the host's, each asked through its `devServer` hook. Only a dev server
 * (`runConnectStudio`) asks, so what the plugins add never reaches a build.
 */
export async function resolveConnectDevPlugins({
  projectRoot,
  entries = [],
  where,
  context,
  defaults = DEFAULT_CONNECT_DEV_PLUGINS,
}: ConnectDevPluginsOptions): Promise<PluginOption[]> {
  const moduleOf = (entry: PluginEntryData) =>
    normalizePluginEntries([entry], where)[0].module;
  const defaultModules = new Set(defaults.map(moduleOf));
  const named = new Set(entries.map(moduleOf));
  const isDefault = (entry: PluginEntryData) =>
    defaultModules.has(moduleOf(entry));

  // What a host names itself must load: a failure there stops the server.
  const hosts = [
    // A host's entry for a default plugin configures that plugin or turns it
    // off: it is still the CLI's, which a project need not depend on.
    ...(await fromCli(entries.filter(isDefault), where)),
    ...(await resolveHostPlugins<ConnectDevHooks<PluginOption>>(
      projectRoot,
      "connect",
      DEV_VERB,
      entries.filter((entry) => !isDefault(entry)),
      where,
    )),
  ];
  return [
    ...(await defaultPlugins(
      defaults.filter((entry) => !named.has(moduleOf(entry))),
      context,
    )),
    ...(await vitePluginsOf(hosts, where, context)),
  ];
}
