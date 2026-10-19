import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { z } from "zod";
import {
  parseEntryConfig,
  type ConnectPlugin,
  type ConnectPluginFactory,
} from "./types.js";

/**
 * Vetra Studio, browser side (`@powerhousedao/vetra-studio/connect`). Its
 * presence turns Connect's studio mode on; the classic `app.studioMode`
 * consumer paths run unchanged, and absence forces studio off (the zeroing in
 * plugin-host). Lives here, in Connect's own source, because the studio-mode
 * behaviour is Connect browser behaviour — the published vetra-studio/connect
 * module is only the server-resolvable identity of the same plugin.
 *
 * It takes no entry config: presence is the switch, and the rest of the
 * `connect.app` slice is Connect-level config, not this plugin's.
 */
export const vetraStudioConfigSchema = z.strictObject({});

/** What a host.js entry writes (a type alias, so it stays assignable to the
 * runtime `PluginEntryData` config record). */
export type VetraStudioConfigInput = z.input<typeof vetraStudioConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/vetra-studio/connect": VetraStudioConfigInput;
  }
}

export const createVetraStudioPlugin: ConnectPluginFactory = (rawConfig) => {
  parseEntryConfig(
    "@powerhousedao/vetra-studio/connect",
    vetraStudioConfigSchema,
    rawConfig,
  );
  const plugin: ConnectPlugin = {
    name: "vetra-studio-connect",
    appliesTo: "connect",
    configSchema: vetraStudioConfigSchema,
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        return {
          ...served,
          app: { ...served.app, studioMode: true },
        };
      },
    },
  };
  return plugin;
};

export default createVetraStudioPlugin;
