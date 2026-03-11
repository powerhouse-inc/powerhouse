import { boolean, flag, optional, restPositionals, string } from "cmd-ts";
import { debugArgs, packageManagerArgs } from "./common.js";

export const uninstallArgs = {
  dependencies: restPositionals({
    type: string,
    displayName: "dependencies",
    description: "Names of the dependencies to uninstall",
  }),
  local: flag({
    type: optional(boolean),
    long: "local",
    description: "Also uninstall the package from node_modules",
  }),
  ...packageManagerArgs,
  ...debugArgs,
};
