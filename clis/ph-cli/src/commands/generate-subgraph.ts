import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, option, optional, string } from "cmd-ts";
import { ModuleDir } from "../utils/fs-args.js";
import { skipInstallArgs } from "../utils/install-added-dependencies.js";

export const generateSubgraphCmd = command({
  name: "subgraph",
  description: "Generate a subgraph",
  args: {
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description:
        "Create a subgraph with this name. A subgraph directory that already exists keeps its form",
    }),
    dir: option({
      type: optional(ModuleDir),
      long: "dir",
      description:
        "Name of the directory of an existing subgraph to re-generate (my-subgraph or subgraphs/my-subgraph)",
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Re-generate all existing subgraphs in the current project",
    }),
    ...skipInstallArgs,
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateSubgraph } =
      await import("../services/generate-subgraph.js");
    await startGenerateSubgraph(args, process.cwd());
    process.exit(0);
  },
});
