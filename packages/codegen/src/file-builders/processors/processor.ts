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
import { tsMorphGenerateAnalyticsProcessor } from "./analytics.js";
import { tsMorphGenerateRelationalDbProcessor } from "./relational-db.js";

export function tsMorphGenerateProcessor(args: {
  name: string;
  documentTypes: string[];
  rootDir: string;
  processorType: "relationalDb" | "analytics";
}) {
  const { name, documentTypes, rootDir, processorType } = args;
  const paramCaseName = paramCase(name);
  const camelCaseName = camelCase(name);
  const pascalCaseName = pascalCase(name);
  const processorsDirPath = path.join(rootDir, "processors");
  const dirPath = path.join(processorsDirPath, paramCaseName);
  const sourceFilesPath = path.join(processorsDirPath, "**/*");
  const project = buildTsMorphProject(rootDir);
  ensureDirectoriesExist(project, processorsDirPath, dirPath);
  project.addSourceFilesAtPaths(sourceFilesPath);

  makeIndexFile({
    project,
    dirPath,
  });

  makeFactoryFile({
    project,
    dirPath,
  });

  if (processorType === "analytics") {
    tsMorphGenerateAnalyticsProcessor({
      name,
      documentTypes,
      rootDir,
      camelCaseName,
      dirPath,
      paramCaseName,
      pascalCaseName,
      processorsDirPath,
      project,
    });
    return;
  }

  tsMorphGenerateRelationalDbProcessor({
    name,
    documentTypes,
    rootDir,
    camelCaseName,
    dirPath,
    paramCaseName,
    pascalCaseName,
    processorsDirPath,
    project,
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
