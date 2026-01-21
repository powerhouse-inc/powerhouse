import { getConfig } from "@powerhousedao/config/node";
import {
  boolean,
  command,
  flag,
  number,
  option,
  optional,
  string,
} from "cmd-ts";
import { runSwitchboardMigrations } from "../services/switchboard-migrate.js";
import { startSwitchboard } from "../services/switchboard.js";
import { packages, vetraSwitchboardArgs } from "./common-args.js";

export const switchboardArgs = {
  ...vetraSwitchboardArgs,
  packages,
  port: option({
    type: number,
    long: "port",
    description: "Port to host the api",
    defaultValue: () => 4001 as const,
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
    defaultValue: () => "vetra" as const,
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
export const switchboard = command({
  name: "switchboard",
  aliases: ["reactor"],
  description: `
The switchboard command starts a local Switchboard instance, which acts as the document
processing engine for Powerhouse projects. It provides the infrastructure for document
models, processors, and real-time updates.

This command:
1. Starts a local switchboard server
2. Loads document models and processors
3. Provides an API for document operations
4. Enables real-time document processing
5. Can authenticate with remote services using your identity from 'ph login'`,
  args: switchboardArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { basePath, dbPath, migrate, migrateStatus } = args;
    if (basePath) {
      process.env.BASE_PATH = basePath;
    }

    if (migrate || migrateStatus) {
      await runSwitchboardMigrations({
        dbPath,
        statusOnly: migrateStatus,
      });
      return;
    }

    const { defaultDriveUrl, connectCrypto } = await startSwitchboard(args);
    console.log("   ➜  Switchboard:", defaultDriveUrl);
    if (connectCrypto) {
      const did = await connectCrypto.did();
      console.log("   ➜  Identity:", did);
    }
  },
});
