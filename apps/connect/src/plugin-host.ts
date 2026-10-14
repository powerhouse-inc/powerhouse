import {
  resolveOrder,
  runObserveHookSequential,
  runTransformHook,
  type HostPlugin,
} from "@powerhousedao/host-core/plugins";
import type {
  PHConnectCompositionEntry,
  PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";

/**
 * R3.2 — ConnectCore's plugin pipeline (rewire plan R3; the browser side of
 * the real-pipeline decision Q2). Runs ONLY when the served runtime config
 * carries a `composition` (projected by the uniform-runners connect runner
 * from host.js runner.plugins) AND the runtime flag is on — otherwise the
 * classic boot is byte-identical.
 *
 * Tonight's carve depth (recorded in the plan): the BUILT-IN plugins own
 * their CONFIG CONCERNS via transformConfig — presence is activation for the
 * vendor adapters (sentry, openpanel) and the assistant, and the generic
 * shell takes its entry config (branding/allowAddDrive/sections). The
 * downstream app consumes the TRANSFORMED config through the unchanged
 * classic code paths (real hooks, code moved not redesigned). Deleting the
 * generic shell's UI (deep product) is phase-4 scope; external plugin modules
 * (dynamic import via the package manager) are the documented follow-up —
 * unknown specifiers warn and skip.
 */

export const PLUGIN_RUNNER_FLAG = "FEATURE_PLUGIN_RUNNER_ENABLED";

export interface ConnectPluginContext {
  entryConfig: Record<string, unknown>;
}

type ConnectConfigHooks = {
  transformConnectConfig: (
    config: PHConnectRuntimeConfig,
    ctx: ConnectPluginContext,
  ) => PHConnectRuntimeConfig;
  onShutdown: (ctx: ConnectPluginContext) => void | Promise<void>;
};

type BuiltinFactory = (
  entry: PHConnectCompositionEntry,
) => HostPlugin<ConnectConfigHooks>;

/** The built-in registry, keyed by the published specifier. Each built-in
 * owns one slice of the served config; ABSENCE zeroes that slice. */
const BUILTINS: Record<string, BuiltinFactory> = {
  "@powerhousedao/connect/plugins/generic": (entry) => ({
    name: "connect-generic",
    appliesTo: "connect",
    hooks: {
      transformConnectConfig: (config: PHConnectRuntimeConfig) => {
        const c = entry.config ?? {};
        return {
          ...config,
          branding: (c.branding as never) ?? config.branding,
          drives: {
            ...config.drives,
            allowAddDrive:
              (c.allowAddDrive as boolean | undefined) ??
              config.drives?.allowAddDrive,
            sections: (c.sections as never) ?? config.drives?.sections,
          },
        };
      },
    },
  }),
  "@powerhousedao/connect/plugins/sentry": (entry) => ({
    name: "connect-sentry",
    appliesTo: "connect",
    hooks: {
      transformConnectConfig: (config: PHConnectRuntimeConfig) => ({
        ...config,
        sentry: { ...config.sentry, ...(entry.config as object) } as never,
      }),
    },
  }),
  "@powerhousedao/connect/plugins/openpanel": (entry) => ({
    name: "connect-openpanel",
    appliesTo: "connect",
    hooks: {
      transformConnectConfig: (config: PHConnectRuntimeConfig) => ({
        ...config,
        openPanel: {
          ...config.openPanel,
          ...(entry.config as object),
        } as never,
      }),
    },
  }),
  "@powerhousedao/vetra-studio/connect": (entry) => ({
    name: "vetra-studio-connect",
    appliesTo: "connect",
    hooks: {
      // Studio in the browser: presence turns studio mode on (the classic
      // app.studioMode consumer paths run unchanged); absence of this entry
      // leaves studioMode wherever the config put it — the zeroing below
      // forces it OFF under a declared composition.
      transformConnectConfig: (config: PHConnectRuntimeConfig) => ({
        ...config,
        app: {
          ...config.app,
          studioMode: true,
          ...(entry.config as object),
        } as never,
      }),
    },
  }),
  "@powerhousedao/connect/plugins/assistant": (entry) => ({
    name: "connect-assistant",
    appliesTo: "connect",
    hooks: {
      transformConnectConfig: (config: PHConnectRuntimeConfig) => ({
        ...config,
        ai: {
          ...config.ai,
          assistantEnabled: true,
          ...(entry.config as object),
        } as never,
      }),
    },
  }),
};

/** The config slices each built-in owns; zeroed when its plugin is ABSENT
 * from a declared composition — presence is activation. */
function zeroAbsentSlices(
  config: PHConnectRuntimeConfig,
  present: ReadonlySet<string>,
): PHConnectRuntimeConfig {
  const out = { ...config };
  if (!present.has("@powerhousedao/connect/plugins/sentry")) {
    out.sentry = { ...out.sentry, dsn: null } as never;
  }
  if (!present.has("@powerhousedao/connect/plugins/openpanel")) {
    out.openPanel = {
      ...out.openPanel,
      clientId: "",
      trackUiEvents: false,
      trackOperations: false,
    } as never;
  }
  if (!present.has("@powerhousedao/connect/plugins/assistant")) {
    out.ai = { ...out.ai, assistantEnabled: false } as never;
  }
  if (!present.has("@powerhousedao/vetra-studio/connect")) {
    out.app = { ...out.app, studioMode: false } as never;
  }
  return out;
}

/**
 * Apply the composition to the served config. Pure; called from
 * loadRuntimeConfig after the fetch, before the cache is warmed — every
 * downstream consumer sees the transformed config through the classic paths.
 */
export async function applyComposition(
  config: PHConnectRuntimeConfig,
): Promise<PHConnectRuntimeConfig> {
  const composition = config.composition;
  if (!composition) return config;

  const present = new Set(composition.map((entry) => entry.module));
  const plugins: HostPlugin<ConnectConfigHooks>[] = [];
  for (const entry of composition) {
    const factory = BUILTINS[entry.module];
    if (!factory) {
      console.warn(
        `[connect:plugins] unknown plugin "${entry.module}" — external plugin loading is not wired yet; entry skipped.`,
      );
      continue;
    }
    plugins.push(factory(entry));
  }

  const ordered = resolveOrder(plugins);
  const ctx: ConnectPluginContext = { entryConfig: {} };
  const transformed = await runTransformHook<
    PHConnectRuntimeConfig,
    ConnectPluginContext
  >("transformConnectConfig", ordered, ctx, zeroAbsentSlices(config, present));
  return transformed;
}

/** Teardown parity with the server pipeline (unused tonight; the browser has
 * no orderly shutdown, but the vocabulary stays symmetric). */
export async function shutdownComposition(
  plugins: readonly HostPlugin[],
): Promise<void> {
  await runObserveHookSequential("onShutdown", plugins, { entryConfig: {} });
}
