import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { connectSentrySchema } from "@powerhousedao/shared/connect/connect-config-schema";
import type { z } from "zod";
import {
  parseEntryConfig,
  type ConnectPlugin,
  type ConnectPluginFactory,
} from "./types.js";

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
export const sentryConfigSchema = connectSentrySchema;

/** What a host.js entry writes (a type alias, so it stays assignable to the
 * runtime `PluginEntryData` config record). */
export type SentryConfigInput = z.input<typeof sentryConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/sentry": SentryConfigInput;
  }
}

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
