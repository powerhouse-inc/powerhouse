import {
  boolean,
  flag,
  option,
  optional,
  restPositionals,
  string,
} from "cmd-ts";
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
  local: flag({
    type: optional(boolean),
    long: "local",
    description:
      'Also install packages into node_modules (marks them as provider: "local" so they get bundled into ph connect build)',
  }),
  ...packageManagerArgs,
  ...debugArgs,
};
