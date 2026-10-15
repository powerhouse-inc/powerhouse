import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type { ConnectPlugin, ConnectPluginFactory } from "./types.js";

/**
 * The Connect AI assistant (`@powerhousedao/connect/plugins/assistant`).
 * Presence flips `ai.assistantEnabled` on and merges the entry config
 * (endpoint, agent, defaultOpen, …); absence forces it off. The assistant FAB
 * in app.tsx already renders on `ai.assistantEnabled`, so this plugin's
 * config shuffle is immediately visible in the UI.
 */
export const createAssistantPlugin: ConnectPluginFactory = (config) => {
  const plugin: ConnectPlugin = {
    name: "connect-assistant",
    appliesTo: "connect",
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        return {
          ...served,
          ai: { ...served.ai, assistantEnabled: true, ...config } as never,
        };
      },
    },
  };
  return plugin;
};

export default createAssistantPlugin;
