import { option, optional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

export const DEFAULT_REGISTRY_LOGIN_EXPIRY = "30d";

export const registryLoginArgs = {
  registry: option({
    type: optional(string),
    long: "registry",
    description:
      "Registry URL to log in to (overrides PH_REGISTRY_URL and powerhouse.config.json)",
  }),
  expiry: option({
    type: string,
    long: "expiry",
    defaultValue: () => DEFAULT_REGISTRY_LOGIN_EXPIRY,
    description:
      "Token expiry — formats: '7d' (days), '24h' (hours), '3600' (seconds).",
    defaultValueIsSerializable: true,
  }),
  ...debugArgs,
};
