/**
 * The config slices Connect's built-in plugins own, and the composition a
 * Connect without a declared one boots from. Browser-safe: `ph run` (dev,
 * serve) and Connect's own runtime work the default out with the same
 * function.
 */

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

export function valueAt(root: unknown, dotted: string): unknown {
  let current = root;
  for (const key of dotted.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Whether Connect already serves what the author wrote: every authored leaf
 * equals the served one. An unset leaf asks for nothing, so a partial object
 * (`sections: { remote: { enabled: false } }`) is satisfied by the zeroed
 * slice. */
export function alreadyServed(authored: unknown, served: unknown): boolean {
  if (authored === undefined || Object.is(authored, served)) return true;
  if (
    authored === null ||
    served === null ||
    typeof authored !== "object" ||
    typeof served !== "object" ||
    Array.isArray(authored) !== Array.isArray(served)
  ) {
    return false;
  }
  if (
    Array.isArray(authored) &&
    authored.length !== (served as unknown[]).length
  ) {
    return false;
  }
  const want = authored as Record<string, unknown>;
  const have = served as Record<string, unknown>;
  return Object.keys(want).every((key) => alreadyServed(want[key], have[key]));
}

/**
 * The composition that serves `config` as it is written, for a host that
 * declares no `runner.plugins`. `config` is the connect block Connect is
 * served without a composition.
 *
 * A built-in configured through its entry is always in it, its entry holding
 * the values `config` has at the slices it owns: composed in, the plugin
 * serves those values again (an unset one falls back to the same default).
 * A built-in whose presence is its switch is in it only where `config`
 * already has that switch on, since composing it in would turn it on.
 */
export function defaultConnectComposition(
  config: Record<string, unknown> | undefined,
): { module: string; config: Record<string, unknown> }[] {
  const composition: { module: string; config: Record<string, unknown> }[] = [];
  for (const [module, { slices }] of Object.entries(
    CONNECT_PLUGIN_OWNED_SLICES,
  )) {
    const entry: Record<string, unknown> = {};
    let configured = false;
    let switchedOn = false;
    for (const { path: slicePath, absent, entryKey } of slices) {
      const value = valueAt(config, slicePath);
      if (entryKey === undefined) {
        switchedOn ||= !alreadyServed(value, absent);
        continue;
      }
      configured = true;
      if (value !== undefined && value !== null) entry[entryKey] = value;
    }
    if (configured || switchedOn) composition.push({ module, config: entry });
  }
  return composition;
}
