import { DEFAULT_DRIVE_ICON } from "@powerhousedao/shared/clis";
import type { ILogger } from "document-model";
import { switchboardConfigFromEnv } from "./from-env.js";
import { callerOverEnv, mergeSwitchboardConfig } from "./merge.js";
import type { SwitchboardConfigInput } from "./schema.js";

const BIN_DRIVE = {
  id: "powerhouse",
  slug: "powerhouse",
  global: { name: "Powerhouse", icon: DEFAULT_DRIVE_ICON },
  local: {
    availableOffline: true,
    listeners: [],
    sharingType: "public",
    triggers: [],
  },
};

/** The bin's config: the config file's port, then the env, then the bin's own options. */
export function binSwitchboardConfig(
  env: Readonly<Record<string, string | undefined>>,
  options: {
    /** powerhouse.config.json `switchboard.port`. */
    filePort?: number;
    /** The `--migrate-pglite` flag. */
    migratePglite: boolean;
    logger?: ILogger;
  },
): SwitchboardConfigInput {
  return callerOverEnv(
    mergeSwitchboardConfig(
      { server: { port: options.filePort } },
      switchboardConfigFromEnv(env, { bin: true, logger: options.logger }),
    ),
    {
      features: { mcp: true },
      drive: BIN_DRIVE,
      storage: { migratePglite: options.migratePglite || undefined },
    },
  );
}
