import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  entryActiveForVerb,
  hostTypeSatisfies,
  normalizePluginEntries,
  PluginError,
  type HostPlugin,
  type PluginEntryData,
  type ResolvedPlugin,
} from "./plugins.js";

/**
 * NODE-ONLY plugin resolution (split from plugins.ts so the pure runner core
 * stays browser-safe for ConnectCore — R3). Resolves host.js entries from the
 * PROJECT dependency tree, exactly like runner modules.
 */

function isHostPluginShape(value: unknown): value is HostPlugin {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as HostPlugin).name === "string"
  );
}

/**
 * Resolve host.js plugin entries into live plugins for one host boot:
 * verb-filter → module resolution from the project tree (default condition,
 * like runners) → factory/object contract → config validation → appliesTo.
 */
export async function resolveHostPlugins<THooks = Record<string, unknown>>(
  projectRoot: string,
  hostType: string,
  verb: string,
  entries: readonly PluginEntryData[],
  where: string,
): Promise<ResolvedPlugin<THooks>[]> {
  const normalized = normalizePluginEntries(entries, where);
  const projectRequire = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );

  const resolved: ResolvedPlugin<THooks>[] = [];
  for (const entry of normalized) {
    if (!entryActiveForVerb(entry, verb)) continue;

    let file: string;
    try {
      file = projectRequire.resolve(entry.module);
    } catch {
      throw new PluginError(
        `${where}: cannot resolve plugin "${entry.module}" from ${projectRoot}.`,
        "Plugins resolve from the project dependency tree, exactly like runner modules.",
      );
    }
    const module = (await import(pathToFileURL(file).href)) as {
      default?: unknown;
    };
    const exported = module.default;

    let plugin: HostPlugin<THooks>;
    if (typeof exported === "function") {
      const factory = exported as (config: unknown) => HostPlugin<THooks>;
      plugin = factory(entry.config);
    } else if (isHostPluginShape(exported)) {
      if (Object.keys(entry.config).length > 0 && !exported.configSchema) {
        throw new PluginError(
          `${where}: plugin "${entry.module}" takes no config, but the entry passes one.`,
        );
      }
      plugin = exported as HostPlugin<THooks>;
    } else {
      throw new PluginError(
        `${where}: "${entry.module}" does not default-export a plugin object or factory.`,
        "Export `{ name, hooks?, contributions? }` or `(config) => plugin`.",
      );
    }

    if (plugin.configSchema) {
      const parsed = plugin.configSchema.safeParse(entry.config);
      if (!parsed.success) {
        throw new PluginError(
          `${where}: config for plugin "${plugin.name}" is invalid:\n` +
            z.prettifyError(parsed.error),
        );
      }
    }

    const appliesTo = plugin.appliesTo ?? "reactor";
    if (!hostTypeSatisfies(hostType, appliesTo)) {
      throw new PluginError(
        `${where}: plugin "${plugin.name}" applies to "${appliesTo}" hosts, but this host is "${hostType}".`,
      );
    }

    resolved.push({ entry, plugin, provenance: "dependency" });
  }
  return resolved;
}

/** A drive a plugin contributes: its declaration (drives.ts shape, validated
 * by the consumer) and the plugin it came from. */
export interface ContributedDrive {
  declaration: Record<string, unknown>;
  source: string;
}

export interface PluginContributionsPlan {
  drives: ContributedDrive[];
  /** Entries whose module the project tree cannot resolve (e.g. Connect's
   * browser built-ins, which have no Node-resolvable identity module). */
  unresolved: string[];
}

/**
 * LENIENT resolution for diagnostics (`ph run <host> --explain drives`):
 * collects the drive contributions of the entries active for `verb`. Unlike
 * resolveHostPlugins it does not know the host type (so appliesTo is not
 * checked) and does not fail on a specifier the project tree cannot resolve
 * — the entry is listed under `unresolved` instead. Config is still validated
 * against the plugin's schema, so a bad entry surfaces here too.
 */
export async function resolvePluginContributions(
  projectRoot: string,
  verb: string,
  entries: readonly PluginEntryData[],
  where: string,
): Promise<PluginContributionsPlan> {
  const normalized = normalizePluginEntries(entries, where);
  const projectRequire = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  const plan: PluginContributionsPlan = { drives: [], unresolved: [] };
  for (const entry of normalized) {
    if (!entryActiveForVerb(entry, verb)) continue;
    let file: string;
    try {
      file = projectRequire.resolve(entry.module);
    } catch {
      plan.unresolved.push(entry.module);
      continue;
    }
    const module = (await import(pathToFileURL(file).href)) as {
      default?: unknown;
    };
    const exported = module.default;
    let plugin: HostPlugin;
    if (typeof exported === "function") {
      plugin = (exported as (config: unknown) => HostPlugin)(entry.config);
    } else if (isHostPluginShape(exported)) {
      plugin = exported;
    } else {
      plan.unresolved.push(entry.module);
      continue;
    }
    if (plugin.configSchema) {
      const parsed = plugin.configSchema.safeParse(entry.config);
      if (!parsed.success) {
        throw new PluginError(
          `${where}: config for plugin "${plugin.name}" is invalid:\n` +
            z.prettifyError(parsed.error),
        );
      }
    }
    for (const declaration of plugin.contributions?.drives ?? []) {
      plan.drives.push({
        declaration: declaration as Record<string, unknown>,
        source: plugin.name,
      });
    }
  }
  return plan;
}
