import { debugArgs } from "@powerhousedao/shared/clis/args";
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
import { Directory, File } from "cmd-ts/dist/cjs/batteries/fs.js";

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
    document: option({
      type: optional(File),
      long: "document",
      short: "d",
      description:
        "Path to a powerhouse/app spec file (.phd or .json) to drive codegen",
    }),
    dir: option({
      type: optional(Directory),
      long: "dir",
      description: "Name of the directory of an existing app to re-generate",
    }),
    disableDragAndDrop: flag({
      type: boolean,
      long: "disable-drag-and-drop",
      description: "Do not allow drag and drop in this drive app.",
      defaultValue: () => false as const,
      defaultValueIsSerializable: true,
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Re-generate all existing apps in the current project",
    }),
    extract: flag({
      long: "extract",
      short: "x",
      description:
        "Write a powerhouse/app spec for each existing drive app into specs/apps/",
    }),
    ...debugArgs,
  },
  handler: async (args) => {
    const { startGenerateApp } = await import("../services/generate-app.js");
    await startGenerateApp(args, process.cwd());
    process.exit(0);
  },
});
