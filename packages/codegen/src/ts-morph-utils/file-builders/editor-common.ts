import path from "path";
import type { Project } from "ts-morph";
import { makeModulesFile } from "./module-files.js";

export function makeEditorsModulesFile(project: Project, projectDir: string) {
  const modulesDirPath = path.join(projectDir, "editors");
  const modulesSourceFilesPath = path.join(modulesDirPath, "/**/*");
  makeModulesFile({
    project,
    modulesDirPath,
    modulesSourceFilesPath,
    outputFileName: "editors.ts",
    typeName: "EditorModule",
    variableName: "editors",
    variableType: "EditorModule[]",
  });
}
