import {
  resolveOrder,
  runObserveHookSequential,
  runTransformHook,
  type HostPlugin,
} from "@powerhousedao/host-core/plugins";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import createAssistantPlugin from "./plugins/assistant.js";
import createGenericPlugin from "./plugins/generic.js";
import createOpenPanelPlugin from "./plugins/openpanel.js";
import createSentryPlugin from "./plugins/sentry.js";
import type {
  ConnectConfigHooks,
  ConnectPlugin,
  ConnectPluginContext,
  ConnectPluginFactory,
} from "./plugins/types.js";
import createVetraStudioPlugin from "./plugins/vetra-studio.js";
import createWorkflowsPlugin from "./plugins/workflows.js";

export type { ConnectPluginContext } from "./plugins/types.js";

/**
 * R3.2 — ConnectCore's plugin pipeline (rewire plan R3; the browser side of
 * the real-pipeline decision Q2). Runs ONLY when the served runtime config
 * carries a `composition` (projected by the uniform-runners connect runner
 * from host.js runner.plugins) AND the runtime flag is on — otherwise the
 * classic boot is byte-identical.
 *
 * The built-in plugins are REAL modules under ./plugins — each a
 * `(config) => HostPlugin` with a named `transformConnectConfig` hook, so the
 * config slice it owns is auditable in its own file. Presence is activation:
 * a plugin that is absent from a declared composition has its slice ZEROED.
 * Unknown specifiers are logged and skipped (external, non-built-in browser
 * plugin loading is the documented follow-up; the connect runner should also
 * reject unknowns at `ph run` time — tracked separately).
 */

export const PLUGIN_RUNNER_FLAG = "FEATURE_PLUGIN_RUNNER_ENABLED";

/** The built-in registry: published specifier -> the module's factory. The
 * modules live in Connect's own source (bundled into the app), so this is a
 * static import map, not a dynamic module resolution. */
const BUILTINS: Record<string, ConnectPluginFactory> = {
  "@powerhousedao/connect/plugins/generic": createGenericPlugin,
  "@powerhousedao/connect/plugins/sentry": createSentryPlugin,
  "@powerhousedao/connect/plugins/openpanel": createOpenPanelPlugin,
  "@powerhousedao/connect/plugins/assistant": createAssistantPlugin,
  "@powerhousedao/connect/plugins/workflows": createWorkflowsPlugin,
  "@powerhousedao/vetra-studio/connect": createVetraStudioPlugin,
};

/** The config slices each built-in owns; zeroed when its plugin is ABSENT
 * from a declared composition — presence is activation. */
function zeroAbsentSlices(
  config: PHConnectRuntimeConfig,
  present: ReadonlySet<string>,
): PHConnectRuntimeConfig {
  const out = { ...config };
  if (!present.has("@powerhousedao/connect/plugins/generic")) {
    // The drive-chrome toggles the generic plugin owns describe nothing when
    // the generic chrome is not composed in: no add-drive affordance, and the
    // remote/local sections off. (branding is NOT zeroed — it is Connect-level
    // and survives the plugin's absence.)
    const off = { enabled: false, allowAdd: false, allowDelete: false };
    out.drives = {
      ...out.drives,
      allowAddDrive: false,
      sections: { remote: off, local: off },
    } as never;
  }
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
  if (!present.has("@powerhousedao/connect/plugins/workflows")) {
    // The workflow package (Workflow Studio) loads only when the plugin is
    // composed in; the classic workflows.enabled value is not the switch.
    out.app = { ...out.app, workflowsEnabled: false } as never;
  }
  return out;
}

const LOG = "[connect:plugins]";

/**
 * Apply the composition to the served config. Pure (no mutation of the input);
 * called from loadRuntimeConfig after the fetch, before the cache is warmed —
 * every downstream consumer sees the transformed config through the classic
 * paths. Logs the resolved plan and each lifecycle hook it fires to the
 * browser console, so activation is observable (Change 2).
 */
export async function applyComposition(
  config: PHConnectRuntimeConfig,
): Promise<PHConnectRuntimeConfig> {
  const composition = config.composition;
  if (!composition) return config;

  const present = new Set(composition.map((entry) => entry.module));
  const plugins: ConnectPlugin[] = [];

  console.info(
    `${LOG} resolving composition — ${composition.length} entr${composition.length === 1 ? "y" : "ies"}`,
  );
  for (const entry of composition) {
    const factory = BUILTINS[entry.module];
    if (!factory) {
      console.warn(
        `${LOG}   ✗ ${entry.module} — unknown (external plugin loading not wired); SKIPPED`,
      );
      continue;
    }
    const plugin = factory(entry.config ?? {});
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
  const transformed = await runTransformHook<
    PHConnectRuntimeConfig,
    ConnectPluginContext
  >("transformConnectConfig", ordered, ctx, zeroAbsentSlices(config, present));
  return transformed;
}

/** Teardown parity with the server pipeline (unused tonight; the browser has
 * no orderly shutdown, but the vocabulary stays symmetric). */
export async function shutdownComposition(
  plugins: readonly HostPlugin<ConnectConfigHooks>[],
): Promise<void> {
  await runObserveHookSequential("onShutdown", plugins, { entryConfig: {} });
}
