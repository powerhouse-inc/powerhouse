import { Command } from "commander";
import {
  getConfig,
  generate as generateCode,
  generateEditor,
  generateFromFile,
  promptDirectories,
  generateProcessor,
} from "@powerhousedao/codegen";
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
  };

  if (config.interactive) {
    const result = await promptDirectories(config);
    Object.assign(config, result);
  }

  if (command.editor) {
    if (!command.editorName) {
      throw new Error("Editor name is required (--editor or -e)");
    }
    await generateEditor(
      command.editorName,
      command.documentTypes?.split(/[|,;]/g) ?? [],
      config
    );

    return;
  }

  if (command.processor && options.processor) {
    await generateProcessor(
      options.processor,
      options.documentTypes?.split(",") ?? [],
      config
    );
    return;
  }

  if (filePath) {
    await generateFromFile(filePath, config);
    return;
  }

  await generateCode(config);
};

export function generateCommand(program: Command) {
  program
    .command("generate")
    .description("Generate code from the document models")
    .argument("[document-model-file]", "Path to the document model file")
    .option("-i, --interactive", "Run the command in interactive mode")
    .option("--editors <type>", "Path to the editors directory")
    .option("-e, --editor <type>", "Editor Name")
    .option("--processors <type>", "Path to the processors directory")
    .option("-p, --processor <type>", "Processor Name")
    .option("--document-models <type>", "Path to the document models directory")
    .option("--document-types <type>", "Supported document types by the editor")
    .option("-sf, --skip-format", "Skip formatting the generated code")
    .option("-w, --watch", "Watch the generated code")
    .action(generate);
}
