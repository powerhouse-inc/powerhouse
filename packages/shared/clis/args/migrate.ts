import { boolean, flag, option, optional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

export const migrateArgs = {
  version: option({
    long: "version",
    short: "v",
    type: string,
    description:
      "The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `latest`.",
    defaultValue: () => "latest" as const,
    defaultValueIsSerializable: true,
  }),
  dryRun: flag({
    long: "dry-run",
    type: optional(boolean),
    description: "Run the migration without writing any files.",
  }),
  safe: flag({
    long: "safe",
    type: optional(boolean),
    description:
      "Run the migration and only update generated files. Does not make changes to non-generated files.",
  }),
  force: flag({
    long: "force",
    type: optional(boolean),
    description:
      "Run the migration even if your git working tree is not clean.",
  }),
  ...debugArgs,
};
