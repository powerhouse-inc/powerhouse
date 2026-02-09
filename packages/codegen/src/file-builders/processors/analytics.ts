import {
  analyticsFactoryTemplate,
  analyticsIndexTemplate,
} from "@powerhousedao/codegen/templates";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import path from "path";
import type { Project } from "ts-morph";
import type { GenerateProcessorArgs } from "./types.js";

export async function tsMorphGenerateAnalyticsProcessor(
  args: GenerateProcessorArgs,
) {
  const { project, documentTypes, pascalCaseName, dirPath, camelCaseName } =
    args;

  await makeIndexFile({
    project,
    pascalCaseName,
    dirPath,
  });

  await makeFactoryFile({
    project,
    pascalCaseName,
    camelCaseName,
    dirPath,
    documentTypes,
  });
}

async function makeIndexFile(v: {
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
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeFactoryFile(v: {
  project: Project;
  pascalCaseName: string;
  camelCaseName: string;
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
  await formatSourceFileWithPrettier(sourceFile);
}
