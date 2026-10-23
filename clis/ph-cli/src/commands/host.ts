import { hostCheckArgs } from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

export const check = command({
  name: "check",
  description:
    "Check a host the way `ph run` would, without starting it: every load, " +
    "validation, resolution and boot issue, grouped by host file. Exits 1 " +
    "on any issue. `--env <file>` checks against that file alone.",
  args: hostCheckArgs,
  handler: async (args) => {
    const { runHostCheck } = await import("../services/host/check.js");
    const { output, exitCode } = await runHostCheck(args);
    console.log(output);
    // Not process.exit: on macOS a piped stdout is async and would be cut.
    process.exitCode = exitCode;
  },
});

export const host = subcommands({
  name: "host",
  description:
    "Inspect the project's hosts/ (FEATURE_UNIFORM_RUNNERS_ENABLED): `check`.",
  cmds: { check },
});
