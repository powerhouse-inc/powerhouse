import {
  array,
  boolean,
  command,
  flag,
  multioption,
  oneOf,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import { startGenerate } from "../services/generate.js";
import { debugArgs } from "./common-args.js";

export const generateArgs = {
  documentModelFilePositional: positional({
    type: optional(string),
    displayName: "document model file path",
    description: "Path to the document model file.",
  }),
  documentModelFileOption: option({
    type: optional(string),
    long: "file",
    description: "Path to the document model file.",
  }),
  editorName: option({
    type: optional(string),
    long: "editor",
    description: "Editor name.",
  }),
  editorId: option({
    type: optional(string),
    long: "editor-id",
    description: "Editor ID",
  }),
  editorDirName: option({
    type: optional(string),
    long: "editor-dir-name",
    description:
      "Use a different directory name for the generated editor. Default is the editor name in kebab case.",
  }),
  documentType: option({
    type: optional(string),
    long: "document-type",
    description: "Document type for the generated code.",
  }),
  driveEditorName: option({
    type: optional(string),
    long: "drive-editor",
    description: "Drive editor name.",
  }),
  driveEditorId: option({
    type: optional(string),
    long: "app-id",
    description: "Drive editor ID.",
  }),
  driveEditorDirName: option({
    type: optional(string),
    long: "drive-editor-dir-name",
    description:
      "Use a different directory name for the generated drive editor. Default is the drive editor name in kebab case.",
  }),
  processorName: option({
    type: optional(string),
    long: "processor",
    description: "Processor name.",
  }),
  processorType: option({
    type: oneOf(["relationalDb", "analytics"] as const),
    long: "processor-type",
    description:
      "Whether to generate an analytics processor or a relational DB processor. Default is analytics.",
    defaultValue: () => "analytics" as const,
    defaultValueIsSerializable: true,
  }),
  subgraphName: option({
    type: optional(string),
    long: "subgraph",
    description: "Subgraph name.",
  }),
  importScriptName: option({
    type: optional(string),
    long: "import-script",
    description: "Import script name.",
  }),
  allowedDocumentTypes: multioption({
    type: optional(array(string)),
    long: "allowed-document-types",
    description: "Supported document types for a drive editor.",
  }),
  migrationFile: option({
    type: optional(string),
    long: "migration-file",
    description: "Path to the migration file.",
  }),
  schemaFile: option({
    type: optional(string),
    long: "schema-file",
    description: "Path to the output file. Defaults to './schema.ts'",
  }),
  disableDragAndDrop: flag({
    type: optional(boolean),
    long: "disable-drag-and-drop",
    description: "Disable drag and drop in the generated drive editor.",
  }),
  force: flag({
    type: optional(boolean),
    long: "force",
    short: "f",
    description: "Overwrite operation reducers.",
  }),
  verbose: flag({
    type: optional(boolean),
    long: "logs",
    description: "Show additional logging information.",
  }),
  watch: flag({
    type: optional(boolean),
    long: "watch",
    short: "w",
    description: "Watch the generated code.",
  }),
  skipFormat: flag({
    type: optional(boolean),
    long: "skip-format",
    short: "sf",
    description: "Skip formatting the generated code.",
  }),
  useHygen: flag({
    type: boolean,
    long: "use-hygen",
    description: "Use legacy hygen codegen.",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  useVersioning: flag({
    type: boolean,
    long: "use-versioning",
    description: "Allow upgrading document models with versioning.",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  ...debugArgs,
};

export const generateDescription = "Generate powerhouse code.";

export const generate = command({
  name: "generate",
  description: `
The generate command creates code from document models. It helps you build editors, 
processors, and other components based on your document model files.

This command:
1. Reads document model definitions
2. Generates code for specified components (editors, processors, etc.)
3. Supports customization of output and generation options
4. Can watch files for changes and regenerate code automatically
`,
  args: generateArgs,
  handler: async (allArgs) => {
    if (
      Object.values(allArgs).filter((value) => value !== undefined).length === 0
    ) {
      console.log(
        "No command arguments specified. Run `ph generate --help` for usage instructions.",
      );
      process.exit(0);
    }
    const {
      documentModelFilePositional,
      documentModelFileOption,
      ...restArgs
    } = allArgs;
    const documentModelFile =
      documentModelFilePositional ?? documentModelFileOption;
    const args = {
      documentModelFile,
      ...restArgs,
    };
    if (args.debug) {
      console.log(args);
    }
    await startGenerate(args);
    return args;
  },
});
