import type { CommonGenerateEditorArgs } from "@powerhousedao/codegen";
import {
  createDocumentFileTemplate,
  driveEditorConfigFileTemplate,
  driveEditorDriveContentsFileTemplate,
  driveEditorEditorFileTemplate,
  driveEditorFilesFileTemplate,
  driveEditorFoldersFileTemplate,
  driveExplorerFileTemplate,
  driveExplorerNavigationBreadcrumbsFileTemplate,
  emptyStateFileTemplate,
  folderTreeFileTemplate,
} from "@powerhousedao/codegen/templates";
import {
  buildTsMorphProject,
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import path from "path";
import { type Project } from "ts-morph";
import { makeEditorModuleFile } from "./editor-common.js";
import { makeEditorsModulesFile } from "./module-files.js";

type GenerateDriveEditorArgs = CommonGenerateEditorArgs & {
  allowedDocumentModelIds: string[];
  isDragAndDropEnabled: boolean;
};
/** Generates a drive editor with the configs for `allowedDocumentModelIds` and `isDragAndDropEnabled` */
export async function tsMorphGenerateDriveEditor({
  projectDir,
  editorDir,
  editorName,
  editorId,
  allowedDocumentModelIds,
  isDragAndDropEnabled,
}: GenerateDriveEditorArgs) {
  const documentModelsDirPath = path.join(projectDir, "document-models");
  const documentModelsSourceFilesPath = path.join(
    documentModelsDirPath,
    "/**/*",
  );
  const editorsDirPath = path.join(projectDir, "editors");
  const editorSourceFilesPath = path.join(editorsDirPath, "/**/*");
  const editorDirPath = path.join(editorsDirPath, editorDir);
  const editorComponentsDirPath = path.join(editorDirPath, "components");

  const project = buildTsMorphProject(projectDir);
  await ensureDirectoriesExist(
    project,
    documentModelsDirPath,
    editorsDirPath,
    editorDirPath,
    editorComponentsDirPath,
  );
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  await makeNavigationBreadcrumbsFile({
    project,
    editorComponentsDirPath,
  });

  await makeCreateDocumentFile({
    project,
    editorComponentsDirPath,
  });

  await makeEmptyStateFile({
    project,
    editorComponentsDirPath,
  });

  await makeFoldersFile({
    project,
    editorComponentsDirPath,
  });

  await makeFolderTreeFile({
    project,
    editorComponentsDirPath,
  });

  await makeFilesFile({
    project,
    editorComponentsDirPath,
  });

  await makeDriveExplorerFile({
    project,
    editorComponentsDirPath,
  });

  await makeDriveContentsFile({
    project,
    editorComponentsDirPath,
  });

  await makeDriveEditorComponent({
    project,
    editorDirPath,
  });

  await makeDriveEditorConfigFile({
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

  await makeEditorsModulesFile(project, projectDir);

  await project.save();
}

type MakeDriveEditorComponentArgs = {
  project: Project;
  editorDirPath: string;
};
async function makeDriveEditorComponent({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeDriveEditorConfigFileArgs = {
  project: Project;
  editorDirPath: string;
  allowedDocumentModelIds: string[];
  isDragAndDropEnabled: boolean;
};
async function makeDriveEditorConfigFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeDriveContentsFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
async function makeDriveContentsFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeNavigationBreadcrumbsFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};

async function makeNavigationBreadcrumbsFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeFoldersFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
async function makeFoldersFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeFilesFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
async function makeFilesFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeDriveExplorerFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
async function makeDriveExplorerFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeFolderTreeFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
async function makeFolderTreeFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeEmptyStateFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
async function makeEmptyStateFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}

type MakeCreateDocumentFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
async function makeCreateDocumentFile({
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
  await formatSourceFileWithPrettier(sourceFile);
}
