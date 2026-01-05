import path from "path";
import type { Project } from "ts-morph";
import {
  editorModuleOutputFileName,
  editorModuleTypeName,
  editorModuleVariableName,
  editorModuleVariableType,
} from "../constants.js";
import { makeModulesFile } from "./module-files.js";

export function makeEditorsModulesFile(project: Project, projectDir: string) {
  const modulesDirPath = path.join(projectDir, "editors");
  const modulesSourceFilesPath = path.join(modulesDirPath, "/**/*");
  makeModulesFile({
    project,
    modulesDirPath,
    modulesSourceFilesPath,
    outputFileName: editorModuleOutputFileName,
    typeName: editorModuleTypeName,
    variableName: editorModuleVariableName,
    variableType: editorModuleVariableType,
  });
}
