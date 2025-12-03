import path from "path";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";
import { getArrayNumberElements } from "../../syntax-getters.js";
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
  const VERSIONS = "versions";
  const LATEST = "latest";
  const filePath = path.join(documentModelDirPath, "versions.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  /* Find the latest version in the `versions` array and add a new entry for the next version */
  if (alreadyExists) {
    const versionsArray = sourceFile
      .getVariableDeclarationOrThrow(VERSIONS)
      .getInitializerIfKindOrThrow(SyntaxKind.AsExpression)
      .getExpressionIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

    const previousVersions = getArrayNumberElements(versionsArray);
    const currentLatestVersion = Math.max(...previousVersions);
    const nextVersion = currentLatestVersion + 1;
    const newVersions = Array.from(
      new Set([...previousVersions, nextVersion]),
    ).toSorted();
    versionsArray.replaceWithText(`[${newVersions.join(", ")}]`);

    const nextVersionIndex = newVersions.indexOf(nextVersion);

    const latestVariableIndex = sourceFile
      .getVariableDeclarationOrThrow(LATEST)
      .getInitializerIfKindOrThrow(SyntaxKind.ElementAccessExpression)
      .getArgumentExpressionOrThrow();

    latestVariableIndex.replaceWithText(nextVersionIndex.toString());

    return;
  }

  /* Create the versions.ts file and initialize it with a single version of 1 
  and set the value of `latest` to be the first item in the array
  */
  const version = 1;
  const versionInitializer = `[${version}] as const;`;
  const latestInitializer = `versions[0];`;

  sourceFile.addVariableStatements([
    {
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [
        {
          name: VERSIONS,
          initializer: versionInitializer,
        },
      ],
    },
    {
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [
        {
          name: LATEST,
          initializer: latestInitializer,
        },
      ],
    },
  ]);

  formatSourceFileWithPrettier(sourceFile);
}
