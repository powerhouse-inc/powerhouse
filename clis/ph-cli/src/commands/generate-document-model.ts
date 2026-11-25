import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, option, optional, string } from "cmd-ts";
import { ModuleDir } from "../utils/fs-args.js";
export const generateDocumentModelCmd = command({
  name: "document-model",
  aliases: ["doc"],
  description: "Generate a document model",
  args: {
    dir: option({
      type: optional(ModuleDir),
      long: "dir",
      description:
        "Name of the directory of an existing document model to re-generate (my-document-model or document-models/my-document-model)",
    }),
    all: flag({
      long: "all",
      short: "a",
      description:
        "Re-generate all existing document models in the current project",
    }),
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "Create a document model with this name, with its editor",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateDocumentModel } =
      await import("../services/generate-document-model.js");
    await startGenerateDocumentModel(args, process.cwd());
    process.exit(0);
  },
});
