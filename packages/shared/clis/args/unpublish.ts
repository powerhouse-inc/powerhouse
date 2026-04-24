import {
  boolean,
  flag,
  option,
  optional,
  positional,
  rest,
  string,
} from "cmd-ts";
import { debugArgs } from "./common.js";

export const unpublishArgs = {
  spec: positional({
    type: optional(string),
    displayName: "package-spec",
    description:
      "Package to unpublish: `<name>` (whole package) or `<name>@<version>` (single version). If omitted, uses the current project's `name@version` from package.json.",
  }),
  registry: option({
    type: optional(string),
    long: "registry",
    description:
      "Registry URL to unpublish from (overrides config and environment)",
  }),
  yes: flag({
    type: optional(boolean),
    long: "yes",
    short: "y",
    description: "Skip the confirmation prompt",
  }),
  ...debugArgs,
  forwardedArgs: rest({
    displayName: "npm-args",
    description: "Extra arguments forwarded to npm unpublish",
  }),
};
