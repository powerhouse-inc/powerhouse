import type { Project } from "ts-morph";
import {
  documentModelModulesOutputFileName,
  documentModelModulesVariableName,
  documentModelModulesVariableType,
  documentModelModuleTypeName,
} from "../constants.js";
import { getDocumentModelFilePaths } from "../name-builders/get-file-paths.js";
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
