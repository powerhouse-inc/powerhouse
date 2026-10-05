import { scalarInspectArgs } from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

export const scalarInspect = command({
  name: "inspect",
  description: `Print the installed catalog's entry for one scalar: its definition, its digest,
and where its coercion came from.

  ph scalar inspect <name> --json

Reads the compiler's own catalog, so it needs no package and no config.`,
  args: scalarInspectArgs,
  handler: async (args) => {
    if (args.debug) {
      console.error(args);
    }
    const { runScalarInspect } = await import("../services/model-inspect.js");
    process.exit(runScalarInspect(args));
  },
});

export const scalar = subcommands({
  name: "scalar",
  description: "Read the compiler-owned scalar catalog. Use with `inspect`.",
  cmds: { inspect: scalarInspect },
});
