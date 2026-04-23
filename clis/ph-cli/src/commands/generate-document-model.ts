import { debugArgs } from "@powerhousedao/shared/clis";
import { command, flag, option, optional } from "cmd-ts";
import { Directory, File } from "cmd-ts/dist/cjs/batteries/fs.js";
export const generateDocumentModelCmd = command({
  name: "document-model",
  aliases: ["doc"],
  description: "Generate a document model",
  args: {
    file: option({
      type: optional(File),
      long: "file",
      short: "f",
      description: "Path to the file to generate the document model from",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      short: "d",
      description:
        "Name of the directory of an existing document model to re-generate",
    }),
    all: flag({
      long: "all",
      short: "a",
      description:
        "Re-generate all existing document models in the current project",
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
