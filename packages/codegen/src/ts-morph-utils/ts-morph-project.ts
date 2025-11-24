import { Project } from "ts-morph";
import { getDefaultProjectOptions } from "./file-utils.js";
import { buildTsConfigFilePath } from "./name-builders/common-files.js";

export function buildTsMorphProject(projectDir: string) {
  const tsConfigFilePath = buildTsConfigFilePath(projectDir);
  const project = new Project(getDefaultProjectOptions(tsConfigFilePath));
  return project;
}
