import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type {
  ConnectPlugin,
  ConnectPluginFactory,
} from "@powerhousedao/connect-core/plugins";
import { parseEntryConfig } from "./entry-config.js";
import {
  assistantConfigSchema,
  type AssistantConfigInput,
} from "../plugin-configs/assistant.js";

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

// Schema and PHPluginConfigs augmentation: ../plugin-configs (zod-only).
export { assistantConfigSchema, type AssistantConfigInput };

export const createAssistantPlugin: ConnectPluginFactory = (rawConfig) => {
  parseEntryConfig(
    "@powerhousedao/connect/plugins/assistant",
    assistantConfigSchema,
    rawConfig,
  );
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
