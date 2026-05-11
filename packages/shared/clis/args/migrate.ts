import { boolean, flag, option, optional, positional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

export const migrateArgs = {
  versionPositional: positional({
    type: optional(string),
    displayName: "version",
    description:
      "The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `latest`.",
  }),
  version: option({
    long: "version",
    short: "v",
    type: string,
    description:
      "The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `latest`.",
    defaultValue: () => "latest" as const,
    defaultValueIsSerializable: true,
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
