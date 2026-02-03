import {
  processorsFactoryTemplate,
  processorsIndexTemplate,
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

export function tsMorphGenerateProcessorProcessor(args: {
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
    dirPath,
  });

  makeFactoryFile({
    project,
    dirPath,
  });
}

function makeIndexFile(v: { project: Project; dirPath: string }) {
  const template = processorsIndexTemplate();
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "index.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeFactoryFile(v: { project: Project; dirPath: string }) {
  const template = processorsFactoryTemplate();
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "factory.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}
