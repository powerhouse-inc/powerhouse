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
import type { GenerateArgs } from "../types.js";

export async function startGenerate(options: GenerateArgs) {
  const config = getConfig();
  const { skipFormat } = config;
  const {
    documentModelFilePositional,
    documentModelFileOption,
    editorName,
    editorId,
    documentType,
    // [DEPRECATED] - should be removed asap
    documentTypes,
    editorDirName,
    driveEditorName,
    driveEditorId,
    driveEditorDirName,
    allowedDocumentTypes,
    disableDragAndDrop,
    processorName,
    processorType,
    importScriptName,
    migrationFile,
    schemaFile,
    verbose,
    force,
    useVersioning,
    useHygen,
    subgraphName,
  } = options;

  const documentModelFile =
    documentModelFilePositional ?? documentModelFileOption;

  const useTsMorph = useVersioning || !useHygen;
  const isDragAndDropEnabled = disableDragAndDrop !== true;
  const specifiedPackageName = undefined;
  const filePath = Array.isArray(documentModelFile)
    ? documentModelFile.join(" ")
    : documentModelFile;

  if (editorName !== undefined) {
    const documentTypeFromDocumentTypes = documentTypes?.split(",")[0];
    if (documentTypes) {
      console.warn(
        `[WARNING] --document-types is deprecated. Generated editor code is not set up to use multiple document types. Using the first document type in the list you specified (${documentTypeFromDocumentTypes})`,
      );
    }
    const documentTypeToUse = documentType ?? documentTypeFromDocumentTypes;
    if (!documentTypeToUse) {
      throw new Error(
        "Please specify a document type for the generated editor.",
      );
    }
    await generateEditor({
      editorName,
      editorId,
      editorDirName,
      documentTypes: [documentTypeToUse],
      useTsMorph,
      skipFormat,
      specifiedPackageName,
    });
  } else if (driveEditorName !== undefined) {
    await generateDriveEditor({
      driveEditorName,
      driveEditorId,
      driveEditorDirName,
      allowedDocumentTypes,
      isDragAndDropEnabled,
      useTsMorph,
      skipFormat,
      specifiedPackageName,
    });
  } else if (processorName !== undefined) {
    await generateProcessor(
      processorName,
      processorType,
      [documentType].filter((dt) => dt !== undefined),
      skipFormat,
    );
  } else if (subgraphName !== undefined) {
    await generateSubgraph(subgraphName, filePath || null, config, {
      verbose,
      force,
    });
  } else if (importScriptName !== undefined) {
    await generateImportScript(importScriptName, config);
    return;
  } else if (migrationFile !== undefined) {
    await generateDBSchema({
      migrationFile: path.join(process.cwd(), migrationFile),
      schemaFile: schemaFile ? path.join(process.cwd(), schemaFile) : undefined,
    });
  } else if (filePath !== undefined) {
    await generateFromFile({
      path: filePath,
      config,
      useTsMorph,
      options,
      useVersioning,
    });
  } else {
    await generateCode(config, useTsMorph, useVersioning);
  }
}
