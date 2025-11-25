import type { Project } from "ts-morph";
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
} from "../name-builders/document-model-files.js";
import { getDocumentModelFilePaths } from "../name-builders/get-file-paths.js";
import type { DocumentModelVariableNames } from "../name-builders/types.js";
import { documentModelGenUtilsTemplate } from "../templates/document-model/gen/utils.js";
import { documentModelModuleFileTemplate } from "../templates/document-model/module.js";
import { documentModelUtilsTemplate } from "../templates/document-model/utils.js";
import { makeModulesFile } from "./module-files.js";

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
