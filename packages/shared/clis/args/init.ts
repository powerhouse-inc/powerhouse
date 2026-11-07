import {
  boolean,
  flag,
  oneOf,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import { AGENTS, debugArgs, packageManagerArgs } from "./common.js";

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
  packageManager: option({
    type: optional(oneOf(AGENTS)),
    long: "package-manager",
    short: "p",
    description:
      "Package manager that installs the project: `npm`, `pnpm`, `yarn` or `bun`. Defaults to the one that launched ph (npx, pnpm dlx, bunx), else the one that installed ph (unless npm), else bun, then pnpm 10.14 or later if installed, else npm.",
  }),
  tag: option({
    type: optional(oneOf(["latest", "staging", "dev", "rc"])),
    long: "tag",
    short: "t",
    description: `Specify the release tag to use for your project. Can be one of: "latest", "staging", "dev", or "rc".`,
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
  rc: flag({
    type: optional(boolean),
    long: "rc",
    description: "Use the `rc` release tag.",
  }),
  remoteDrive: option({
    type: optional(string),
    long: "remote-drive",
    short: "r",
    description: "Remote drive identifier.",
  }),
  uniformRunners: flag({
    type: optional(boolean),
    long: "uniform-runners",
    description:
      "Scaffold the hosts/ folder (uniform-runners architecture). Also enabled project-wide by FEATURE_UNIFORM_RUNNERS_ENABLED.",
  }),
  clone: option({
    type: optional(string),
    long: "clone",
    description:
      "Path to an existing scaffolded project to clone instead of resolving deps from scratch. Install runs offline from the cloned project's lockfile: pnpm-lock.yaml with pnpm, package-lock.json with npm (other package managers are refused; --version/--tag are ignored).",
  }),
  ...debugArgs,
};
