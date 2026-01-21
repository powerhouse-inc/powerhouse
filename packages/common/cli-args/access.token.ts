import { option, optional, string } from "cmd-ts";
import { debugArgs } from "./common.js";
import { DEFAULT_EXPIRY_DAYS } from "./constants.js";

export const accessTokenArgs = {
  expiry: option({
    long: "expiry",
    type: optional(string),
    description: `Token expiry duration. Supports: "7d" (days), "24h" (hours), "3600" or "3600s" (seconds)`,
    defaultValue: () => `${DEFAULT_EXPIRY_DAYS}d` as const,
    defaultValueIsSerializable: true,
  }),
  audience: option({
    long: "audience",
    type: optional(string),
    description: "Target audience URL for the token",
  }),
  ...debugArgs,
};
