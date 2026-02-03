import {
  relationalDbFactoryTemplate,
  relationalDbIndexTemplate,
} from "@powerhousedao/codegen/templates";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import path from "path";
import type { Project } from "ts-morph";
import type { GenerateProcessorArgs } from "./types.js";

export function tsMorphGenerateRelationalDbProcessor(
  args: GenerateProcessorArgs,
) {
  const { project, documentTypes, camelCaseName, pascalCaseName, dirPath } =
    args;

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
