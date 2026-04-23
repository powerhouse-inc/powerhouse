import { debugArgs } from "@powerhousedao/shared/clis";
import {
  array,
  boolean,
  command,
  flag,
  multioption,
  option,
  optional,
  string,
} from "cmd-ts";
import { Directory } from "cmd-ts/dist/esm/batteries/fs.js";

export const generateAppCmd = command({
  name: "app",
  description: "Generate a drive app",
  args: {
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "The name of the drive app to generate",
    }),
    allowedDocumentTypes: multioption({
      type: optional(array(string)),
      long: "document-types",
      short: "t",
      description: "The document types allowed by the new app",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      short: "d",
      description: "Name of the directory of an existing app to re-generate",
    }),
    disableDragAndDrop: flag({
      type: boolean,
      long: "disable-drag-and-drop",
      description: "Do not allow drag and drop in this drive app.",
      defaultValue: () => true as const,
      defaultValueIsSerializable: true,
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Re-generate all existing apps in the current project",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateApp } = await import("../services/generate-app.js");
    await startGenerateApp(args, process.cwd());
    process.exit(0);
  },
});
