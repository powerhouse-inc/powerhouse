import { Command } from "commander";
import {
  getConfig,
  generate as generateCode,
  generateEditor,
  generateFromFile,
  promptDirectories,
} from "@powerhousedao/codegen";
import { CommandActionType } from "../types.js";

export const generate: CommandActionType<
  [
    string | undefined,
    {
      interactive?: boolean;
      editors?: string;
      documentModels?: string;
      skipFormat?: boolean;
      watch?: boolean;
      editor?: string;
      documentTypes?: string;
    },
  ]
> = async (filePath, options) => {
  const baseConfig = getConfig();

  const config = {
    ...baseConfig,
    ...{
      ...(options.editors && { editorsDir: options.editors }),
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
      config,
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
    .option("--document-models <type>", "Path to the document models directory")
    .option("--document-types <type>", "Supported document types by the editor")
    .option("-sf, --skip-format", "Skip formatting the generated code")
    .option("-w, --watch", "Watch the generated code")
    .action(generate);
}
