import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, option, optional, string } from "cmd-ts";
import { Directory } from "cmd-ts/dist/cjs/batteries/fs.js";

export const generateSubgraphCmd = command({
  name: "subgraph",
  description: "Generate a subgraph",
  args: {
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "The name of the subgraph to generate",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      short: "d",
      description:
        "Name of the directory of an existing subgraph to re-generate",
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Re-generate all existing subgraphs in the current project",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateSubgraph } =
      await import("../services/generate-subgraph.js");
    await startGenerateSubgraph(args, process.cwd());
    process.exit(0);
  },
});
