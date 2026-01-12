import {
  array,
  boolean,
  command,
  flag,
  multioption,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import type { GenerateOptions } from "../services/generate.js";

export const generateArgs = {
  documentModelFilePositional: positional({
    type: optional(string),
    displayName: "document model file path",
    description: "Path to the document model file",
  }),
  documentModelFileOption: option({
    type: optional(string),
    long: "file",
    description: "Path to the document model file",
  }),
  editor: option({
    type: optional(string),
    long: "editor",
    description: "Editor name",
  }),
  driveEditor: option({
    type: optional(string),
    long: "drive-editor",
    description: "Drive editor name",
  }),
  processor: option({
    type: optional(string),
    long: "processor",
    description: "Processor name",
  }),
  subgraph: option({
    type: optional(string),
    long: "subgraph",
    description: "Subgraph name",
  }),
  importScript: option({
    type: optional(string),
    long: "import-script",
    description: "Import script name",
  }),
  allowedDocumentTypes: multioption({
    type: optional(array(string)),
    long: "allowed-document-types",
    description: "Supported document types for a drive editor",
  }),
  migrationFile: option({
    type: optional(string),
    long: "migration-file",
    description: "Path to the migration file",
  }),
  force: flag({
    type: optional(boolean),
    long: "force",
    short: "f",
    description: "Overwrite operation reducers",
  }),
  watch: flag({
    type: optional(boolean),
    long: "watch",
    short: "w",
    description: "Watch the generated code",
  }),
  skipFormat: flag({
    type: optional(boolean),
    long: "skip-format",
    short: "sf",
    description: "Skip formatting the generated code",
  }),
  useHygen: flag({
    type: optional(boolean),
    long: "use-hygen",
    description: "Use legacy hygen codegen",
  }),
  useVersioning: flag({
    type: optional(boolean),
    long: "use-versioning",
    description: "Allow upgrading document models with versioning",
  }),
};

const generate = command({
  name: "generate",
  description: "Generate powerhouse code.",
  args: generateArgs,
  handler: async ({
    documentModelFilePositional,
    documentModelFileOption,
    allowedDocumentTypes,
    ...options
  }) => {
    const documentModelFilePath =
      documentModelFilePositional ?? documentModelFileOption;
    const resolvedPath = Array.isArray(documentModelFilePath)
      ? documentModelFilePath.join(" ")
      : documentModelFilePath;
    const { startGenerate } = await import("../services/generate.js");
    return await startGenerate(resolvedPath, {
      ...options,
      allowedDocumentTypes: allowedDocumentTypes?.join(" "),
    });
  },
});
