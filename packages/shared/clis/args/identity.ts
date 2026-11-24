import { boolean, flag, option, optional, string } from "cmd-ts";
import { DEFAULT_RENOWN_URL } from "../constants.js";
import { debugArgs } from "./common.js";

const renownUrl = option({
  type: string,
  long: "renown-url",
  defaultValue: () => DEFAULT_RENOWN_URL,
  description: "Renown server URL.",
  defaultValueIsSerializable: true,
  env: "PH_CONNECT_RENOWN_URL",
});

// `ph whoami`.
export const whoamiArgs = {
  json: flag({
    type: optional(boolean),
    long: "json",
    description: "Print the identity as JSON",
  }),
  check: flag({
    type: optional(boolean),
    long: "check",
    description: "Ask Renown whether the login is still valid (network)",
  }),
  renownUrl,
  ...debugArgs,
};

// `ph logout`.
export const logoutArgs = {
  renownUrl,
  ...debugArgs,
};

// `ph identity password`.
export const identityPasswordArgs = {
  remove: flag({
    type: optional(boolean),
    long: "remove",
    description:
      "Remove the password: the key is kept readable by your user only",
  }),
  ...debugArgs,
};
