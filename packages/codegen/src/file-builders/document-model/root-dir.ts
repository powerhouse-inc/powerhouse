import type { DocumentModelFileMakerArgs } from "@powerhousedao/codegen";
import path from "path";
import {
  documentModelHooksFileTemplate,
  documentModelIndexTemplate,
  documentModelModuleFileTemplate,
  documentModelRootActionsFileTemplate,
  documentModelUtilsTemplate,
} from "templates";
import { formatSourceFileWithPrettier, getOrCreateSourceFile } from "utils";

export async function makeDocumentModelVersionIndexFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelIndexTemplate;
  const { project, versionDirPath } = args;

  const filePath = path.join(versionDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelUtilsFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelUtilsTemplate(args);
  const { project, versionDirPath } = args;

  const filePath = path.join(versionDirPath, "utils.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelRootActionsFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelRootActionsFileTemplate(args);
  const { project, versionDirPath } = args;

  const filePath = path.join(versionDirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelHooksFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelHooksFileTemplate(args);
  const { project, versionDirPath } = args;

  const filePath = path.join(versionDirPath, "hooks.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelModuleFile(
  args: DocumentModelFileMakerArgs,
) {
  const { project, versionDirPath } = args;
  const template = documentModelModuleFileTemplate(args);

  const moduleFilePath = path.join(versionDirPath, "module.ts");

  const { sourceFile } = getOrCreateSourceFile(project, moduleFilePath);

  sourceFile.replaceWithText(template);

  await formatSourceFileWithPrettier(sourceFile);
}
