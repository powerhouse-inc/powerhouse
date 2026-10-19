import type { HostPlugin } from "@powerhousedao/host-core/plugins";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";

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
