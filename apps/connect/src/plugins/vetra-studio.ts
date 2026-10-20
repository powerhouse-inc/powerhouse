import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type {
  ConnectPlugin,
  ConnectPluginFactory,
} from "@powerhousedao/connect-core/plugins";
import { parseEntryConfig } from "./entry-config.js";
import {
  vetraStudioConfigSchema,
  type VetraStudioConfigInput,
} from "../plugin-configs/vetra-studio.js";

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

// Schema and PHPluginConfigs augmentation: ../plugin-configs (zod-only).
export { vetraStudioConfigSchema, type VetraStudioConfigInput };

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
