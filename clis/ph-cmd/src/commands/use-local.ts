import { debugArgs, runUseLocal } from "@powerhousedao/shared/clis";
import {
  boolean,
  command,
  flag,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";

export const useLocal = command({
  name: "use-local",
  description:
    "Use your local `powerhouse` monorepo dependencies the current project.",
  args: {
    monorepoPathPositional: positional({
      type: optional(string),
      displayName: "monorepo path",
      description:
        "Path to your local powerhouse monorepo relative to this project",
    }),
    monorepoPathOption: option({
      type: optional(string),
      long: "path",
      short: "p",
      description:
        "Path to your local powerhouse monorepo relative to this project",
    }),
    skipInstall: flag({
      type: optional(boolean),
      long: "skip-install",
      short: "s",
      description: "Skip running `install` with `pnpm`",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { monorepoPathPositional, monorepoPathOption, skipInstall, debug } =
      args;
    if (debug) {
      console.log({ args });
    }
    const monorepoPath = monorepoPathPositional ?? monorepoPathOption;

    if (!monorepoPath) {
      throw new Error(
        "❌ Please provide the path to your local powerhouse monorepo.",
      );
    }

    await runUseLocal(monorepoPath, skipInstall);
    process.exit(0);
  },
});
