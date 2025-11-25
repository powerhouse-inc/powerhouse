import type { Project } from "ts-morph";
import {
  buildNodePrinter,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../file-utils.js";
import {
  getDocumentModelFilePaths,
  getEditorFilePaths,
} from "../name-builders/get-file-paths.js";
import {
  buildFunctionCall,
  buildJsxSpreadAttribute,
  buildReturn,
  buildSelfClosingJsxElement,
} from "../syntax-builders.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import { makeEditorModuleFile } from "./document-editor.js";
import { makeEditorsModulesFile } from "./editor-common.js";
import type { CommonGenerateEditorArgs } from "./types.js";

type GenerateDriveEditorArgs = CommonGenerateEditorArgs & {
  allowedDocumentModelIds: string[];
};
export function tsMorphGenerateDriveEditor({
  projectDir,
  editorDir,
  editorName,
  editorId,
}: GenerateDriveEditorArgs) {
  const { documentModelsSourceFilesPath, ...documentModelFilePaths } =
    getDocumentModelFilePaths(projectDir);
  const { editorSourceFilesPath, editorsDirPath, ...editorFilePaths } =
    getEditorFilePaths(projectDir, editorDir);

  const project = buildTsMorphProject(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  makeDriveEditorComponent({
    project,
    ...editorFilePaths,
  });

  makeEditorModuleFile({
    project,
    editorName,
    editorId,
    documentModelId: "powerhouse/document-drive",
    ...editorFilePaths,
  });

  makeEditorsModulesFile(project, projectDir);

  project.saveSync();
}

type MakeDriveEditorComponentArgs = {
  project: Project;
  editorFilePath: string;
};
export function makeDriveEditorComponent({
  project,
  editorFilePath,
}: MakeDriveEditorComponentArgs) {
  const { alreadyExists, sourceFile: driveEditorComponentSourceFile } =
    getOrCreateSourceFile(project, editorFilePath);
  const printNode = buildNodePrinter(driveEditorComponentSourceFile);

  const importDeclarations = [
    {
      namedImports: ["useSetPHDriveEditorConfig"],
      moduleSpecifier: "@powerhousedao/reactor-browser",
    },
    {
      namedImports: ["EditorProps"],
      moduleSpecifier: "document-model",
      isTypeOnly: true,
    },
    {
      namedImports: ["DriveExplorer"],
      moduleSpecifier: "./components/DriveExplorer.js",
    },
    {
      namedImports: ["editorConfig"],
      moduleSpecifier: "./config.js",
    },
  ];
  driveEditorComponentSourceFile.addImportDeclarations(importDeclarations);
  const useSetPHDriveEditorConfigHookCall = buildFunctionCall({
    functionName: "useSetPHDriveEditorConfig",
    argumentsArray: ["editorConfig"],
  });

  const driveExplorerComponent = buildSelfClosingJsxElement("DriveExplorer", [
    buildJsxSpreadAttribute("props"),
  ]);

  const returnStatement = buildReturn(driveExplorerComponent);

  const statements = [useSetPHDriveEditorConfigHookCall, returnStatement].map(
    printNode,
  );

  driveEditorComponentSourceFile.addFunction({
    name: "Editor",
    isDefaultExport: true,
    parameters: [{ name: "props", type: "EditorProps" }],
    statements,
    docs: ["Implement your drive explorer behavior here"],
  });

  formatSourceFileWithPrettier(driveEditorComponentSourceFile);
}

type MakeDriveEditorConfigFileArgs = {
  project: Project;
  driveEditorConfigPath: string;
};
export function makeDriveEditorConfigFile({
  project,
  driveEditorConfigPath,
}: MakeDriveEditorConfigFileArgs) {
  const { alreadyExists, sourceFile: driveEditorConfigSourceFile } =
    getOrCreateSourceFile(project, driveEditorConfigPath);

  driveEditorConfigSourceFile.addImportDeclaration({
    moduleSpecifier: "@powerhousedao/reactor-browser",
    namedImports: ["PHDriveEditorConfig"],
  });
}
