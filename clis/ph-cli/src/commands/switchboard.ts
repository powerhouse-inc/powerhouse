import {
  array,
  boolean,
  command,
  flag,
  multioption,
  number,
  option,
  optional,
  string,
} from "cmd-ts";
import { startSwitchboard } from "../services/switchboard.js";
import { debugArgs } from "./common-args.js";

export const switchboardArgs = {
  port: option({
    type: optional(number),
    long: "port",
    description: "Port to run the preview server on",
    defaultValue: () => 4001 as const,
    defaultValueIsSerializable: true,
  }),
  configFile: option({
    type: optional(string),
    long: "config-file",
    description: "Path to the powerhouse.config.js file",
  }),
  dbPath: option({
    type: optional(string),
    long: "db-path",
    description: "path to the database",
  }),
  httpsKeyFile: option({
    type: optional(string),
    long: "https-key-file",
    description: "path to the ssl key file",
  }),
  httpsCertFile: option({
    type: optional(string),
    long: "https-cert-file",
    description: "path to the ssl cert file",
  }),
  packages: multioption({
    type: optional(array(string)),
    long: "packages",
    description:
      "list of packages to be loaded, if defined then packages on config file are ignored",
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
  generate: flag({
    type: optional(boolean),
    long: "generate",
    description: "generate code when document model is updated",
  }),
  dev: flag({
    type: optional(boolean),
    long: "dev",
    description: "enable development mode to load local packages",
  }),
  mcp: flag({
    type: boolean,
    long: "mcp",
    description: "enable Mcp route at /mcp",
    defaultValue: () => true,
    defaultValueIsSerializable: true,
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
  ...debugArgs,
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
    const {
      basePath,
      port,
      configFile,
      dev,
      dbPath,
      packages,
      useIdentity,
      keypairPath,
      requireIdentity,
    } = args;
    if (basePath) {
      process.env.BASE_PATH = basePath;
    }
    const { defaultDriveUrl, connectCrypto } = await startSwitchboard({
      port,
      configFile,
      dev,
      dbPath,
      packages,
      useIdentity,
      keypairPath,
      requireIdentity,
    });
    console.log("   ➜  Switchboard:", defaultDriveUrl);
    if (connectCrypto) {
      const did = await connectCrypto.did();
      console.log("   ➜  Identity:", did);
    }
  },
});
