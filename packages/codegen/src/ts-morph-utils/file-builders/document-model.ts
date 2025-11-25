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
import { getDocumentModelFilePaths } from "../name-builders/get-file-paths.js";
import { documentModelModuleFileTemplate } from "../templates/document-model.js";
import { makeModulesFile } from "./module-files.js";

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

type MakeDocumentModelModuleFileArgs = {
  project: Project;
  projectDir: string;
  phStateName: string;
  pascalCaseDocumentType: string;
  documentModelDir: string;
  moduleFilePath: string;
};
export function makeDocumentModelModuleFile({
  project,
  phStateName,
  pascalCaseDocumentType,
  documentModelDir,
  moduleFilePath,
}: MakeDocumentModelModuleFileArgs) {
  const template = documentModelModuleFileTemplate({
    phStateName,
    documentModelDir,
    pascalCaseDocumentType,
  });

  console.log({ template });

  const { sourceFile: documentModelModuleSourceFile } = getOrCreateSourceFile(
    project,
    moduleFilePath,
  );

  console.log("!!!test1", documentModelModuleSourceFile.getText());

  documentModelModuleSourceFile.replaceWithText(template);

  console.log("!!!test2", documentModelModuleSourceFile.getText());

  formatSourceFileWithPrettier(documentModelModuleSourceFile);
}
