import type { DocumentModelFileMakerArgs } from "@powerhousedao/codegen/ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/ts-morph";
import path from "path";
import { documentModelRootActionsFileTemplate } from "../../templates/document-model/actions.js";
import { documentModelHooksFileTemplate } from "../../templates/document-model/hooks.js";
import { documentModelIndexTemplate } from "../../templates/document-model/index.js";
import { documentModelModuleFileTemplate } from "../../templates/document-model/module.js";
import { documentModelUtilsTemplate } from "../../templates/document-model/utils.js";

export function makeRootDirFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  makeDocumentModelVersionIndexFile(fileMakerArgs);
  makeDocumentModelRootActionsFile(fileMakerArgs);
  makeDocumentModelModuleFile(fileMakerArgs);
  makeDocumentModelUtilsFile(fileMakerArgs);
  makeDocumentModelHooksFile(fileMakerArgs);
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

function makeDocumentModelModuleFile(args: DocumentModelFileMakerArgs) {
  const { project, documentModelVersionDirPath } = args;
  const template = documentModelModuleFileTemplate(args);

  const moduleFilePath = path.join(documentModelVersionDirPath, "module.ts");

  const { sourceFile } = getOrCreateSourceFile(project, moduleFilePath);

  sourceFile.replaceWithText(template);

  formatSourceFileWithPrettier(sourceFile);
}
