import { hostCheckArgs, hostExportArgs } from "@powerhousedao/shared/clis/args";
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

// `export` is a reserved word.
export const exportCmd = command({
  name: "export",
  description:
    "Print a host as declared, with every member a compound names, as JSON " +
    "(tokens unresolved). `--out` writes it to a file instead.",
  args: hostExportArgs,
  handler: async (args) => {
    const { runHostExport } = await import("../services/host/export.js");
    const { stdout, stderr, exitCode } = await runHostExport(args);
    if (stdout !== undefined) process.stdout.write(stdout);
    if (stderr !== undefined) process.stderr.write(stderr);
    process.exitCode = exitCode;
  },
});

export const host = subcommands({
  name: "host",
  description:
    "Inspect the project's hosts/ (FEATURE_UNIFORM_RUNNERS_ENABLED): `check`, `export`.",
  cmds: { check, export: exportCmd },
});
