import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { connectOpenPanelSchema } from "@powerhousedao/shared/connect/connect-config-schema";
import type { z } from "zod";
import type { ConnectPlugin, ConnectPluginFactory } from "./types.js";

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
export const openPanelConfigSchema = connectOpenPanelSchema;

/** What a host.js entry writes (a type alias, so it stays assignable to the
 * runtime `PluginEntryData` config record). */
export type OpenPanelConfigInput = z.input<typeof openPanelConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/openpanel": OpenPanelConfigInput;
  }
}

export const createOpenPanelPlugin: ConnectPluginFactory = (rawConfig) => {
  const config = openPanelConfigSchema.parse(rawConfig);
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
