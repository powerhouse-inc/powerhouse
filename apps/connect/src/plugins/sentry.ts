import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import {
  parseEntryConfig,
  type ConnectPlugin,
  type ConnectPluginFactory,
} from "./types.js";
import {
  sentryConfigSchema,
  type SentryConfigInput,
} from "../plugin-configs/sentry.js";

/**
 * Sentry error reporting (`@powerhousedao/connect/plugins/sentry`). Presence
 * is activation: listing it merges the entry config (dsn, env, tracing) into
 * the served `sentry` block; omitting it nulls the dsn (see the absence
 * zeroing in plugin-host). A thin config shuffle today — the SentryProvider
 * that reads this slice already exists in the app.
 *
 * The entry config IS the `connect.sentry` slice, so it is typed and
 * validated by that slice's single-source schema (a typo'd key fails).
 */

// Schema and PHPluginConfigs augmentation: ../plugin-configs (zod-only).
export { sentryConfigSchema, type SentryConfigInput };

export const createSentryPlugin: ConnectPluginFactory = (rawConfig) => {
  const config = parseEntryConfig(
    "@powerhousedao/connect/plugins/sentry",
    sentryConfigSchema,
    rawConfig,
  );
  const plugin: ConnectPlugin = {
    name: "connect-sentry",
    appliesTo: "connect",
    configSchema: sentryConfigSchema,
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
