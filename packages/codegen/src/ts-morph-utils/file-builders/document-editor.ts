import type {
  CommonGenerateEditorArgs,
  EditorVariableNames,
} from "@powerhousedao/codegen/ts-morph";
import {
  buildTsMorphProject,
  formatSourceFileWithPrettier,
  getDocumentTypeMetadata,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/ts-morph";
import { getEditorVariableNames } from "@powerhousedao/codegen/ts-morph/name-builders";
import { documentEditorEditorFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/document-editor/editor.js";
import path from "path";
import type { Project } from "ts-morph";
import { makeEditorModuleFile } from "./editor-common.js";
import { makeEditorsModulesFile } from "./module-files.js";

type GenerateEditorArgs = CommonGenerateEditorArgs & {
  documentModelId: string;
};
/** Generates a document editor for the given `documentModelId` (also called `documentType`) */
export function tsMorphGenerateDocumentEditor({
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
  const editorSourceFilesPath = path.join(editorsDirPath, "/**/*");
  const documentModelsSourceFilesPath = path.join(
    documentModelsDirPath,
    "/**/*",
  );

  const project = buildTsMorphProject(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  const documentTypeMetadata = getDocumentTypeMetadata({
    project,
    packageName,
    documentModelId,
    documentModelsDirPath,
  });

  const editorVariableNames = getEditorVariableNames(documentTypeMetadata);

  makeEditorComponent({
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

  project.saveSync();
}

type MakeEditorComponentArgs = EditorVariableNames & {
  project: Project;
  editorDirPath: string;
  documentModelDocumentTypeName: string;
  documentModelImportPath: string;
};
function makeEditorComponent(args: MakeEditorComponentArgs) {
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
  formatSourceFileWithPrettier(sourceFile);
}
