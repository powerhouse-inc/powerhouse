import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, option, optional, string } from "cmd-ts";
import { Directory, File } from "../utils/fs-args.js";
export const generateDocumentModelCmd = command({
  name: "document-model",
  aliases: ["doc"],
  description: "Generate a document model",
  args: {
    document: option({
      type: optional(File),
      long: "document",
      short: "d",
      description:
        "Path to a document model spec (.phd or .json) to generate from",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      description:
        "Name of the directory of an existing document model to re-generate",
    }),
    all: flag({
      long: "all",
      short: "a",
      description:
        "Re-generate all existing document models in the current project",
    }),
    extract: flag({
      long: "extract",
      short: "x",
      description:
        "Write a powerhouse/document-model spec for each existing document model into specs/document-models/",
    }),
    codeFirst: option({
      type: optional(string),
      long: "code-first",
      description:
        "Create a new code-first document model with this name, declared in TypeScript and registered in definitionSources and powerhouse.manifest.json",
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
