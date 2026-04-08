import {
  boolean,
  flag,
  oneOf,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import { debugArgs, packageManagerArgs } from "./common.js";

export const initArgs = {
  namePositional: positional({
    type: optional(string),
    displayName: "name",
    description:
      "The name of your project. A new directory will be created in your current directory with this name.",
  }),
  nameOption: option({
    type: optional(string),
    long: "name",
    short: "n",
    description:
      "The name of your project. A new directory will be created in your current directory with this name.",
  }),
  ...packageManagerArgs,
  tag: option({
    type: optional(oneOf(["latest", "staging", "dev"])),
    long: "tag",
    short: "t",
    description: `Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".`,
  }),
  version: option({
    type: optional(string),
    long: "version",
    short: "v",
    description:
      "Specify the exact semver release version to use for your project.",
  }),
  dev: flag({
    type: optional(boolean),
    long: "dev",
    short: "d",
    description: "Use the `dev` release tag.",
  }),
  staging: flag({
    type: optional(boolean),
    long: "staging",
    short: "s",
    description: "Use the `staging` release tag.",
  }),
  remoteDrive: option({
    type: optional(string),
    long: "remote-drive",
    short: "r",
    description: "Remote drive identifier.",
  }),
  ...debugArgs,
};
