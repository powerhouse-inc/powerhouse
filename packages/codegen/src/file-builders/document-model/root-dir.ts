import type { DocumentModelFileMakerArgs } from "@powerhousedao/codegen";
import {
  documentModelHooksFileTemplate,
  documentModelIndexTemplate,
  documentModelModuleFileTemplate,
  documentModelRootActionsFileTemplate,
  documentModelUtilsTemplate,
} from "@powerhousedao/codegen/templates";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import path from "path";

export async function makeRootDirFiles(
  fileMakerArgs: DocumentModelFileMakerArgs,
) {
  await makeDocumentModelVersionIndexFile(fileMakerArgs);
  await makeDocumentModelRootActionsFile(fileMakerArgs);
  await makeDocumentModelModuleFile(fileMakerArgs);
  await makeDocumentModelUtilsFile(fileMakerArgs);
  await makeDocumentModelHooksFile(fileMakerArgs);
}

async function makeDocumentModelVersionIndexFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelIndexTemplate;
  const { project, documentModelVersionDirPath } = args;

  const filePath = path.join(documentModelVersionDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelUtilsFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelUtilsTemplate(args);
  const { project, documentModelVersionDirPath } = args;

  const filePath = path.join(documentModelVersionDirPath, "utils.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelRootActionsFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelRootActionsFileTemplate(args);
  const { project, documentModelVersionDirPath } = args;

  const filePath = path.join(documentModelVersionDirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelHooksFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelHooksFileTemplate(args);
  const { project, documentModelVersionDirPath } = args;

  const filePath = path.join(documentModelVersionDirPath, "hooks.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelModuleFile(args: DocumentModelFileMakerArgs) {
  const { project, documentModelVersionDirPath } = args;
  const template = documentModelModuleFileTemplate(args);

  const moduleFilePath = path.join(documentModelVersionDirPath, "module.ts");

  const { sourceFile } = getOrCreateSourceFile(project, moduleFilePath);

  sourceFile.replaceWithText(template);

  await formatSourceFileWithPrettier(sourceFile);
}
