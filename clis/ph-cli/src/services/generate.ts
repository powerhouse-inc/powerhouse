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
  specifiedPackageName?: string;
  editor?: string;
  editorId?: string;
  editorDirName?: string;
  processor?: string;
  documentTypes?: string;
  allowedDocumentTypes?: string;
  isDragAndDropEnabled?: boolean;
  processorType?: "analytics" | "relationalDb";
  subgraph?: string;
  importScript?: string;
  file?: string;
  driveEditor?: string;
  driveEditorAppId?: string;
  driveEditorDirName?: string;
  migrationFile?: string;
  schemaFile?: string;
  tsMorph?: boolean;
  useVersioning?: boolean;
};

export async function startGenerate(
  filePath: string | undefined,
  options: GenerateOptions,
) {
  const baseConfig = getConfig();
  const useVersioning = !!options.useVersioning;
  const legacy = useVersioning || !options.tsMorph;
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
      legacy,
      useVersioning,
    },
  };

  const command = {
    specifiedPackageName: options.specifiedPackageName,
    editor: !!options.editor,
    editorName: options.editor,
    editorId: options.editorId,
    editorDirName: options.editorDirName,
    documentTypes: options.documentTypes,
    allowedDocumentTypes: options.allowedDocumentTypes,
    processor: !!options.processor,
    processorName: options.processor,
    processorType: options.processorType,
    subgraph: !!options.subgraph,
    subgraphName: options.subgraph,
    importScript: !!options.importScript,
    importScriptName: options.importScript,
    driveEditor: !!options.driveEditor,
    driveEditorName: options.driveEditor,
    driveEditorAppId: options.driveEditorAppId,
    driveEditorDirName: options.driveEditorDirName,
    isDragAndDropEnabled: options.isDragAndDropEnabled,
    migrationFile: options.migrationFile,
    schemaFile: options.schemaFile,
    legacy,
    useVersioning,
  };

  if (command.driveEditor) {
    if (!command.driveEditorName) {
      throw new Error("Drive editor name is required (--drive-editor or -d)");
    }
    await generateDriveEditor({
      config,
      name: command.driveEditorName,
      appId: command.driveEditorAppId,
      allowedDocumentTypes: command.allowedDocumentTypes,
      isDragAndDropEnabled: command.isDragAndDropEnabled,
      driveEditorDirName: command.driveEditorDirName,
      legacy,
    });
  } else if (command.editor) {
    if (!command.editorName) {
      throw new Error("Editor name is required (--editor or -e)");
    }
    await generateEditor({
      name: command.editorName,
      documentTypes: command.documentTypes?.split(/[|,;]/g) ?? [],
      config: config,
      editorId: command.editorId,
      specifiedPackageName: command.specifiedPackageName,
      editorDirName: command.editorDirName,
      legacy,
    });
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
    await generateFromFile({
      path: filePath,
      config,
      legacy,
      options,
      useVersioning,
    });
  } else {
    await generateCode(config, legacy, useVersioning);
  }
}
