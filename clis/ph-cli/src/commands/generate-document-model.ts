import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, number, option, optional, string } from "cmd-ts";
import { Directory, File } from "cmd-ts/dist/cjs/batteries/fs.js";
export const generateDocumentModelCmd = command({
  name: "document-model",
  aliases: ["doc"],
  description: "Generate a document model",
  args: {
    codeFirst: flag({
      long: "code-first",
      description: "Create an authored TypeScript document-model scaffold",
    }),
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "Human-readable name for a code-first document model",
    }),
    id: option({
      type: optional(string),
      long: "id",
      description:
        "Document type ID for a code-first model, for example acme/invoice",
    }),
    extension: option({
      type: optional(string),
      long: "extension",
      description: "File extension recorded by the code-first model",
    }),
    version: option({
      type: optional(number),
      long: "version",
      short: "v",
      description:
        "Version to scaffold; versions after v1 copy the previous authored tree",
    }),
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
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateDocumentModel } =
      await import("../services/generate-document-model.js");
    await startGenerateDocumentModel(args, process.cwd());
    process.exit(0);
  },
});
