import type { PHSwitchboardDriveConfig } from "@powerhousedao/shared/clis";
import type { ILogger } from "document-model";
import { defaultDrive } from "./default-drive.js";
import { switchboardConfigFromEnv } from "./from-env.js";
import { callerOverEnv, mergeSwitchboardConfig } from "./merge.js";
import type { SwitchboardConfigInput } from "./schema.js";

/** The bin's config: the config file's port and drive, then the env, then the bin's own options. */
export function binSwitchboardConfig(
  env: Readonly<Record<string, string | undefined>>,
  options: {
    /** powerhouse.config.json `switchboard.port`. */
    filePort?: number;
    /** powerhouse.config.json `switchboard.drive`. */
    fileDrive?: PHSwitchboardDriveConfig;
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
      drive: defaultDrive(env, options.fileDrive),
      storage: { migratePglite: options.migratePglite || undefined },
    },
  );
}
