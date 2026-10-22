import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  entryActiveForVerb,
  isSchemaLike,
  normalizePluginEntries,
  PluginError,
  type PluginEntryData,
} from "@powerhousedao/host-core";

/** The zod-only entry Connect publishes with every built-in plugin's entry
 * config schema, keyed by plugin specifier. */
const PLUGIN_CONFIGS_ENTRY = "@powerhousedao/connect/plugin-configs";

/**
 * Validate the entry configs of the Connect plugins composed for `verb`
 * before Connect boots, so a typo fails at `ph run` naming the plugin and the
 * key instead of at browser boot. The schemas come from the project's own
 * `@powerhousedao/connect/plugin-configs` (resolved from the project tree,
 * like runner and plugin modules); without it, or for a specifier it has no
 * schema for, the browser's own validation stays the only check.
 */
export async function validateConnectPluginConfigs(
  projectRoot: string,
  entries: readonly PluginEntryData[] | undefined,
  verb: string,
  where: string,
): Promise<void> {
  if (entries === undefined || entries.length === 0) return;
  const schemas = await loadPluginConfigSchemas(projectRoot);
  if (!schemas) return;
  for (const entry of normalizePluginEntries(entries, where)) {
    if (!entryActiveForVerb(entry, verb)) continue;
    const schema = schemas[entry.module];
    if (!isSchemaLike(schema)) continue;
    const parsed = schema.safeParse(entry.config);
    if (parsed.success) continue;
    const issues = parsed.error.issues.map((issue) => {
      const key = ["config", ...issue.path.map(String)].join(".");
      return `  - ${key}: ${issue.message}`;
    });
    throw new PluginError(
      `${where}: config for plugin "${entry.module}" is invalid:\n${issues.join("\n")}`,
    );
  }
}

async function loadPluginConfigSchemas(
  projectRoot: string,
): Promise<Record<string, unknown> | undefined> {
  const projectRequire = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  let file: string;
  try {
    file = projectRequire.resolve(PLUGIN_CONFIGS_ENTRY);
  } catch {
    return undefined;
  }
  const module = (await import(pathToFileURL(file).href)) as {
    connectPluginConfigSchemas?: unknown;
  };
  const schemas = module.connectPluginConfigSchemas;
  return typeof schemas === "object" && schemas !== null
    ? (schemas as Record<string, unknown>)
    : undefined;
}
