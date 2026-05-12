import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, option, optional, string } from "cmd-ts";
import { Directory, File } from "cmd-ts/dist/cjs/batteries/fs.js";

export const generateEditorCmd = command({
  name: "editor",
  description: "Generate a document editor",
  args: {
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "The name of the document editor to generate",
    }),
    documentType: option({
      type: optional(string),
      long: "document-type",
      short: "t",
      description: "The document type for the new editor",
    }),
    document: option({
      type: optional(File),
      long: "document",
      short: "d",
      description:
        "Path to a powerhouse/document-editor spec file (.phd or .json) to drive codegen",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      description: "Name of the directory of an existing editor to re-generate",
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Re-generate all existing editors in the current project",
    }),
    extract: flag({
      long: "extract",
      short: "x",
      description:
        "Write a powerhouse/document-editor spec for each existing editor into specs/editors/",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateEditor } =
      await import("../services/generate-editor.js");
    await startGenerateEditor(args, process.cwd());
    process.exit(0);
  },
});
