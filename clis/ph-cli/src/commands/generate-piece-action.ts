import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, oneOf, option, optional, positional, string } from "cmd-ts";
import { skipInstallArgs } from "../utils/install-added-dependencies.js";

export const generatePieceActionCmd = command({
  name: "piece-action",
  description: "Generate an action inside an existing piece",
  args: {
    namePositional: positional({
      type: optional(string),
      displayName: "name",
      description: "The name of the action, e.g. get-record",
    }),
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "The name of the action to generate",
    }),
    piece: option({
      type: optional(string),
      long: "piece",
      short: "p",
      description:
        "The piece directory under pieces/ to add the action to. Optional when the project ships exactly one piece.",
    }),
    requireReactor: option({
      type: optional(oneOf(["read", "write"] as const)),
      long: "require-reactor",
      description:
        "Declare reactor access for the action: read, or write (which includes read). The action then gets context.reactor",
    }),
    ...skipInstallArgs,
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGeneratePieceAction } =
      await import("../services/generate-piece-action.js");
    await startGeneratePieceAction(args, process.cwd());
    process.exit(0);
  },
});
