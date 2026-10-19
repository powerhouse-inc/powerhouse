import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import type {
  PHBackground,
  PHConnectExplorerIcons,
  PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import {
  parseEntryConfig,
  type ConnectPlugin,
  type ConnectPluginFactory,
} from "./types.js";
import {
  genericConfigSchema,
  type GenericConfig,
  type GenericConfigInput,
} from "../plugin-configs/generic.js";

/**
 * The generic Connect shell plugin (`@powerhousedao/connect/plugins/generic`).
 *
 * It OWNS the drive-chrome UI toggles — `allowAddDrive` and the per-section
 * `sections.{remote,local}` switches (enabled / allowAdd / allowDelete) —
 * the explorer's `icons` (local/remote drive fallbacks, folder, document and
 * per-type document icons, which override the icons a package ships) and the
 * home screen's `homeBackground` (its layers over a page colour). These
 * describe nothing outside the generic chrome (connect.config.ts reads the
 * toggles to decide whether the add-drive affordance and the drive sections
 * render; the explorer components read the icons; the home screen is the
 * chrome's landing page), so under uniform runners they are configured HERE,
 * through this plugin's entry config, not as free-standing top-level
 * connect.drives / connect.home values:
 *
 *   - present + entry provides a value  -> that value
 *   - present + entry omits it          -> inherit DEFAULT_CONNECT_CONFIG
 *   - absent from the composition       -> zeroed off (see plugin-host's
 *                                          zeroAbsentSlices — no chrome, no
 *                                          toggles)
 *
 * The top-level served value is deliberately NOT a fallback: ownership means a
 * single source. `branding` is intentionally NOT handled here — it has reach
 * beyond the chrome (e.g. document.title), so it stays a Connect-level config
 * value that survives this plugin's absence.
 *
 * Icons and background images are image refs; a project path in host.js is
 * resolved to a data URI by the Connect build before the composition reaches
 * the browser, a URL or data URI passes through (the only forms for config
 * applied after the build). `null` keeps the built-in icon / gradient.
 */

// Schema and PHPluginConfigs augmentation: ../plugin-configs (zod-only).
export { genericConfigSchema, type GenericConfig, type GenericConfigInput };

const DEFAULT_DRIVES = DEFAULT_CONNECT_CONFIG.drives;
const DEFAULT_HOME = DEFAULT_CONNECT_CONFIG.home;

export const createGenericPlugin: ConnectPluginFactory = (rawConfig) => {
  const config: GenericConfig = parseEntryConfig(
    "@powerhousedao/connect/plugins/generic",
    genericConfigSchema,
    rawConfig,
  );
  const plugin: ConnectPlugin = {
    name: "connect-generic",
    appliesTo: "connect",
    configSchema: genericConfigSchema,
    hooks: {
      transformConnectConfig(served: PHConnectRuntimeConfig) {
        const entrySections = config.sections ?? {};
        return {
          ...served,
          drives: {
            ...served.drives,
            // Owned: entry value, else the single-source default — never the
            // served top-level value.
            allowAddDrive:
              config.allowAddDrive ?? DEFAULT_DRIVES?.allowAddDrive,
            sections: {
              remote: {
                ...DEFAULT_DRIVES?.sections?.remote,
                ...entrySections.remote,
              },
              local: {
                ...DEFAULT_DRIVES?.sections?.local,
                ...entrySections.local,
              },
            },
            // Owned: the entry's icons (already resolved by the build), else
            // the default — the built-in icons.
            icons: (config.icons ?? null) as PHConnectExplorerIcons | null,
          } as never,
          home: {
            ...served.home,
            // Owned: the entry's background (images resolved by the build),
            // else the default — the bundled gradient.
            background: (config.homeBackground ??
              DEFAULT_HOME?.background ??
              null) as PHBackground | null,
          },
        };
      },
    },
  };
  return plugin;
};

export default createGenericPlugin;
