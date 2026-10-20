import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type {
  ConnectPlugin,
  ConnectPluginFactory,
} from "@powerhousedao/connect-core/plugins";

/**
 * Sentry error reporting (`@powerhousedao/connect/plugins/sentry`). Presence
 * is activation: listing it merges the entry config (dsn, env, tracing) into
 * the served `sentry` block; omitting it nulls the dsn (see the absence
 * zeroing in plugin-host). A thin config shuffle today — the SentryProvider
 * that reads this slice already exists in the app.
 */
export const createSentryPlugin: ConnectPluginFactory = (config) => {
  const plugin: ConnectPlugin = {
    name: "connect-sentry",
    appliesTo: "connect",
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        return {
          ...served,
          sentry: { ...served.sentry, ...config } as never,
        };
      },
    },
  };
  return plugin;
};

export default createSentryPlugin;
