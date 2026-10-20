import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type {
  ConnectPlugin,
  ConnectPluginFactory,
} from "@powerhousedao/connect-core/plugins";
import { parseEntryConfig } from "./entry-config.js";
import {
  openPanelConfigSchema,
  type OpenPanelConfigInput,
} from "../plugin-configs/openpanel.js";

/**
 * OpenPanel analytics (`@powerhousedao/connect/plugins/openpanel`). Presence
 * is activation: the entry config (clientId, trackUiEvents, trackOperations)
 * merges into the served `openPanel` block; absence clears the clientId and
 * turns tracking off. Config shuffle today; the Analytics/OpenPanel
 * components that consume it already live in the app tree.
 *
 * The entry config IS the `connect.openPanel` slice, so it is typed and
 * validated by that slice's single-source schema (a typo'd key fails).
 */

// Schema and PHPluginConfigs augmentation: ../plugin-configs (zod-only).
export { openPanelConfigSchema, type OpenPanelConfigInput };

export const createOpenPanelPlugin: ConnectPluginFactory = (rawConfig) => {
  const config = parseEntryConfig(
    "@powerhousedao/connect/plugins/openpanel",
    openPanelConfigSchema,
    rawConfig,
  );
  const plugin: ConnectPlugin = {
    name: "connect-openpanel",
    appliesTo: "connect",
    configSchema: openPanelConfigSchema,
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        return {
          ...served,
          openPanel: { ...served.openPanel, ...config } as never,
        };
      },
    },
  };
  return plugin;
};

export default createOpenPanelPlugin;
