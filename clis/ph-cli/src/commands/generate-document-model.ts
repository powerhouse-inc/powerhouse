import { debugArgs } from "@powerhousedao/shared/clis/args";
import { command, flag, option, optional, string } from "cmd-ts";
import { File, ModuleDir } from "../utils/fs-args.js";
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
    extract: flag({
      long: "extract",
      short: "x",
      description:
        "Write a powerhouse/document-model spec for each existing document model into specs/document-models/",
    }),
    /** @experimental Code-first scaffolding is being tested in production. */
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description:
        "Experimental. Create a code-first document model with this name, with its editor",
    }),
    /** @experimental Opts into the code-first authoring strategy. */
    codeFirst: flag({
      long: "code-first",
      description:
        "Experimental. Generate with code-first authoring, whatever definitionSources in powerhouse.config.json selects",
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
