import {
  analyticsFactoryTemplate,
  analyticsIndexTemplate,
} from "@powerhousedao/codegen/templates";
import {
  buildTsMorphProject,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import { camelCase, paramCase, pascalCase } from "change-case";
import path from "path";
import type { Project } from "ts-morph";

export function tsMorphGenerateAnalyticsProcessor(args: {
  name: string;
  documentTypesString: string;
  rootDir: string;
}) {
  const { name, documentTypesString, rootDir } = args;
  const processorsDirPath = path.join(rootDir, "processors");
  const sourceFilesPath = path.join(processorsDirPath, "/**/*");
  const documentTypes = documentTypesString
    .split(",")
    .filter((type) => type !== "");
  const paramCaseName = paramCase(name);
  const camelCaseName = camelCase(name);
  const pascalCaseName = pascalCase(name);
  const project = buildTsMorphProject(rootDir);
  project.addSourceFilesAtPaths(sourceFilesPath);
  const dirPath = path.join(processorsDirPath, paramCaseName);

  makeIndexFile({
    project,
    pascalCaseName,
    dirPath,
  });

  makeFactoryFile({
    project,
    pascalCaseName,
    dirPath,
    documentTypes,
  });
}

function makeIndexFile(v: {
  project: Project;
  pascalCaseName: string;
  dirPath: string;
}) {
  const template = analyticsIndexTemplate(v);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "index.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
  v.project.saveSync();
}

function makeFactoryFile(v: {
  project: Project;
  pascalCaseName: string;
  dirPath: string;
  documentTypes: string[];
}) {
  const template = analyticsFactoryTemplate(v);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "factory.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
  v.project.saveSync();
}
