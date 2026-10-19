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
  type PluginEntry,
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
  entries: readonly PluginEntry[],
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
