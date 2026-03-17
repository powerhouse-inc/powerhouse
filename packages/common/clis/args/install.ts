import { option, optional, restPositionals, string } from "cmd-ts";
import { debugArgs, packageManagerArgs } from "./common.js";

export const installArgs = {
  dependencies: restPositionals({
    type: string,
    displayName: "dependencies",
    description: "Names of the dependencies to install",
  }),
  registry: option({
    type: optional(string),
    long: "registry",
    description:
      "Registry URL to install from (overrides config and environment)",
  }),
  ...packageManagerArgs,
  ...debugArgs,
};
