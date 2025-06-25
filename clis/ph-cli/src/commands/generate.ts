import { type Command } from "commander";
import { generateHelp } from "../help.js";
import { type GenerateOptions } from "../services/generate.js";
import { type CommandActionType } from "../types.js";
import { buildCommand, type CommandOption } from "../utils/command-builder.js";

// Common options shared across all commands
const COMMON_OPTIONS: readonly CommandOption[] = [
  {
    flags: "-i, --interactive",
    description: "Run the command in interactive mode",
  },
  {
    flags: "-sf, --skip-format",
    description: "Skip formatting the generated code",
  },
  { flags: "-w, --watch", description: "Watch the generated code" },
] as const;

// Main generate command options
const MAIN_GENERATE_OPTIONS: readonly CommandOption[] = [
  ...COMMON_OPTIONS,
  {
    flags: "--document-models <type>",
    description: "Path to the document models directory",
  },
  { flags: "--file <path>", description: "File path to document model" },
] as const;

// Editor-specific options
const EDITOR_OPTIONS: readonly CommandOption[] = [
  ...COMMON_OPTIONS,
  {
    flags: "--document-types <type>",
    description: "Supported document types by the editor",
  },
] as const;

// Processor-specific options
const PROCESSOR_OPTIONS: readonly CommandOption[] = [
  ...COMMON_OPTIONS,
  {
    flags: "--document-types <type>",
    description: "Supported document types by the processor",
  },
  {
    flags: "--processor-type <type>",
    description: "Type of processor (analytics or operational)",
    defaultValue: "analytics",
  },
] as const;

// Subgraph-specific options
const SUBGRAPH_OPTIONS: readonly CommandOption[] = [
  ...COMMON_OPTIONS,
  { flags: "--file <path>", description: "File path to document model" },
] as const;

// Import script options (just common options)
const IMPORT_SCRIPT_OPTIONS: readonly CommandOption[] = [
  ...COMMON_OPTIONS,
] as const;

// Drive editor options (just common options)
const DRIVE_EDITOR_OPTIONS: readonly CommandOption[] = [
  ...COMMON_OPTIONS,
] as const;

async function startGenerate(
  filePath: string | undefined,
  options: GenerateOptions,
) {
  const Generate = await import("../services/generate.js");
  const { startGenerate } = Generate;
  return startGenerate(filePath, options);
}

export const generate: CommandActionType<
  [string | undefined, GenerateOptions]
> = async (filePath, options) => {
  return startGenerate(filePath, options);
};

// Subcommand handlers
const generateEditorSubcommand: CommandActionType<
  [string, GenerateOptions]
> = async (editorName, options) => {
  return startGenerate(undefined, { ...options, editor: editorName });
};

const generateSubgraphSubcommand: CommandActionType<
  [string, GenerateOptions]
> = async (subgraphName, options) => {
  return startGenerate(undefined, { ...options, subgraph: subgraphName });
};

const generateProcessorSubcommand: CommandActionType<
  [string, GenerateOptions]
> = async (processorName, options) => {
  return startGenerate(undefined, { ...options, processor: processorName });
};

const generateImportScriptSubcommand: CommandActionType<
  [string, GenerateOptions]
> = async (importScriptName, options) => {
  return startGenerate(undefined, {
    ...options,
    importScript: importScriptName,
  });
};

const generateDriveEditorSubcommand: CommandActionType<
  [string, GenerateOptions]
> = async (driveEditorName, options) => {
  return startGenerate(undefined, { ...options, driveEditor: driveEditorName });
};

export function generateCommand(program: Command) {
  // Main generate command with current pattern support
  const cmd = buildCommand(program, {
    name: "generate",
    description: "Generate code from the document models",
    options: MAIN_GENERATE_OPTIONS,
    argument: {
      name: "[document-model-file]",
      description: "Path to the document model file",
    },
    helpText: generateHelp,
  });

  cmd.action(generate);

  // Add subcommands for the new nested pattern
  const editorCmd = cmd
    .command("editor")
    .description("Generate an editor")
    .argument("<editor-name>", "Name of the editor to generate")
    .action(generateEditorSubcommand);

  const subgraphCmd = cmd
    .command("subgraph")
    .description("Generate a subgraph")
    .argument("<subgraph-name>", "Name of the subgraph to generate")
    .action(generateSubgraphSubcommand);

  const processorCmd = cmd
    .command("processor")
    .description("Generate a processor")
    .argument("<processor-name>", "Name of the processor to generate")
    .action(generateProcessorSubcommand);

  const importScriptCmd = cmd
    .command("import-script")
    .description("Generate an import script")
    .argument("<import-script-name>", "Name of the import script to generate")
    .action(generateImportScriptSubcommand);

  const driveEditorCmd = cmd
    .command("drive-editor")
    .description("Generate a drive editor")
    .argument("<drive-editor-name>", "Name of the drive editor to generate")
    .action(generateDriveEditorSubcommand);

  // Add command-specific options to each subcommand
  EDITOR_OPTIONS.forEach(({ flags, description }) => {
    editorCmd.option(flags, description);
  });

  SUBGRAPH_OPTIONS.forEach(({ flags, description }) => {
    subgraphCmd.option(flags, description);
  });

  PROCESSOR_OPTIONS.forEach(({ flags, description }) => {
    processorCmd.option(flags, description);
  });

  IMPORT_SCRIPT_OPTIONS.forEach(({ flags, description }) => {
    importScriptCmd.option(flags, description);
  });

  DRIVE_EDITOR_OPTIONS.forEach(({ flags, description }) => {
    driveEditorCmd.option(flags, description);
  });
}
