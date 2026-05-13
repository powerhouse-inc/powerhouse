import type {
  CommonGenerateEditorArgs,
  EditorVariableNames,
} from "@powerhousedao/codegen";
import { createOrUpdateManifest } from "file-builders";
import { getEditorVariableNames } from "name-builders";
import path from "path";
import { documentEditorEditorFileTemplate } from "templates";
import { type Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getDocumentTypeMetadata,
  getOrCreateDirectory,
  getOrCreateSourceFile,
} from "utils";
import {
  makeEditorModuleFile,
  makeEditorsFile,
  makeEditorsIndexFile,
} from "./editor-common.js";

type GenerateEditorArgs = CommonGenerateEditorArgs & {
  documentModelId: string;
};
/** Generates a document editor for the given `documentModelId` (also called `documentType`) */
export async function tsMorphGenerateDocumentEditor({
  project,
  editorDir,
  editorName,
  editorId,
  documentModelId,
}: GenerateEditorArgs) {
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  const editorsDirPath = editorsDir.getPath();
  const projectDir = editorsDir.getParentOrThrow().getPath();
  const editorDirPath = path.join(editorsDirPath, editorDir);
  const componentsDirPath = path.join(editorDirPath, "components");

  await ensureDirectoriesExist(
    project,
    documentModelsDirPath,
    editorsDirPath,
    editorDirPath,
    componentsDirPath,
  );
  const documentTypeMetadata = getDocumentTypeMetadata({
    project,
    documentModelId,
  });

  const editorVariableNames = getEditorVariableNames(documentTypeMetadata);

  await makeEditorComponent({
    project,
    editorDirPath,
    ...documentTypeMetadata,
    ...editorVariableNames,
  });

  await makeEditorModuleFile({
    project,
    editorName,
    editorId,
    documentModelId,
    editorDirPath,
  });

  await makeEditorsFile({ project, editorsDirPath });
  await makeEditorsIndexFile({ project, editorsDirPath });
  await createOrUpdateManifest(
    {
      editors: [
        {
          name: editorName,
          id: editorId,
          documentTypes: [documentTypeMetadata.documentModelId],
        },
      ],
    },
    projectDir,
  );
}

type MakeEditorComponentArgs = EditorVariableNames & {
  project: Project;
  editorDirPath: string;
  documentModelDocumentTypeName: string;
  documentModelImportPath: string;
};
async function makeEditorComponent(args: MakeEditorComponentArgs) {
  const { project, editorDirPath } = args;
  const filePath = path.join(editorDirPath, "editor.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) {
    const functionDeclaration = sourceFile.getFunction("Editor");
    if (functionDeclaration) {
      if (!functionDeclaration.isDefaultExport()) {
        functionDeclaration.setIsDefaultExport(true);
      }
      return;
    }
  }

  const template = documentEditorEditorFileTemplate(args);
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}
