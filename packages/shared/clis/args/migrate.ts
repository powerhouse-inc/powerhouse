import {
  array,
  boolean,
  flag,
  multioption,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
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
  subgraphs: flag({
    type: optional(boolean),
    long: "subgraphs",
    description:
      "Convert every schema-first subgraph under subgraphs/ into a code-first one, keeping its schema and resolvers. Code-first subgraphs are skipped, and a subgraph that cannot keep the same schema is left as it is, with the reason. Upgrades no dependencies and regenerates nothing else.",
  }),
  subgraph: multioption({
    type: array(string),
    long: "subgraph",
    description:
      "Convert only this directory of subgraphs/ into a code-first subgraph. Repeat it for more directories. Implies --subgraphs.",
    defaultValue: () => [],
  }),
  dryRun: flag({
    type: optional(boolean),
    long: "dry-run",
    description:
      "With --subgraphs or --subgraph: print the diff of what would change, and write nothing.",
  }),
  ...debugArgs,
};
