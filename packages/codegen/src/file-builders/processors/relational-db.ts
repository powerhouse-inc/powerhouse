import path from "path";
import {
  relationalDbFactoryTemplate,
  relationalDbIndexTemplate,
  relationalDbMigrationsTemplate,
  relationalDbProcessorTemplate,
  relationalDbSchemaTemplate,
} from "templates";
import type { Project } from "ts-morph";
import { formatSourceFileWithPrettier, getOrCreateSourceFile } from "utils";
import type { GenerateProcessorArgs } from "./types.js";

export async function tsMorphGenerateRelationalDbProcessor(
  args: GenerateProcessorArgs,
) {
  const { project, documentTypes, camelCaseName, pascalCaseName, dirPath } =
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

  await makeMigrationsFile({ project, dirPath });

  await makeSchemaFile({ project, dirPath });
}

async function makeIndexFile(v: {
  project: Project;
  pascalCaseName: string;
  dirPath: string;
}) {
  const template = relationalDbIndexTemplate;
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
  const template = relationalDbProcessorTemplate(v);
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
  const template = relationalDbFactoryTemplate(v);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "factory.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeSchemaFile(v: { project: Project; dirPath: string }) {
  const template = relationalDbSchemaTemplate();
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "schema.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeMigrationsFile(v: { project: Project; dirPath: string }) {
  const template = relationalDbMigrationsTemplate();
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.dirPath, "migrations.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}
