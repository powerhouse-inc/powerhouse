import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { z } from "zod";
import type {
  ConnectPlugin,
  ConnectPluginFactory,
} from "@powerhousedao/connect-core/plugins";

/**
 * The generic Connect shell plugin (`@powerhousedao/connect/plugins/generic`).
 *
 * It OWNS the drive-chrome UI toggles — `allowAddDrive` and the per-section
 * `sections.{remote,local}` switches (enabled / allowAdd / allowDelete). These
 * describe nothing outside the generic chrome (connect.config.ts reads them to
 * decide whether the add-drive affordance and the drive sections render), so
 * under uniform runners they are configured HERE, through this plugin's entry
 * config, not as free-standing top-level connect.drives values:
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
 */

const sectionSchema = z
  .object({
    enabled: z.boolean().optional(),
    allowAdd: z.boolean().optional(),
    allowDelete: z.boolean().optional(),
  })
  .optional();

const genericConfigSchema = z
  .object({
    allowAddDrive: z.boolean().optional(),
    sections: z
      .object({ remote: sectionSchema, local: sectionSchema })
      .optional(),
  })
  .partial();

type GenericConfig = z.infer<typeof genericConfigSchema>;

const DEFAULT_DRIVES = DEFAULT_CONNECT_CONFIG.drives;

export const createGenericPlugin: ConnectPluginFactory = (rawConfig) => {
  const config = genericConfigSchema.parse(rawConfig ?? {}) as GenericConfig;
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
          } as never,
        };
      },
    },
  };
  return plugin;
};

export default createGenericPlugin;
