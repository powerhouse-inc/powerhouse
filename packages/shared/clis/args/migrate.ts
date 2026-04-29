import { option, string } from "cmd-ts";
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
  ...debugArgs,
};
