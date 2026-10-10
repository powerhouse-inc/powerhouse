import { subgraphInspectArgs } from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";
import { failedToRun } from "./model.js";

export const subgraphInspect = command({
  name: "inspect",
  description: `Print the exact structured definition of one compiled subgraph.

  ph subgraph inspect <name> --json

Writes nothing, constructs no host, and calls no resolver factory. The envelope
is canonical JSON, so you can diff the output of two releases.`,
  args: subgraphInspectArgs,
  handler: async (args) => {
    if (args.debug) {
      console.error(args);
    }
    const { runSubgraphInspect } = await import("../services/model-inspect.js");
    process.exit(await runSubgraphInspect(args).catch(failedToRun));
  },
});

export const subgraph = subcommands({
  name: "subgraph",
  description:
    "Read this package's compiled subgraph definitions. Use with `inspect`.",
  cmds: { inspect: subgraphInspect },
});
