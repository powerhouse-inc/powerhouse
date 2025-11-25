import type { Project } from "ts-morph";
import {
  editorModuleOutputFileName,
  editorModuleTypeName,
  editorModuleVariableName,
  editorModuleVariableType,
} from "../constants.js";
import {
  buildEditorsDirPath,
  buildEditorSourceFilesPath,
} from "../name-builders/editor-files.js";
import { makeModulesFile } from "./module-files.js";

export function makeEditorsModulesFile(project: Project, projectDir: string) {
  makeModulesFile({
    project,
    modulesDirPath: buildEditorsDirPath(projectDir),
    modulesSourceFilesPath: buildEditorSourceFilesPath(projectDir),
    outputFileName: editorModuleOutputFileName,
    typeName: editorModuleTypeName,
    variableName: editorModuleVariableName,
    variableType: editorModuleVariableType,
  });
}
