import { positional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

export const inspectArgs = {
  packageName: positional({
    type: string,
    displayName: "package-name",
    description: "The name of the package to inspect",
  }),
  ...debugArgs,
};
