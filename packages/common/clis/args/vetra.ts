import { getConfig } from "@powerhousedao/config/node";
import { boolean, flag, number, option, optional, string } from "cmd-ts";
import {
  DEFAULT_CONNECT_STUDIO_PORT,
  DEFAULT_SWITCHBOARD_PORT,
} from "../constants.js";
import {
  commonArgs,
  commonServerArgs,
  vetraSwitchboardArgs,
} from "./common.js";

export const vetraArgs = {
  switchboardPort: option({
    type: number,
    long: "switchboard-port",
    description: "port to use for the Vetra Switchboard",
    defaultValue: () => {
      const baseConfig = getConfig();
      return baseConfig.reactor?.port ?? DEFAULT_SWITCHBOARD_PORT;
    },
  }),
  connectPort: option({
    type: number,
    long: "connect-port",
    description: "port to use for the Vetra Connect",
    defaultValue: () => DEFAULT_CONNECT_STUDIO_PORT,
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
