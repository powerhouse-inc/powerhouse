import type { Project } from "ts-morph";
import {
  documentModelModulesOutputFileName,
  documentModelModulesVariableName,
  documentModelModulesVariableType,
  documentModelModuleTypeName,
} from "../constants.js";
import { getDocumentModelFilePaths } from "../name-builders/get-file-paths.js";
import { getDocumentModelVariableNames } from "../name-builders/get-variable-names.js";
import type { DocumentModelVariableNames } from "../name-builders/types.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import { makeGenDirFiles } from "./document-model/gen-dir.js";
import { makeRootDirFiles } from "./document-model/root-dir.js";
import { makeSrcDirFiles } from "./document-model/src-dir.js";
import type {
  DocumentModelFileMakerArgs,
  GenerateDocumentModelArgs,
} from "./document-model/types.js";
import { makeModulesFile } from "./module-files.js";

function ensureDirectoriesExist(
  project: Project,
  variables: DocumentModelVariableNames,
) {
  const {
    documentModelsDirPath,
    documentModelDirPath,
    srcDirPath,
    genDirPath,
    testsDirPath,
    schemaDirPath,
    moduleDirPaths,
  } = variables;

  const pathsToEnsure = [
    documentModelsDirPath,
    documentModelDirPath,
    srcDirPath,
    genDirPath,
    testsDirPath,
    schemaDirPath,
    ...moduleDirPaths,
  ];

  for (const dirPath of pathsToEnsure) {
    const dir = project.getDirectory(dirPath);
    if (!dir) {
      project.createDirectory(dirPath);
      project.saveSync();
    }
  }
}
export function tsMorphGenerateDocumentModel({
  projectDir,
  packageName,
  documentModelState,
}: GenerateDocumentModelArgs) {
  const project = buildTsMorphProject(projectDir);

  const documentModelVariableNames = getDocumentModelVariableNames({
    packageName,
    projectDir,
    documentModelState,
  });

  ensureDirectoriesExist(project, documentModelVariableNames);
  const { documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);

  const fileMakerArgs = {
    project,
    projectDir,
    packageName,
    ...documentModelVariableNames,
  };

  makeRootDirFiles(fileMakerArgs);
  makeGenDirFiles(fileMakerArgs);
  makeSrcDirFiles(fileMakerArgs);
  makeDocumentModelModulesFile(fileMakerArgs);

  project.saveSync();
}

function makeDocumentModelModulesFile({
  project,
  projectDir,
}: DocumentModelFileMakerArgs) {
  const { documentModelsDirPath, documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  makeModulesFile({
    project,
    modulesDirPath: documentModelsDirPath,
    modulesSourceFilesPath: documentModelsSourceFilesPath,
    outputFileName: documentModelModulesOutputFileName,
    typeName: documentModelModuleTypeName,
    variableName: documentModelModulesVariableName,
    variableType: documentModelModulesVariableType,
  });
}
