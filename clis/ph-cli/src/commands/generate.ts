import {
  generate as generateCode,
  generateEditor,
  generateFromFile,
  generateImportScript,
  generateProcessor,
  generateSubgraph,
} from "@powerhousedao/codegen";
import { getConfig } from "@powerhousedao/config/powerhouse";
import { Command } from "commander";
import { CommandActionType } from "../types.js";

export const generate: CommandActionType<
  [
    string | undefined,
    {
      interactive?: boolean;
      editors?: string;
      processors?: string;
      documentModels?: string;
      skipFormat?: boolean;
      watch?: boolean;
      editor?: string;
      processor?: string;
      documentTypes?: string;
      processorType?: "analytics" | "operational";
      subgraph?: string;
      importScript?: string;
      file?: string;
    },
  ]
> = async (filePath, options) => {
  const baseConfig = getConfig();

  const config = {
    ...baseConfig,
    ...{
      ...(options.editors && { editorsDir: options.editors }),
      ...(options.processors && { processorsDir: options.processors }),
      ...(options.documentModels && {
        documentModelsDir: options.documentModels,
      }),
      ...(options.skipFormat && { skipFormat: options.skipFormat }),
      ...(options.interactive && { interactive: options.interactive }),
      ...(options.watch && { watch: options.watch }),
    },
  };

  const command = {
    editor: !!options.editor,
    editorName: options.editor,
    documentTypes: options.documentTypes,
    processor: !!options.processor,
    processorName: options.processor,
    processorType: options.processorType,
    subgraph: !!options.subgraph,
    subgraphName: options.subgraph,
    importScript: !!options.importScript,
    importScriptName: options.importScript,
  };

  if (command.editor) {
    if (!command.editorName) {
      throw new Error("Editor name is required (--editor or -e)");
    }
    await generateEditor(
      command.editorName,
      command.documentTypes?.split(/[|,;]/g) ?? [],
      config,
    );
  } else if (command.processor && options.processor) {
    const processorType =
      options.processorType === "operational" ? "operational" : "analytics";
    await generateProcessor(
      options.processor,
      processorType,
      options.documentTypes?.split(",") ?? [],
      config,
    );
  } else if (command.subgraph && command.subgraphName) {
    await generateSubgraph(command.subgraphName, options.file || null, config);
  } else if (command.importScript && command.importScriptName) {
    await generateImportScript(command.importScriptName, config);
  } else if (filePath) {
    await generateFromFile(filePath, config);
  } else {
    await generateCode(config);
  }
};

export function generateCommand(program: Command) {
  program
    .command("generate")
    .description("Generate code from the document models")
    .argument("[document-model-file]", "Path to the document model file")
    .option("-i, --interactive", "Run the command in interactive mode")
    .option("--editors <type>", "Path to the editors directory")
    .option("-e, --editor <type>", "Editor Name")
    .option("--file <path>", "File path to document model")
    .option("--processors <type>", "Path to the processors directory")
    .option("-p, --processor <type>", "Processor Name")
    .option("--processor-type <type>", "Processor Type")
    .option("-s, --subgraph <type>", "Subgraph Name")
    .option("--document-models <type>", "Path to the document models directory")
    .option("--document-types <type>", "Supported document types by the editor")
    .option("-is, --import-script <type>", "Import Script Name")
    .option("-sf, --skip-format", "Skip formatting the generated code")
    .option("-w, --watch", "Watch the generated code")
    .action(generate);
}
