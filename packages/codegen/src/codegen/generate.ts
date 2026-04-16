import { fileExists } from "@powerhousedao/shared/clis";
import { type DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { ProcessorApps } from "@powerhousedao/shared/processors";
import { kebabCase } from "change-case";
import {
  tsMorphGenerateApp,
  tsMorphGenerateDocumentEditor,
  tsMorphGenerateDocumentModel,
  tsMorphGenerateSubgraph,
} from "file-builders";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { tsMorphGenerateProcessor } from "../file-builders/processors/processor.js";
import { loadDocumentModel } from "./utils.js";

export async function generateAllDocumentModels(projectDir: string) {
  const files = await readdir(projectDir, { withFileTypes: true });
  const documentModelStates: DocumentModelGlobalState[] = [];

  for (const directory of files.filter((f) => f.isDirectory())) {
    const documentModelPath = path.join(
      projectDir,
      "document-models",
      directory.name,
      `${directory.name}.json`,
    );
    const pathExists = await fileExists(documentModelPath);
    if (!pathExists) {
      continue;
    }

    try {
      const documentModelState = await loadDocumentModel(documentModelPath);
      documentModelStates.push(documentModelState);

      await generateDocumentModel(documentModelState, projectDir);
    } catch (error) {
      console.error(directory.name, error);
    }
  }
}

export async function generateFromFile(filePath: string, projectDir: string) {
  // load document model spec from file
  const documentModelState = await loadDocumentModel(filePath);

  // delegate to shared generation function
  await generateDocumentModel(documentModelState, projectDir);
}

export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  projectDir: string,
) {
  await tsMorphGenerateDocumentModel(documentModelState, projectDir);
}

type GenerateEditorArgs = {
  editorName: string;
  documentTypes: string[];
  editorId?: string;
  editorDirName?: string;
};
export async function generateEditor(
  args: GenerateEditorArgs,
  projectDir = process.cwd(),
) {
  const {
    editorName,
    documentTypes,
    editorId: editorIdArg,
    editorDirName,
  } = args;

  if (documentTypes.length > 1) {
    throw new Error("Multiple document types are not supported yet");
  }

  const documentModelId = documentTypes[0];
  const editorId = editorIdArg || kebabCase(editorName);
  const editorDir = editorDirName || kebabCase(editorName);

  await tsMorphGenerateDocumentEditor({
    projectDir,
    editorDir,
    documentModelId,
    editorName,
    editorId,
  });
}

export async function generateApp(
  options: {
    appName: string;
    appId?: string;
    allowedDocumentTypes?: string[];
    isDragAndDropEnabled?: boolean;
    appDirName?: string;
  },
  projectDir = process.cwd(),
) {
  const {
    appName,
    appId,
    allowedDocumentTypes,
    isDragAndDropEnabled,
    appDirName,
  } = options;

  await tsMorphGenerateApp({
    projectDir,
    editorDir: appDirName || kebabCase(appName),
    editorName: appName,
    editorId: appId ?? kebabCase(appName),
    allowedDocumentModelIds: allowedDocumentTypes ?? [],
    isDragAndDropEnabled: isDragAndDropEnabled ?? true,
  });
}

export async function generateSubgraph(
  subgraphName: string,
  documentModelFilePath: string | null,
  projectDir = process.cwd(),
) {
  const documentModelState =
    documentModelFilePath !== null
      ? await loadDocumentModel(documentModelFilePath)
      : null;

  await tsMorphGenerateSubgraph(
    {
      subgraphName,
      documentModel: documentModelState,
    },
    projectDir,
  );
}

export async function generateProcessor(
  args: {
    processorName: string;
    processorType: "analytics" | "relationalDb";
    processorApps: ProcessorApps;
    documentTypes: string[];
  },
  projectDir = process.cwd(),
) {
  return await tsMorphGenerateProcessor({
    projectDir,
    ...args,
  });
}
