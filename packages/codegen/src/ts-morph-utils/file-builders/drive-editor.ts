import type { CommonGenerateEditorArgs } from "@powerhousedao/codegen/ts-morph";
import {
  buildTsMorphProject,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/ts-morph";

import { createDocumentFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/components/CreateDocument.js";
import { driveEditorDriveContentsFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/components/DriveContents.js";
import { driveExplorerFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/components/DriveExplorer.js";
import { emptyStateFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/components/EmptyState.js";
import { driveEditorFilesFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/components/Files.js";
import { driveEditorFoldersFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/components/Folders.js";
import { folderTreeFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/components/FolderTree.js";
import { driveExplorerNavigationBreadcrumbsFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/components/NavigationBreadcrumbs.js";
import { driveEditorConfigFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/config.js";
import { driveEditorEditorFileTemplate } from "@powerhousedao/codegen/ts-morph/templates/drive-editor/editor.js";
import path from "path";
import { type Project } from "ts-morph";
import { makeEditorModuleFile } from "./editor-common.js";
import { makeEditorsModulesFile } from "./module-files.js";

type GenerateDriveEditorArgs = CommonGenerateEditorArgs & {
  allowedDocumentModelIds: string[];
  isDragAndDropEnabled: boolean;
};
/** Generates a drive editor with the configs for `allowedDocumentModelIds` and `isDragAndDropEnabled` */
export function tsMorphGenerateDriveEditor({
  projectDir,
  editorDir,
  editorName,
  editorId,
  allowedDocumentModelIds,
  isDragAndDropEnabled,
}: GenerateDriveEditorArgs) {
  const documentModelsSourceFilesPath = path.join(
    projectDir,
    "document-models/**/*",
  );
  const editorsDirPath = path.join(projectDir, "editors");
  const editorSourceFilesPath = path.join(editorsDirPath, "/**/*");
  const editorDirPath = path.join(editorsDirPath, editorDir);
  const editorComponentsDirPath = path.join(editorDirPath, "components");

  const project = buildTsMorphProject(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  makeNavigationBreadcrumbsFile({
    project,
    editorComponentsDirPath,
  });

  makeCreateDocumentFile({
    project,
    editorComponentsDirPath,
  });

  makeEmptyStateFile({
    project,
    editorComponentsDirPath,
  });

  makeFoldersFile({
    project,
    editorComponentsDirPath,
  });

  makeFolderTreeFile({
    project,
    editorComponentsDirPath,
  });

  makeFilesFile({
    project,
    editorComponentsDirPath,
  });

  makeDriveExplorerFile({
    project,
    editorComponentsDirPath,
  });

  makeDriveContentsFile({
    project,
    editorComponentsDirPath,
  });

  makeDriveEditorComponent({
    project,
    editorDirPath,
  });

  makeDriveEditorConfigFile({
    project,
    allowedDocumentModelIds,
    isDragAndDropEnabled,
    editorDirPath,
  });

  makeEditorModuleFile({
    project,
    editorName,
    editorId,
    editorDirPath,
    documentModelId: "powerhouse/document-drive",
  });

  makeEditorsModulesFile(project, projectDir);

  project.saveSync();
}

type MakeDriveEditorComponentArgs = {
  project: Project;
  editorDirPath: string;
};
function makeDriveEditorComponent({
  project,
  editorDirPath,
}: MakeDriveEditorComponentArgs) {
  const filePath = path.join(editorDirPath, "editor.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) {
    const editorFunction = sourceFile.getFunction("Editor");
    if (editorFunction) {
      if (!editorFunction.isDefaultExport()) {
        editorFunction.setIsDefaultExport(true);
      }
      return;
    }
  }
  const template = driveEditorEditorFileTemplate();
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

type MakeDriveEditorConfigFileArgs = {
  project: Project;
  editorDirPath: string;
  allowedDocumentModelIds: string[];
  isDragAndDropEnabled: boolean;
};
function makeDriveEditorConfigFile({
  project,
  editorDirPath,
  allowedDocumentModelIds,
  isDragAndDropEnabled,
}: MakeDriveEditorConfigFileArgs) {
  const filePath = path.join(editorDirPath, "config.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  const allowedDocumentTypesString = JSON.stringify(allowedDocumentModelIds);
  const isDragAndDropEnabledString = isDragAndDropEnabled ? "true" : "false";

  const template = driveEditorConfigFileTemplate({
    isDragAndDropEnabledString,
    allowedDocumentTypesString,
  });
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

type MakeDriveContentsFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
function makeDriveContentsFile({
  project,
  editorComponentsDirPath,
}: MakeDriveContentsFileArgs) {
  const filePath = path.join(editorComponentsDirPath, "DriveContents.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  const template = driveEditorDriveContentsFileTemplate();
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

type MakeNavigationBreadcrumbsFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};

function makeNavigationBreadcrumbsFile({
  project,
  editorComponentsDirPath,
}: MakeNavigationBreadcrumbsFileArgs) {
  const filePath = path.join(
    editorComponentsDirPath,
    "NavigationBreadcrumbs.tsx",
  );
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(driveExplorerNavigationBreadcrumbsFileTemplate());
  formatSourceFileWithPrettier(sourceFile);
}

type MakeFoldersFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
function makeFoldersFile({
  project,
  editorComponentsDirPath,
}: MakeFoldersFileArgs) {
  const foldersFilePath = path.join(editorComponentsDirPath, "Folders.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    foldersFilePath,
  );

  if (alreadyExists) return;

  const template = driveEditorFoldersFileTemplate();
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

type MakeFilesFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
function makeFilesFile({
  project,
  editorComponentsDirPath,
}: MakeFilesFileArgs) {
  const filesFilePath = path.join(editorComponentsDirPath, "Files.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filesFilePath,
  );

  if (alreadyExists) return;

  const template = driveEditorFilesFileTemplate();
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

type MakeDriveExplorerFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
function makeDriveExplorerFile({
  project,
  editorComponentsDirPath,
}: MakeDriveExplorerFileArgs) {
  const filePath = path.join(editorComponentsDirPath, "DriveExplorer.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(driveExplorerFileTemplate);
  formatSourceFileWithPrettier(sourceFile);
}

type MakeFolderTreeFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
function makeFolderTreeFile({
  project,
  editorComponentsDirPath,
}: MakeFolderTreeFileArgs) {
  const filePath = path.join(editorComponentsDirPath, "FolderTree.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(folderTreeFileTemplate);
  formatSourceFileWithPrettier(sourceFile);
}

type MakeEmptyStateFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
function makeEmptyStateFile({
  project,
  editorComponentsDirPath,
}: MakeEmptyStateFileArgs) {
  const filePath = path.join(editorComponentsDirPath, "EmptyState.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(emptyStateFileTemplate);
  formatSourceFileWithPrettier(sourceFile);
}

type MakeCreateDocumentFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
function makeCreateDocumentFile({
  project,
  editorComponentsDirPath,
}: MakeCreateDocumentFileArgs) {
  const filePath = path.join(editorComponentsDirPath, "CreateDocument.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(createDocumentFileTemplate);
  formatSourceFileWithPrettier(sourceFile);
}
