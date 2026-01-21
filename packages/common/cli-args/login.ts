import { boolean, flag, number, option, optional, string } from "cmd-ts";
import { debugArgs } from "./common.js";
import { DEFAULT_RENOWN_URL, DEFAULT_TIMEOUT } from "./constants.js";

export const loginArgs = {
  renownUrl: option({
    type: string,
    long: "renown-url",
    defaultValue: () => DEFAULT_RENOWN_URL,
    description: `Renown server URL.`,
    defaultValueIsSerializable: true,
    env: "PH_CONNECT_RENOWN_URL",
  }),
  timeout: option({
    type: number,
    long: "timeout",
    defaultValue: () => DEFAULT_TIMEOUT,
    description: "Authentication timeout in seconds.",
    defaultValueIsSerializable: true,
  }),
  logout: flag({
    type: optional(boolean),
    long: "logout",
    description: "Sign out and clear stored credentials",
  }),
  status: flag({
    type: optional(boolean),
    long: "status",
    description: "Show current authentication status",
  }),
  showDid: flag({
    type: optional(boolean),
    long: "show-did",
    description: "Show the CLI's DID and exit",
  }),
  ...debugArgs,
};
