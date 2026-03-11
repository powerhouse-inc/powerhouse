import { boolean, flag, optional, restPositionals, string } from "cmd-ts";
import { debugArgs, packageManagerArgs } from "./common.js";

export const installArgs = {
  dependencies: restPositionals({
    type: string,
    displayName: "dependencies",
    description: "Names of the dependencies to install",
  }),
  local: flag({
    type: optional(boolean),
    long: "local",
    description: "Also install the package as a node module from the registry",
  }),
  ...packageManagerArgs,
  ...debugArgs,
};
