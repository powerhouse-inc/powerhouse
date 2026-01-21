import { boolean, flag, number, option, optional, string } from "cmd-ts";
import { packages, vetraSwitchboardArgs } from "./common.js";
import {
  DEFAULT_SWITCHBOARD_PORT,
  DEFAULT_VETRA_DRIVE_ID,
} from "./constants.js";

export const switchboardArgs = {
  ...vetraSwitchboardArgs,
  packages,
  port: option({
    type: number,
    long: "port",
    description: "Port to host the api",
    defaultValue: () => DEFAULT_SWITCHBOARD_PORT,
    defaultValueIsSerializable: true,
  }),
  basePath: option({
    type: optional(string),
    long: "base-path",
    description:
      "base path for the API endpoints (sets the BASE_PATH environment variable",
  }),
  keypairPath: option({
    type: optional(string),
    long: "keypair-path",
    description: "path to custom keypair file for identity",
  }),
  vetraDriveId: option({
    type: string,
    long: "vetra-drive-id",
    description: "Specify a Vetra drive ID",
    defaultValue: () => DEFAULT_VETRA_DRIVE_ID,
    defaultValueIsSerializable: true,
  }),
  dbPath: option({
    type: optional(string),
    long: "db-path",
    description: "path to the database",
  }),
  useIdentity: flag({
    type: optional(boolean),
    long: "use-identity",
    description:
      "enable identity using keypair from ph login (uses ~/.ph/keypair.json)",
  }),
  requireIdentity: flag({
    type: optional(boolean),
    long: "require-identity",
    description:
      "require existing keypair, fail if not found (implies --use-identity)",
  }),
  migrate: flag({
    type: optional(boolean),
    long: "migrate",
    description: "Run database migrations and exit",
  }),
  migrateStatus: flag({
    type: optional(boolean),
    long: "migrate-status",
    description: "Show migration status and exit",
  }),
  mcp: flag({
    type: boolean,
    long: "mcp",
    description: "enable Mcp route at /mcp",
    defaultValue: () => true,
    defaultValueIsSerializable: true,
  }),
  useVetraDrive: flag({
    type: boolean,
    long: "use-vetra-drive",
    description: "Use a Vetra drive",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
};
