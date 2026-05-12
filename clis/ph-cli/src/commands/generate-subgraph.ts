import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, option, optional, string } from "cmd-ts";
import { Directory, File } from "cmd-ts/dist/cjs/batteries/fs.js";

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
    document: option({
      type: optional(File),
      long: "document",
      short: "d",
      description:
        "Path to a powerhouse/subgraph spec file (.phd or .json) to drive codegen",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      description:
        "Name of the directory of an existing subgraph to re-generate",
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Re-generate all existing subgraphs in the current project",
    }),
    extract: flag({
      long: "extract",
      short: "x",
      description:
        "Write a powerhouse/subgraph spec for each existing subgraph into specs/subgraphs/",
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
