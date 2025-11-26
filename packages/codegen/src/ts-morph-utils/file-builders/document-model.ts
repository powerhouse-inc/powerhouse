import type { DocumentModelGlobalState } from "document-model";
import { type Project } from "ts-morph";
import {
  documentModelModulesOutputFileName,
  documentModelModulesVariableName,
  documentModelModulesVariableType,
  documentModelModuleTypeName,
} from "../constants.js";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../file-utils.js";
import {
  buildDocumentModelGenDirFilePath,
  buildDocumentModelRootDirFilePath,
  buildDocumentModelSrcDirFilePath,
} from "../name-builders/document-model-files.js";
import { getDocumentModelFilePaths } from "../name-builders/get-file-paths.js";
import { getDocumentModelVariableNames } from "../name-builders/get-variable-names.js";
import type { DocumentModelVariableNames } from "../name-builders/types.js";
import { documentModelGenUtilsTemplate } from "../templates/document-model/gen/utils.js";
import { documentModelIndexTemplate } from "../templates/document-model/index.js";
import { documentModelModuleFileTemplate } from "../templates/document-model/module.js";
import { documentModelSrcUtilsTemplate } from "../templates/document-model/src/utils.js";
import { documentModelUtilsTemplate } from "../templates/document-model/utils.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import { makeModulesFile } from "./module-files.js";

type GenerateDocumentModelArgs = {
  projectDir: string;
  packageName: string;
  documentModelState: DocumentModelGlobalState;
};
export function tsMorphGenerateDocumentModel({
  projectDir,
  packageName,
  documentModelState,
}: GenerateDocumentModelArgs) {
  const project = buildTsMorphProject(projectDir);
  const { documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);

  const documentModelVariableNames = getDocumentModelVariableNames({
    packageName,
    projectDir,
    documentModelState,
  });

  const fileMakerArgs = {
    project,
    ...documentModelVariableNames,
  };

  makeDocumentModelIndexFile(fileMakerArgs);
  makeDocumentModelGenUtilsFile(fileMakerArgs);
  makeDocumentModelSrcUtilsFile(fileMakerArgs);
  makeDocumentModelUtilsFile(fileMakerArgs);
  makeDocumentModelModuleFile(fileMakerArgs);
  makeDocumentModelModulesFile(project, projectDir);

  project.saveSync();
}

type DocumentModelFileMakerArgs = DocumentModelVariableNames & {
  project: Project;
};

export function makeDocumentModelModulesFile(
  project: Project,
  projectDir: string,
) {
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

type MakeDocumentModelModuleFileArgs = DocumentModelVariableNames & {
  project: Project;
};
export function makeDocumentModelModuleFile({
  project,
  phStateName,
  pascalCaseDocumentType,
  documentModelDir,
  documentModelDirPath,
}: MakeDocumentModelModuleFileArgs) {
  const template = documentModelModuleFileTemplate({
    phStateName,
    documentModelDir,
    pascalCaseDocumentType,
  });

  const moduleFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "module.ts",
  );
  const { sourceFile: documentModelModuleSourceFile } = getOrCreateSourceFile(
    project,
    moduleFilePath,
  );

  documentModelModuleSourceFile.replaceWithText(template);

  formatSourceFileWithPrettier(documentModelModuleSourceFile);
}

export function makeDocumentModelGenUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenUtilsTemplate(variableNames);
  const { documentModelDirPath } = variableNames;
  const utilsFilePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );
  const { sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );
  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

export function makeDocumentModelUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelUtilsTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const utilsFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );

  const { sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );
  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

export function makeDocumentModelIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelIndexTemplate;
  const { documentModelDirPath } = variableNames;

  const indexFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "index.ts",
  );

  const { sourceFile: indexSourceFile } = getOrCreateSourceFile(
    project,
    indexFilePath,
  );

  indexSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(indexSourceFile);
}

export function makeDocumentModelSrcUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcUtilsTemplate;
  const { documentModelDirPath } = variableNames;

  const utilsFilePath = buildDocumentModelSrcDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );

  const { alreadyExists, sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );

  if (alreadyExists) return;

  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}
