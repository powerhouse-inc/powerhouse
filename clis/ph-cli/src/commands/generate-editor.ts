import { debugArgs } from "@powerhousedao/shared/clis";
import { command, flag, option, optional, string } from "cmd-ts";
import { Directory } from "cmd-ts/dist/esm/batteries/fs.js";

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
    dir: option({
      type: optional(Directory),
      long: "dir",
      short: "d",
      description: "Name of the directory of an existing editor to re-generate",
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Re-generate all existing editors in the current project",
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
