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
import { startVetra } from "../services/vetra.js";
import { vetraSwitchboardArgs } from "./common-args.js";
import { commonArgs, commonServerArgs } from "./connect.js";

export const vetraArgs = {
  switchboardPort: option({
    type: number,
    long: "switchboard-port",
    description: "port to use for the Vetra Switchboard",
    defaultValue: () => {
      const baseConfig = getConfig();
      return baseConfig.reactor?.port ?? 4001;
    },
  }),
  connectPort: option({
    type: number,
    long: "connect-port",
    description: "port to use for the Vetra Connect",
    defaultValue: () => 3000 as const,
    defaultValueIsSerializable: true,
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
    defaultValueIsSerializable: true,
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
  ...commonArgs,
  ...commonServerArgs,
  ...vetraSwitchboardArgs,
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
  },
});
