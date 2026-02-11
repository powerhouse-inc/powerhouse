import type { Type } from "cmd-ts";
import {
  array,
  boolean,
  flag,
  multioption,
  oneOf,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import type { ProcessorApp, ProcessorApps } from "shared";
import { PROCESSOR_APPS } from "shared";
import { debugArgs, useHygen } from "./common.js";

const ProcessorAppType: Type<string[], ProcessorApps> = {
  from(processorApps) {
    if (processorApps.length === 0) {
      throw new Error(
        `No arguments provided for processor apps. Must be "connect" and/or "switchboard"`,
      );
    }
    if (processorApps.length > 2) {
      throw new Error(
        `Too many arguments provided for processor apps. Must be "connect" and/or "switchboard"`,
      );
    }
    const allowed = new Set(PROCESSOR_APPS);
    if (!processorApps.every((p) => allowed.has(p as ProcessorApp))) {
      throw new Error(
        `Processor apps can only be "connect" and/or "switchboard".`,
      );
    }
    return Promise.resolve(processorApps as ProcessorApps);
  },
};

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
    description: "Document type for the generated document editor.",
  }),
  documentTypes: option({
    type: optional(string),
    long: "document-types",
    description:
      "[DEPRECATED] Comma separated list of document types for the generated document editor. [WARNING] Generated editor code is not set up to handle multiple document types.",
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
  processorApps: multioption({
    long: "processor-apps",
    type: ProcessorAppType,
    description: "The apps where the generated processor will run",
    defaultValue: () => ["switchboard" as const],
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
  useHygen,
  useVersioning: flag({
    type: boolean,
    long: "use-versioning",
    description: "Allow upgrading document models with versioning.",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  ...debugArgs,
};
