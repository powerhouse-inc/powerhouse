import { boolean, flag, optional, positional, string } from "cmd-ts";

// Mirrors clis/ph-cli/src/commands/run.ts — the uniform-runners entry point.
// Kept here so ph-cmd's help/dispatch (phCliHelpCommands) can describe it;
// the command itself stays flag-gated in ph-cli (FEATURE_UNIFORM_RUNNERS_ENABLED).
export const runArgs = {
  host: positional({
    type: string,
    displayName: "host",
    description: "the host to run (a directory under hosts/)",
  }),
  verb: positional({
    type: optional(string),
    displayName: "verb",
    description: "optional verb the runner forwards (dev, build, serve, …)",
  }),
  debug: flag({
    type: optional(boolean),
    long: "debug",
    description: "verbose runner diagnostics",
  }),
};
