import {
  generateApp,
  generateDBSchema,
  generateEditor,
  generateFromFile,
  generateProcessor,
  generateSubgraph,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import path from "path";
import type { GenerateArgs } from "../types.js";

export async function startGenerate(
  options: GenerateArgs,
  projectDir = process.cwd(),
) {
  const {
    documentModelFilePositional,
    documentModelFileOption,
    editorName,
    editorId,
    documentType,
    // [DEPRECATED] - should be removed asap
    documentTypes,
    editorDirName,
    appName,
    appId,
    appDirName,
    allowedDocumentTypes,
    disableDragAndDrop,
    processorName,
    processorType,
    processorApps,
    migrationFile,
    schemaFile,
    subgraphName,
  } = options;
  const project = buildTsMorphProject(projectDir);

  const documentModelFile =
    documentModelFilePositional ?? documentModelFileOption;

  const isDragAndDropEnabled = disableDragAndDrop !== true;
  const filePath = Array.isArray(documentModelFile)
    ? documentModelFile.join(" ")
    : documentModelFile;

  const documentTypeFromDocumentTypes = documentTypes?.split(",")[0];
  if (documentTypes) {
    console.warn(
      `[WARNING] --document-types is deprecated. Generated editor code is not set up to use multiple document types. Using the first document type in the list you specified (${documentTypeFromDocumentTypes})`,
    );
  }
  const documentTypeToUse = documentType ?? documentTypeFromDocumentTypes;

  if (editorName !== undefined) {
    if (!documentTypeToUse) {
      throw new Error(
        "Please specify a document type for the generated editor.",
      );
    }
    await generateEditor(
      {
        editorName,
        editorId,
        editorDirName,
        documentTypes: [documentTypeToUse],
      },
      project,
    );
  } else if (appName !== undefined) {
    await generateApp(
      {
        appName,
        appId,
        appDirName,
        allowedDocumentTypes,
        isDragAndDropEnabled,
      },
      project,
    );
  } else if (processorName !== undefined) {
    await generateProcessor(
      {
        processorName,
        processorType,
        processorApps,
        documentTypes: [documentTypeToUse].filter((t) => t !== undefined),
      },
      project,
    );
  } else if (subgraphName !== undefined) {
    await generateSubgraph(subgraphName, filePath || null, project);
  } else if (migrationFile !== undefined) {
    await generateDBSchema({
      migrationFile: path.join(process.cwd(), migrationFile),
      schemaFile: schemaFile ? path.join(process.cwd(), schemaFile) : undefined,
    });
  } else if (filePath !== undefined) {
    await generateFromFile(filePath, project);
  }
  // calling save once at the end is much faster than saving as we go
  // the ts-morph project already has the updated data for manipulation without saving
  await project.save();
}
