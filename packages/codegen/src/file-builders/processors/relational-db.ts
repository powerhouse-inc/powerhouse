import {
  relationalDbFactoryTemplate,
  relationalDbIndexTemplate,
} from "@powerhousedao/codegen/templates";
import {
  buildTsMorphProject,
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import { camelCase, paramCase, pascalCase } from "change-case";
import path from "path";
import type { Project } from "ts-morph";

export function tsMorphGenerateRelationalDbProcessor(args: {
  name: string;
  documentTypesString: string;
  rootDir: string;
}) {
  const { name, documentTypesString, rootDir } = args;
  const paramCaseName = paramCase(name);
  const camelCaseName = camelCase(name);
  const pascalCaseName = pascalCase(name);
  const processorsDirPath = path.join(rootDir, "processors");
  const dirPath = path.join(processorsDirPath, paramCaseName);
  const sourceFilesPath = path.join(processorsDirPath, "/**/*");
  const project = buildTsMorphProject(rootDir);
  ensureDirectoriesExist(project, processorsDirPath, dirPath);
  project.addSourceFilesAtPaths(sourceFilesPath);

  const documentTypes = documentTypesString
    .split(",")
    .filter((type) => type !== "");

  makeIndexFile({
    project,
    pascalCaseName,
    dirPath,
  });

  makeFactoryFile({
    project,
    pascalCaseName,
    camelCaseName,
    dirPath,
    documentTypes,
  });
}

function makeIndexFile(v: {
  project: Project;
  pascalCaseName: string;
  dirPath: string;
}) {
  const template = relationalDbIndexTemplate(v);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "index.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeFactoryFile(v: {
  project: Project;
  pascalCaseName: string;
  camelCaseName: string;
  dirPath: string;
  documentTypes: string[];
}) {
  const template = relationalDbFactoryTemplate(v);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "factory.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}
