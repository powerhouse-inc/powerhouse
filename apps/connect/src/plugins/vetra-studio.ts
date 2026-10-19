import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type { ConnectPlugin, ConnectPluginFactory } from "./types.js";

/**
 * Vetra Studio, browser side (`@powerhousedao/vetra-studio/connect`). Its
 * presence turns Connect's studio mode on; the classic `app.studioMode`
 * consumer paths run unchanged, and absence forces studio off (the zeroing in
 * plugin-host). Lives here, in Connect's own source, because the studio-mode
 * behaviour is Connect browser behaviour — the published vetra-studio/connect
 * module is only the server-resolvable identity of the same plugin.
 */
export const createVetraStudioPlugin: ConnectPluginFactory = (config) => {
  const plugin: ConnectPlugin = {
    name: "vetra-studio-connect",
    appliesTo: "connect",
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        return {
          ...served,
          app: { ...served.app, studioMode: true, ...config } as never,
        };
      },
    },
  };
  return plugin;
};

export default createVetraStudioPlugin;
