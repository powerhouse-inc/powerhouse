import type { DocumentModelFilePaths, EditorFilePaths } from "../types.js";
import {
  buildDocumentModelsDirPath,
  buildDocumentModelsSourceFilesPath,
} from "./document-model-files.js";
import {
  buildDriveContentsFilePath,
  buildEditDocumentNameComponentFilePath,
  buildEditorComponentsDirPath,
  buildEditorConfigFilePath,
  buildEditorFilePath,
  buildEditorModuleFilePath,
  buildEditorSourceFilesPath,
  buildEditorsDirPath,
} from "./editor-files.js";

export function getDocumentModelFilePaths(
  projectDir: string,
): DocumentModelFilePaths {
  return {
    documentModelsSourceFilesPath:
      buildDocumentModelsSourceFilesPath(projectDir),
    documentModelsDirPath: buildDocumentModelsDirPath(projectDir),
  };
}

export function getEditorFilePaths(
  projectDir: string,
  editorDir: string,
): EditorFilePaths {
  return {
    editorSourceFilesPath: buildEditorSourceFilesPath(projectDir),
    editorsDirPath: buildEditorsDirPath(projectDir),
    editorFilePath: buildEditorFilePath(projectDir, editorDir),
    editorModuleFilePath: buildEditorModuleFilePath(projectDir, editorDir),
    editDocumentNameComponentFilePath: buildEditDocumentNameComponentFilePath(
      projectDir,
      editorDir,
    ),
    editorComponentsDirPath: buildEditorComponentsDirPath(
      projectDir,
      editorDir,
    ),
    editorConfigFilePath: buildEditorConfigFilePath(projectDir, editorDir),
    driveContentsFilePath: buildDriveContentsFilePath(projectDir, editorDir),
  };
}
