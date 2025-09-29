import {
  generate as generateCode,
  generateDBSchema,
  generateDriveEditor,
  generateEditor,
  generateFromFile,
  generateImportScript,
  generateProcessor,
  generateSubgraph,
} from "@powerhousedao/codegen";
import { getConfig } from "@powerhousedao/config/node";
import path from "path";

export type GenerateOptions = {
  interactive?: boolean;
  editors?: string;
  processors?: string;
  documentModels?: string;
  skipFormat?: boolean;
  force?: boolean;
  watch?: boolean;
  editor?: string;
  processor?: string;
  documentTypes?: string;
  processorType?: "analytics" | "relationalDb";
  subgraph?: string;
  importScript?: string;
  file?: string;
  driveEditor?: string;
  migrationFile?: string;
  schemaFile?: string;
};

export async function startGenerate(
  filePath: string | undefined,
  options: GenerateOptions,
) {
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
    driveEditor: !!options.driveEditor,
    driveEditorName: options.driveEditor,
    migrationFile: options.migrationFile,
    schemaFile: options.schemaFile,
  };

  if (command.driveEditor) {
    if (!command.driveEditorName) {
      throw new Error("Drive editor name is required (--drive-editor or -d)");
    }
    await generateDriveEditor(command.driveEditorName, config);
  } else if (command.editor) {
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
      options.processorType === "relationalDb" ? "relationalDb" : "analytics";
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
  } else if (command.migrationFile) {
    const { migrationFile, schemaFile } = command;
    await generateDBSchema({
      migrationFile: path.join(process.cwd(), migrationFile),
      schemaFile: schemaFile ? path.join(process.cwd(), schemaFile) : undefined,
    });
  } else if (filePath) {
    await generateFromFile(filePath, config, { force: options.force });
  } else {
    await generateCode(config);
  }
}
