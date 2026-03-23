import { option, optional, rest, string } from "cmd-ts";
import { debugArgs } from "./common.js";

export const publishArgs = {
  registry: option({
    type: optional(string),
    long: "registry",
    description:
      "Registry URL to publish to (overrides config and environment)",
  }),
  ...debugArgs,
  forwardedArgs: rest({
    displayName: "npm-args",
    description: "Extra arguments forwarded to npm publish (e.g. --tag dev)",
  }),
};
