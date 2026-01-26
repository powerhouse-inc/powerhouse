import { restPositionals, string } from "cmd-ts";
import { debugArgs, packageManagerArgs } from "./common.js";

export const installArgs = {
  dependencies: restPositionals({
    type: string,
    displayName: "dependencies",
    description: "Names of the dependencies to install",
  }),
  ...packageManagerArgs,
  ...debugArgs,
};
