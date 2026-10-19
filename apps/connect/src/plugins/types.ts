import { PluginError, type HostPlugin } from "@powerhousedao/host-core/plugins";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { z } from "zod";

/**
 * The hook vocabulary ConnectCore exposes to its built-in plugins (rewire R3).
 * `transformConnectConfig` is the one lifecycle moment wired today: each
 * plugin rewrites the config slice it owns, before the runtime cache warms.
 * `onShutdown` keeps teardown parity with the server pipeline. Deeper moments
 * (onStoreReady, onReactorReady) are added as the browser pipeline grows.
 */
export interface ConnectPluginContext {
  /** The entry's own config, re-exposed on the context for observe hooks. */
  entryConfig: Record<string, unknown>;
}

export interface ConnectConfigHooks {
  transformConnectConfig: (
    config: PHConnectRuntimeConfig,
    ctx: ConnectPluginContext,
  ) => PHConnectRuntimeConfig;
  onShutdown: (ctx: ConnectPluginContext) => void | Promise<void>;
}

export type ConnectPlugin = HostPlugin<ConnectConfigHooks>;

/** A built-in Connect plugin module default-exports this: a factory over the
 * entry's config, matching host-core's `(config) => HostPlugin` contract. */
export type ConnectPluginFactory = (
  config: Record<string, unknown>,
) => ConnectPlugin;

/**
 * Validate a built-in plugin's entry config against its configSchema, the way
 * host-core's resolveHostPlugins does on the server: a failure names the
 * plugin and every offending key instead of surfacing a bare ZodError from
 * the runtime-config load.
 */
export function parseEntryConfig<S extends z.ZodType>(
  specifier: string,
  schema: S,
  rawConfig: unknown,
): z.output<S> {
  const parsed = schema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new PluginError(
      `config for Connect plugin "${specifier}" is invalid:\n` +
        z.prettifyError(parsed.error),
      `Fix the entry's config in the host's runner.plugins.`,
    );
  }
  return parsed.data;
}
