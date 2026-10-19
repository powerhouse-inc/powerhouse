import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { z } from "zod";
import type { ConnectPlugin, ConnectPluginFactory } from "./types.js";

/**
 * The Connect AI assistant (`@powerhousedao/connect/plugins/assistant`).
 * Presence flips `ai.assistantEnabled` on; absence forces it off. The
 * assistant FAB in app.tsx already renders on `ai.assistantEnabled`, so this
 * plugin's config shuffle is immediately visible in the UI.
 *
 * It takes no entry config: `ai.assistantEnabled` is the only key of the
 * `connect.ai` slice, and presence is that switch. The endpoint and agent are
 * user settings in the browser, not host config.
 */
export const assistantConfigSchema = z.strictObject({});

/** What a host.js entry writes (a type alias, so it stays assignable to the
 * runtime `PluginEntryData` config record). */
export type AssistantConfigInput = z.input<typeof assistantConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/assistant": AssistantConfigInput;
  }
}

export const createAssistantPlugin: ConnectPluginFactory = (rawConfig) => {
  assistantConfigSchema.parse(rawConfig);
  const plugin: ConnectPlugin = {
    name: "connect-assistant",
    appliesTo: "connect",
    configSchema: assistantConfigSchema,
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        return {
          ...served,
          ai: { ...served.ai, assistantEnabled: true },
        };
      },
    },
  };
  return plugin;
};

export default createAssistantPlugin;
