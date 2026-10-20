import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type {
  ConnectPlugin,
  ConnectPluginFactory,
} from "@powerhousedao/connect-core/plugins";

/**
 * OpenPanel analytics (`@powerhousedao/connect/plugins/openpanel`). Presence
 * is activation: the entry config (clientId, trackUiEvents, trackOperations)
 * merges into the served `openPanel` block; absence clears the clientId and
 * turns tracking off. Config shuffle today; the Analytics/OpenPanel
 * components that consume it already live in the app tree.
 */
export const createOpenPanelPlugin: ConnectPluginFactory = (config) => {
  const plugin: ConnectPlugin = {
    name: "connect-openpanel",
    appliesTo: "connect",
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
