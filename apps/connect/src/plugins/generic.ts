import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type { ConnectPlugin, ConnectPluginFactory } from "./types.js";

/**
 * The generic Connect shell plugin (`@powerhousedao/connect/plugins/generic`).
 *
 * It owns Connect's standard chrome config: branding, whether drives can be
 * added, and the sidebar sections. Today its lifecycle is a single
 * `transformConnectConfig` step — it writes those three slices from its entry
 * config into the served config. The chrome UI itself (sidebar, home, /d/
 * routes) is not yet gated on this plugin's presence; that gating is the
 * roadmap "shell deletability" item. Keeping this a real module means the
 * config shuffle is auditable in one place instead of an inline registry map.
 */
export const createGenericPlugin: ConnectPluginFactory = (config) => {
  const plugin: ConnectPlugin = {
    name: "connect-generic",
    appliesTo: "connect",
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        return {
          ...served,
          branding: (config.branding as never) ?? served.branding,
          drives: {
            ...served.drives,
            allowAddDrive:
              (config.allowAddDrive as boolean | undefined) ??
              served.drives?.allowAddDrive,
            sections: (config.sections as never) ?? served.drives?.sections,
          },
        };
      },
    },
  };
  return plugin;
};

export default createGenericPlugin;
