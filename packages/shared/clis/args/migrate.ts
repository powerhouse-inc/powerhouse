import { boolean, flag, option, optional, positional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

const versionDescription =
  "The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `latest`. Defaults to the release channel of the project's installed Powerhouse packages.";

export const migrateArgs = {
  versionPositional: positional({
    type: optional(string),
    displayName: "version",
    description: versionDescription,
  }),
  version: option({
    long: "version",
    short: "v",
    type: optional(string),
    description: versionDescription,
  }),
  force: flag({
    type: optional(boolean),
    long: "force",
    short: "f",
    description:
      "Run migrate from the bundled codegen even if the target version cannot be resolved from the npm registry or differs from the installed ph-cli version.",
  }),
  ...debugArgs,
};
