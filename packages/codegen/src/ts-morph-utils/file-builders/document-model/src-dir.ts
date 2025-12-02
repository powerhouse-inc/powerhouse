import { paramCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import path from "path";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";
import { getDocumentModelOperationsModuleVariableNames } from "../../name-builders/get-variable-names.js";
import { documentModelSrcIndexFileTemplate } from "../../templates/document-model/src/index.js";
import { documentModelTestFileTemplate } from "../../templates/document-model/src/tests/document-model.test.js";
import { documentModelOperationsModuleTestFileTemplate } from "../../templates/document-model/src/tests/module.test.js";
import { documentModelSrcUtilsTemplate } from "../../templates/document-model/src/utils.js";
import type { DocumentModelFileMakerArgs } from "./types.js";

export function makeSrcDirFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  makeDocumentModelSrcIndexFile(fileMakerArgs);
  makeDocumentModelSrcUtilsFile(fileMakerArgs);
  makeSrcDirTestFiles(fileMakerArgs);
}

function makeSrcDirTestFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  makeDocumentModelTestFile(fileMakerArgs);
  const modules = fileMakerArgs.modules;

  for (const module of modules) {
    makeOperationModuleTestFile({ ...fileMakerArgs, module });
  }
}

function makeOperationModuleTestFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleTestFileTemplate({
    ...variableNames,
    ...moduleVariableNames,
  });
  const { testsDirPath } = variableNames;
  const filePath = path.join(testsDirPath, `${paramCaseModuleName}.test.ts`);

  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelSrcIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcIndexFileTemplate;
  const { srcDirPath } = variableNames;

  const filePath = path.join(srcDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelSrcUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcUtilsTemplate;
  const { srcDirPath } = variableNames;

  const utilsFilePath = path.join(srcDirPath, "utils.ts");

  const { alreadyExists, sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );

  if (alreadyExists) return;

  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

function makeDocumentModelTestFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelTestFileTemplate(variableNames);
  const { testsDirPath } = variableNames;

  const filePath = path.join(testsDirPath, "document-model.test.ts");

  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}
