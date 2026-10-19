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

/* -------------------------------------------------------------- dead config */

/** One Connect config value a built-in Connect plugin owns. */
export interface OwnedConfigSlice {
  /** Dot path inside the connect config block, e.g. "drives.allowAddDrive". */
  path: string;
  /** What Connect serves at `path` while the owning plugin is absent from a
   * declared composition (apps/connect plugin-host.ts zeroAbsentSlices). */
  absent: unknown;
  /** The owning plugin's entry config key that sets this value, when the
   * plugin takes it as config; omitted where presence alone is the switch. */
  entryKey?: string;
}

export interface ConnectPluginSlices {
  slices: OwnedConfigSlice[];
  /** A slice whose unset or `absent` value leaves every slice of this plugin
   * inert (OpenPanel tracking does nothing without a clientId), so nothing
   * of it is reported as dead. */
  inertUnless?: string;
}

/**
 * The connect config slices each built-in Connect plugin owns, by specifier
 * (typed-host-configs 1.6). Under a declared composition Connect zeroes a
 * slice whose plugin is absent — presence is activation — so an authored
 * value there is dead config. Connect's built-ins are browser modules with no
 * Node-resolvable identity, so their ownership is declared here as data; a
 * Connect test pins it to plugin-host's zeroing.
 */
export const CONNECT_PLUGIN_OWNED_SLICES: Readonly<
  Record<string, ConnectPluginSlices>
> = {
  "@powerhousedao/connect/plugins/generic": {
    slices: [
      {
        path: "drives.allowAddDrive",
        absent: false,
        entryKey: "allowAddDrive",
      },
      {
        path: "drives.sections",
        absent: {
          remote: { enabled: false, allowAdd: false, allowDelete: false },
          local: { enabled: false, allowAdd: false, allowDelete: false },
        },
        entryKey: "sections",
      },
      { path: "drives.icons", absent: null, entryKey: "icons" },
      { path: "home.background", absent: null, entryKey: "homeBackground" },
    ],
  },
  "@powerhousedao/connect/plugins/sentry": {
    slices: [{ path: "sentry.dsn", absent: null, entryKey: "dsn" }],
  },
  "@powerhousedao/connect/plugins/openpanel": {
    slices: [
      { path: "openPanel.clientId", absent: "", entryKey: "clientId" },
      {
        path: "openPanel.trackUiEvents",
        absent: false,
        entryKey: "trackUiEvents",
      },
      {
        path: "openPanel.trackOperations",
        absent: false,
        entryKey: "trackOperations",
      },
    ],
    inertUnless: "openPanel.clientId",
  },
  "@powerhousedao/connect/plugins/assistant": {
    slices: [{ path: "ai.assistantEnabled", absent: false }],
  },
  "@powerhousedao/vetra-studio/connect": {
    slices: [{ path: "app.studioMode", absent: false }],
  },
  "@powerhousedao/connect/plugins/workflows": {
    slices: [{ path: "app.workflowsEnabled", absent: false }],
  },
};

export interface DeadConfigWarning {
  /** Dot path inside the connect config block. */
  path: string;
  /** The authored value. */
  value: unknown;
  /** What Connect serves instead. */
  served: unknown;
  /** The specifier of the plugin that owns the slice. */
  owner: string;
  message: string;
}

function valueAt(root: unknown, dotted: string): unknown {
  let current = root;
  for (const key of dotted.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) return false;
  }
  return true;
}

/**
 * Dead-config warnings for a Connect host (typed-host-configs 1.6): an
 * authored connect config value whose owning plugin is not in the
 * composition active for `verb`. Connect zeroes such a slice, so the value
 * has no effect — e.g. Sektar's `connect.drives.allowAddDrive: true` without
 * the generic plugin.
 *
 * Nothing is reported when the host declares no composition
 * (`runner.plugins` absent: the classic boot serves the config as is), or
 * when the authored value already equals what Connect serves. Warnings, not
 * errors: the host still boots, it just does not do what the value says.
 */
export function findDeadConnectConfig(
  config: Record<string, unknown> | undefined,
  entries: readonly PluginEntryData[] | undefined,
  verb: string,
  where: string,
): DeadConfigWarning[] {
  if (!config || entries === undefined) return [];
  const active = new Set(
    normalizePluginEntries(entries, where)
      .filter((entry) => entryActiveForVerb(entry, verb))
      .map((entry) => entry.module),
  );
  const warnings: DeadConfigWarning[] = [];
  for (const [owner, { slices, inertUnless }] of Object.entries(
    CONNECT_PLUGIN_OWNED_SLICES,
  )) {
    if (active.has(owner)) continue;
    if (inertUnless !== undefined) {
      const gate = slices.find((slice) => slice.path === inertUnless);
      const gateValue = valueAt(config, inertUnless);
      if (gateValue === undefined || sameValue(gateValue, gate?.absent)) {
        continue;
      }
    }
    for (const { path: slicePath, absent, entryKey } of slices) {
      const value = valueAt(config, slicePath);
      if (value === undefined || sameValue(value, absent)) continue;
      const move =
        entryKey === undefined
          ? `compose "${owner}" (presence is the switch)`
          : `compose "${owner}" and set \`${entryKey}\` in its entry config`;
      warnings.push({
        path: slicePath,
        value,
        served: absent,
        owner,
        message:
          `${where}: config.${slicePath} is dead config: it is owned by plugin "${owner}", ` +
          `which this host does not compose for verb "${verb}", so Connect serves ${JSON.stringify(absent)} instead of ${JSON.stringify(value)}.` +
          `\n  Hint: ${move}, or delete the value.`,
      });
    }
  }
  return warnings;
}
