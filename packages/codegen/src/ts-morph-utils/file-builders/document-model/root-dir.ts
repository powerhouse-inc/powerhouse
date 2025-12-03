import { ts } from "@tmpl/core";
import path from "path";
import { VariableDeclarationKind } from "ts-morph";
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
  makeDocumentModelIndexFile(fileMakerArgs);
  makeDocumentModelRootActionsFile(fileMakerArgs);
  makeDocumentModelModuleFile(fileMakerArgs);
  makeDocumentModelUtilsFile(fileMakerArgs);
  makeDocumentModelHooksFile(fileMakerArgs);
  makeVersionConstantsFile(fileMakerArgs);
}

function makeDocumentModelIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelIndexTemplate;
  const { documentModelDirPath } = variableNames;

  const filePath = path.join(documentModelDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelUtilsTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = path.join(documentModelDirPath, "utils.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelRootActionsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelRootActionsFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = path.join(documentModelDirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelHooksFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelHooksFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = path.join(documentModelDirPath, "hooks.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelModuleFile({
  project,
  phStateName,
  pascalCaseDocumentType,
  documentModelDir,
  documentModelDirPath,
}: DocumentModelFileMakerArgs) {
  const template = documentModelModuleFileTemplate({
    phStateName,
    documentModelDir,
    pascalCaseDocumentType,
  });

  const moduleFilePath = path.join(documentModelDirPath, "module.ts");

  const { sourceFile } = getOrCreateSourceFile(project, moduleFilePath);

  sourceFile.replaceWithText(template);

  formatSourceFileWithPrettier(sourceFile);
}

function makeVersionConstantsFile({
  project,
  documentModelDirPath,
}: DocumentModelFileMakerArgs) {
  const filePath = path.join(documentModelDirPath, "versions.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) {
    return;
  }

  const version = 1;
  const versionInitializer = ts`[${version}] as const;`.raw;
  const latestInitializer = ts`versions[0]`.raw;

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: "versions",
        initializer: versionInitializer,
      },
    ],
  });
  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: "latest",
        initializer: latestInitializer,
      },
    ],
  });

  formatSourceFileWithPrettier(sourceFile);
}
