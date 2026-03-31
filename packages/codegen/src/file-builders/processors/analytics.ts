import path from "path";
import {
  analyticsFactoryTemplate,
  analyticsIndexTemplate,
  analyticsProcessorTemplate,
} from "templates";
import type { Project } from "ts-morph";
import { formatSourceFileWithPrettier, getOrCreateSourceFile } from "utils";
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

  await makeProcessorFile({
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
  const template = analyticsIndexTemplate;
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "index.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeProcessorFile(v: {
  project: Project;
  pascalCaseName: string;
  dirPath: string;
}) {
  const template = analyticsProcessorTemplate(v);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "processor.ts"),
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
