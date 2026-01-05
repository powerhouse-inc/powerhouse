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
import { documentEditorModuleFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/document-editor/module.js";
import { pascalCase } from "change-case";
import path from "path";
import type { Project } from "ts-morph";
import { makeEditorsModulesFile } from "./editor-common.js";
type GenerateEditorArgs = CommonGenerateEditorArgs & {
  documentModelId: string;
};
export function tsMorphGenerateEditor({
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
export function makeEditorComponent(args: MakeEditorComponentArgs) {
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

type MakeEditorModuleFileArgs = {
  project: Project;
  editorName: string;
  editorId: string;
  documentModelId?: string;
  editorDirPath: string;
  legacyMultipleDocumentTypes?: string[];
};
export function makeEditorModuleFile({
  project,
  editorDirPath,
  editorName,
  documentModelId,
  editorId,
  legacyMultipleDocumentTypes,
}: MakeEditorModuleFileArgs) {
  if (documentModelId && !!legacyMultipleDocumentTypes) {
    throw new Error(
      "Cannot specify both documentModelId and legacyMultipleDocumentTypes",
    );
  }
  const filePath = path.join(editorDirPath, "module.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText("");

  const pascalCaseEditorName = pascalCase(editorName);
  const documentTypes = documentModelId
    ? `["${documentModelId}"]`
    : JSON.stringify(legacyMultipleDocumentTypes);

  const template = documentEditorModuleFileTemplate({
    editorName,
    editorId,
    pascalCaseEditorName,
    documentTypes,
  });
  sourceFile.replaceWithText(template);
  project.saveSync();
}
