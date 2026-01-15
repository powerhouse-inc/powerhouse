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
    documentModelFile,
    editorName,
    editorId,
    documentType,
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

  const useTsMorph = useVersioning || !useHygen;
  const isDragAndDropEnabled = disableDragAndDrop !== true;
  const specifiedPackageName = undefined;
  const filePath = Array.isArray(documentModelFile)
    ? documentModelFile.join(" ")
    : documentModelFile;

  if (editorName !== undefined) {
    if (!documentType) {
      throw new Error(
        "Please specify a document type for the generated editor.",
      );
    }
    await generateEditor({
      editorName,
      editorId,
      editorDirName,
      documentTypes: [documentType],
      useTsMorph,
      skipFormat,
      specifiedPackageName,
    });
    return;
  }

  if (driveEditorName !== undefined) {
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
    return;
  }

  if (processorName !== undefined) {
    await generateProcessor(
      processorName,
      processorType,
      [documentType].filter((dt) => dt !== undefined),
      skipFormat,
    );
    return;
  }

  if (subgraphName !== undefined) {
    await generateSubgraph(subgraphName, filePath || null, config, {
      verbose,
      force,
    });
    return;
  }

  if (importScriptName !== undefined) {
    await generateImportScript(importScriptName, config);
    return;
  }

  if (migrationFile !== undefined) {
    await generateDBSchema({
      migrationFile: path.join(process.cwd(), migrationFile),
      schemaFile: schemaFile ? path.join(process.cwd(), schemaFile) : undefined,
    });
    return;
  }

  if (filePath !== undefined) {
    await generateFromFile({
      path: filePath,
      config,
      useTsMorph,
      options,
      useVersioning,
    });
    return;
  }

  await generateCode(config, useTsMorph, useVersioning);
}
