import {
  boolean,
  command,
  flag,
  number,
  option,
  optional,
  string,
} from "cmd-ts";
import { startVetra } from "../services/vetra.js";
import { debugArgs } from "./common-args.js";

export const vetraArgs = {
  switchboardPort: option({
    type: optional(number),
    long: "switchboard-port",
    description: "port to use for the Vetra Switchboard",
    defaultValue: () => 4001 as const,
    defaultValueIsSerializable: true,
  }),
  connectPort: option({
    type: optional(number),
    long: "connect-port",
    description: "port to use for the Vetra Connect",
    defaultValue: () => 3000 as const,
    defaultValueIsSerializable: true,
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
  configFile: option({
    type: optional(string),
    long: "config-file",
    description: "path to the powerhouse.config.js file",
  }),
  remoteDrive: option({
    type: optional(string),
    long: "remote-drive",
    description:
      "URL of remote drive to connect to (skips switchboard initialization)",
  }),
  watch: flag({
    type: optional(boolean),
    long: "watch",
    short: "w",
    description:
      "Enable dynamic loading for document-models and editors in connect-studio and switchboard",
  }),
  verbose: flag({
    type: optional(boolean),
    long: "logs",
    description: "Show additional logs",
  }),
  disableConnect: flag({
    type: optional(boolean),
    long: "disable-connect",
    description:
      "Skip Connect initialization (only start switchboard and reactor)",
  }),
  interactive: flag({
    type: optional(boolean),
    long: "interactive",
    description:
      "Enable interactive mode for code generation (requires user confirmation before generating code)",
  }),
  ignoreLocal: flag({
    type: optional(boolean),
    long: "ignore-local",
    description: "Skip loading local project files",
  }),
  noGenerate: flag({
    type: optional(boolean),
    long: "no-generate",
    description: "Skip code generation",
  }),
  ...debugArgs,
};

export const vetra = command({
  name: "vetra",
  description: `
The vetra command sets up a Vetra development environment for working with Vetra projects.
It starts a Vetra Switchboard and optionally Connect Studio, enabling document collaboration 
and real-time processing with a "Vetra" drive or connection to remote drives.

This command:
1. Starts a Vetra Switchboard with a "Vetra" drive for document storage
2. Optionally connects to remote drives instead of creating a local drive
3. Starts Connect Studio pointing to the Switchboard for user interaction (unless disabled)
4. Enables real-time updates, collaboration, and code generation`,
  args: vetraArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await startVetra(args);
    return args;
  },
});
