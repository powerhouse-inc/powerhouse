import type { RenownConfig } from "@powerhousedao/reactor-api";
import type { SwitchboardConfig } from "./config/schema.js";

/** The config file's `auth.renown`, with the config's set keys over it. */
export function renownLayers(
  file: RenownConfig | undefined,
  config: SwitchboardConfig["auth"]["renown"],
): RenownConfig {
  return {
    ...file,
    ...(config.source !== undefined ? { source: config.source } : {}),
    ...(config.url !== undefined ? { url: config.url } : {}),
    ...(config.switchboardUrl !== undefined
      ? { switchboardUrl: config.switchboardUrl }
      : {}),
  };
}
