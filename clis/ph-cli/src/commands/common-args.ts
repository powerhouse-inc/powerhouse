import { boolean, command, flag, oneOf, option, optional } from "cmd-ts";
import { AGENTS } from "package-manager-detector";

export const debugArgs = {
  debug: flag({
    type: optional(boolean),
    long: "debug",
    description: "Log arguments passed to this command",
  }),
};

export const packageManagerArgs = {
  packageManager: option({
    type: optional(oneOf(AGENTS)),
    long: "package-manager",
    short: "p",
    description:
      "Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.",
  }),
  npm: flag({
    type: optional(boolean),
    long: "npm",
    description: "Use 'npm' as package manager",
  }),
  pnpm: flag({
    type: optional(boolean),
    long: "pnpm",
    description: "Use 'pnpm' as package manager",
  }),
  yarn: flag({
    type: optional(boolean),
    long: "yarn",
    description: "Use 'yarn' as package manager",
  }),
  bun: flag({
    type: optional(boolean),
    long: "bun",
    description: "Use 'bun' as package manager",
  }),
};

export const getPackageManagerCommand = command({
  name: "get-package-manager",
  args: packageManagerArgs,
  handler: (args) => args,
});
