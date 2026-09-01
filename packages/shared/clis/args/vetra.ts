import { boolean, flag, number, option, optional, string } from "cmd-ts";
import {
  DEFAULT_SWITCHBOARD_PORT,
  DEFAULT_VETRA_CONNECT_PORT,
} from "../constants.js";
import { getConfig } from "../file-system/get-config.js";
import { loadProjectEnv, readPortEnv } from "../project-env.js";
import {
  commonArgs,
  commonServerArgs,
  renownNamespace,
  vetraSwitchboardArgs,
} from "./common.js";

/**
 * Resolve the Vetra Switchboard port.
 *
 * Precedence: CLI flag (cmd-ts applies that above this function) →
 * `process.env` → `.env.local` → `.env` → `powerhouse.config.json` →
 * constant. `loadProjectEnv` folds the two files into `process.env` without
 * clobbering anything already set, so a single lookup covers the middle three.
 */
export function resolveSwitchboardPortDefault(): number {
  loadProjectEnv();
  return (
    readPortEnv("PH_SWITCHBOARD_PORT") ??
    getConfig().reactor?.port ??
    DEFAULT_SWITCHBOARD_PORT
  );
}

/** Resolve the Vetra Connect port through the same chain. */
export function resolveConnectPortDefault(): number {
  loadProjectEnv();
  return (
    readPortEnv("PH_VETRA_CONNECT_PORT") ??
    getConfig().vetra?.connectPort ??
    DEFAULT_VETRA_CONNECT_PORT
  );
}

export const vetraArgs = {
  switchboardPort: option({
    type: number,
    long: "switchboard-port",
    description: "port to use for the Vetra Switchboard",
    defaultValue: resolveSwitchboardPortDefault,
  }),
  connectPort: option({
    type: number,
    long: "connect-port",
    // Deliberately not `defaultValueIsSerializable`: the value is now
    // per-project, and cmd-ts prints serializable defaults into `--help`,
    // which would bake one project's port into the help text.
    description: "port to use for the Vetra Connect",
    defaultValue: resolveConnectPortDefault,
  }),
  remoteDrive: option({
    type: optional(string),
    long: "remote-drive",
    description:
      "URL of remote drive to connect to (skips switchboard initialization)",
    defaultValue: () => {
      const baseConfig = getConfig();
      return baseConfig.vetra?.driveUrl;
    },
  }),
  watch: flag({
    type: boolean,
    long: "watch",
    short: "w",
    description:
      "Enable dynamic loading for document-models and editors in connect-studio and switchboard",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  verbose: flag({
    type: boolean,
    long: "logs",
    description: "Show additional logs",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  disableConnect: flag({
    type: boolean,
    long: "disable-connect",
    description:
      "Skip Connect initialization (only start switchboard and reactor)",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  interactive: flag({
    type: boolean,
    long: "interactive",
    description:
      "Enable interactive mode for code generation (requires user confirmation before generating code)",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  drivesPublicBase: option({
    type: optional(string),
    long: "drives-public-base",
    description:
      "public base URL for the drive URLs advertised to Connect; each drive is exposed as <base>/d/<slug> instead of http://localhost:<switchboard-port>/d/<slug>. Use when the switchboard is reachable through a reverse proxy.",
  }),
  dbPath: option({
    type: optional(string),
    long: "db-path",
    description:
      "Database path or connection string. Use a `postgres://` URL for Postgres; otherwise treated as a PGlite filesystem path. Leave unset for in-memory PGlite.",
  }),
  renownNamespace,
  ...commonArgs,
  ...commonServerArgs,
  ...vetraSwitchboardArgs,
};
