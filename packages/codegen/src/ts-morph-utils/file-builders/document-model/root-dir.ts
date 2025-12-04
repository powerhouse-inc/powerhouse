import { ts } from "@tmpl/core";
import path from "path";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";
import { documentModelRootActionsFileTemplate } from "../../templates/document-model/actions.js";
import { documentModelHooksFileTemplate } from "../../templates/document-model/hooks.js";
import { documentModelIndexTemplate } from "../../templates/document-model/index.js";
import { documentModelModuleFileTemplate } from "../../templates/document-model/module.js";
import { documentModelUtilsTemplate } from "../../templates/document-model/utils.js";
import type { DocumentModelFileMakerArgs } from "./types.js";

export function makeRootDirFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  makeDocumentModelVersionIndexFile(fileMakerArgs);
  makeDocumentModelIndexFile(fileMakerArgs);
  makeDocumentModelRootActionsFile(fileMakerArgs);
  makeDocumentModelModuleFile(fileMakerArgs);
  makeDocumentModelUtilsFile(fileMakerArgs);
  makeDocumentModelHooksFile(fileMakerArgs);
}

function makeDocumentModelIndexFile(args: DocumentModelFileMakerArgs) {
  const { project, documentModelDirPath, latestVersion } = args;
  const template = ts`export * from "./v${latestVersion}/index.js";`.raw;

  const filePath = path.join(documentModelDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelVersionIndexFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelIndexTemplate;
  const { project, documentModelVersionDirPath } = args;

  const filePath = path.join(documentModelVersionDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelUtilsFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelUtilsTemplate(args);
  const { project, documentModelVersionDirPath } = args;

  const filePath = path.join(documentModelVersionDirPath, "utils.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelRootActionsFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelRootActionsFileTemplate(args);
  const { project, documentModelVersionDirPath } = args;

  const filePath = path.join(documentModelVersionDirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelHooksFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelHooksFileTemplate(args);
  const { project, documentModelVersionDirPath } = args;

  const filePath = path.join(documentModelVersionDirPath, "hooks.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelModuleFile({
  project,
  phStateName,
  pascalCaseDocumentType,
  versionedDocumentModelPackageImportPath,
  documentModelVersionDirPath,
}: DocumentModelFileMakerArgs) {
  const template = documentModelModuleFileTemplate({
    phStateName,
    versionedDocumentModelPackageImportPath,
    pascalCaseDocumentType,
  });

  const moduleFilePath = path.join(documentModelVersionDirPath, "module.ts");

  const { sourceFile } = getOrCreateSourceFile(project, moduleFilePath);

  sourceFile.replaceWithText(template);

  formatSourceFileWithPrettier(sourceFile);
}
