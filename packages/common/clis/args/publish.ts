import { option, optional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

export const publishArgs = {
  registry: option({
    type: optional(string),
    long: "registry",
    description:
      "Registry URL to publish to (overrides config and environment)",
  }),
  ...debugArgs,
};
