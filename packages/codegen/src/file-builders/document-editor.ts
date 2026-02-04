import type {
  CommonGenerateEditorArgs,
  EditorVariableNames,
} from "@powerhousedao/codegen";
import { getEditorVariableNames } from "@powerhousedao/codegen/name-builders";
import { documentEditorEditorFileTemplate } from "@powerhousedao/codegen/templates";
import {
  buildTsMorphProject,
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getDocumentTypeMetadata,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import path from "path";
import type { Project } from "ts-morph";
import { makeEditorModuleFile } from "./editor-common.js";
import { makeEditorsModulesFile } from "./module-files.js";

type GenerateEditorArgs = CommonGenerateEditorArgs & {
  documentModelId: string;
};
/** Generates a document editor for the given `documentModelId` (also called `documentType`) */
export async function tsMorphGenerateDocumentEditor({
  packageName,
  projectDir,
  editorDir,
  editorName,
  editorId,
  documentModelId,
}: GenerateEditorArgs) {
  const documentModelsDirPath = path.join(projectDir, "document-models");
  const editorsDirPath = path.join(projectDir, "editors");
  const editorDirPath = path.join(editorsDirPath, editorDir);
  const componentsDirPath = path.join(editorDirPath, "components");
  const editorSourceFilesPath = path.join(editorsDirPath, "/**/*");
  const documentModelsSourceFilesPath = path.join(
    documentModelsDirPath,
    "/**/*",
  );

  const project = buildTsMorphProject(projectDir);
  await ensureDirectoriesExist(
    project,
    documentModelsDirPath,
    editorsDirPath,
    editorDirPath,
    componentsDirPath,
  );
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  const documentTypeMetadata = getDocumentTypeMetadata({
    project,
    packageName,
    documentModelId,
    documentModelsDirPath,
  });

  const editorVariableNames = getEditorVariableNames(documentTypeMetadata);

  await makeEditorComponent({
    project,
    editorDirPath,
    ...documentTypeMetadata,
    ...editorVariableNames,
  });

  makeEditorModuleFile({
    project,
    editorName,
    editorId,
    documentModelId,
    editorDirPath,
  });

  makeEditorsModulesFile(project, projectDir);

  await project.save();
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
