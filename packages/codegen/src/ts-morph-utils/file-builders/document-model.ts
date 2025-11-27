import type { DocumentModelGlobalState } from "document-model";
import path from "path";
import { VariableDeclarationKind, type Project } from "ts-morph";
import {
  documentModelModulesOutputFileName,
  documentModelModulesVariableName,
  documentModelModulesVariableType,
  documentModelModuleTypeName,
} from "../constants.js";
import {
  buildNodePrinter,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../file-utils.js";
import {
  buildDocumentModelGenDirFilePath,
  buildDocumentModelRootDirFilePath,
  buildDocumentModelSrcDirFilePath,
} from "../name-builders/document-model-files.js";
import { getDocumentModelFilePaths } from "../name-builders/get-file-paths.js";
import { getDocumentModelVariableNames } from "../name-builders/get-variable-names.js";
import type { DocumentModelVariableNames } from "../name-builders/types.js";
import { buildObjectLiteral } from "../syntax-builders.js";
import { documentModelRootActionsFileTemplate } from "../templates/document-model/actions.js";
import { documentModelGenCreatorsFileTemplate } from "../templates/document-model/gen/creators.js";
import { documentModelDocumentSchemaFileTemplate } from "../templates/document-model/gen/document-schema.js";
import { documentModelDocumentTypeTemplate } from "../templates/document-model/gen/document-type.js";
import { documentModelGenIndexFileTemplate } from "../templates/document-model/gen/index.js";
import { documentModelPhFactoriesFileTemplate } from "../templates/document-model/gen/ph-factories.js";
import { documentModelSchemaIndexTemplate } from "../templates/document-model/gen/schema/index.js";
import { documentModelGenTypesTemplate } from "../templates/document-model/gen/types.js";
import { documentModelGenUtilsTemplate } from "../templates/document-model/gen/utils.js";
import { documentModelHooksFileTemplate } from "../templates/document-model/hooks.js";
import { documentModelIndexTemplate } from "../templates/document-model/index.js";
import { documentModelModuleFileTemplate } from "../templates/document-model/module.js";
import { documentModelSrcIndexFileTemplate } from "../templates/document-model/src/index.js";
import { documentModelTestFileTemplate } from "../templates/document-model/src/tests/document-model.test.js";
import { documentModelSrcUtilsTemplate } from "../templates/document-model/src/utils.js";
import { documentModelUtilsTemplate } from "../templates/document-model/utils.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import { makeModulesFile } from "./module-files.js";

type GenerateDocumentModelArgs = {
  projectDir: string;
  packageName: string;
  documentModelState: DocumentModelGlobalState;
};
export function tsMorphGenerateDocumentModel({
  projectDir,
  packageName,
  documentModelState,
}: GenerateDocumentModelArgs) {
  const project = buildTsMorphProject(projectDir);
  const { documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);

  const documentModelVariableNames = getDocumentModelVariableNames({
    packageName,
    projectDir,
    documentModelState,
  });

  const fileMakerArgs = {
    project,
    ...documentModelVariableNames,
  };

  makeDocumentModelSchemaIndexFile(fileMakerArgs);
  makeDocumentModelSrcIndexFile(fileMakerArgs);
  makeDocumentModelIndexFile(fileMakerArgs);
  makeDocumentModelGenUtilsFile(fileMakerArgs);
  makeDocumentModelGenTypesFile(fileMakerArgs);
  makeDocumentModelGenCreatorsFile(fileMakerArgs);
  makeDocumentModelGenDocumentSchemaFile(fileMakerArgs);
  makeDocumentModelDocumentTypeFile(fileMakerArgs);
  makeDocumentModelSrcUtilsFile(fileMakerArgs);
  makeDocumentModelTestFile(fileMakerArgs);
  makeDocumentModelUtilsFile(fileMakerArgs);
  makeDocumentModelModuleFile(fileMakerArgs);
  makeDocumentModelGenIndexFile(fileMakerArgs);
  makeDocumentModelGenDocumentModelFile(fileMakerArgs);
  makeDocumentModelGenPhFactoriesFile(fileMakerArgs);
  makeDocumentModelHooksFile(fileMakerArgs);
  makeDocumentModelRootActionsFile(fileMakerArgs);
  makeDocumentModelModulesFile(project, projectDir);

  project.saveSync();
}

type DocumentModelFileMakerArgs = DocumentModelVariableNames & {
  project: Project;
};

export function makeDocumentModelModulesFile(
  project: Project,
  projectDir: string,
) {
  const { documentModelsDirPath, documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  makeModulesFile({
    project,
    modulesDirPath: documentModelsDirPath,
    modulesSourceFilesPath: documentModelsSourceFilesPath,
    outputFileName: documentModelModulesOutputFileName,
    typeName: documentModelModuleTypeName,
    variableName: documentModelModulesVariableName,
    variableType: documentModelModulesVariableType,
  });
}

type MakeDocumentModelModuleFileArgs = DocumentModelVariableNames & {
  project: Project;
};
export function makeDocumentModelModuleFile({
  project,
  phStateName,
  pascalCaseDocumentType,
  documentModelDir,
  documentModelDirPath,
}: MakeDocumentModelModuleFileArgs) {
  const template = documentModelModuleFileTemplate({
    phStateName,
    documentModelDir,
    pascalCaseDocumentType,
  });

  const moduleFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "module.ts",
  );
  const { sourceFile: documentModelModuleSourceFile } = getOrCreateSourceFile(
    project,
    moduleFilePath,
  );

  documentModelModuleSourceFile.replaceWithText(template);

  formatSourceFileWithPrettier(documentModelModuleSourceFile);
}

export function makeDocumentModelGenUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenUtilsTemplate(variableNames);
  const { documentModelDirPath } = variableNames;
  const utilsFilePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );
  const { sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );
  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

export function makeDocumentModelUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelUtilsTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const utilsFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );

  const { sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );
  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

export function makeDocumentModelIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelIndexTemplate;
  const { documentModelDirPath } = variableNames;

  const indexFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "index.ts",
  );

  const { sourceFile: indexSourceFile } = getOrCreateSourceFile(
    project,
    indexFilePath,
  );

  indexSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(indexSourceFile);
}

export function makeDocumentModelSrcUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcUtilsTemplate;
  const { documentModelDirPath } = variableNames;

  const utilsFilePath = buildDocumentModelSrcDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );

  const { alreadyExists, sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );

  if (alreadyExists) return;

  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

export function makeDocumentModelDocumentTypeFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelDocumentTypeTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "document-type.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelSrcIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcIndexFileTemplate;
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelSrcDirFilePath(
    documentModelDirPath,
    "index.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelTestFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelTestFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;
  const testsDirPath = buildDocumentModelSrcDirFilePath(
    documentModelDirPath,
    "tests",
  );

  const testsDir = project.getDirectory(testsDirPath);

  if (!testsDir) {
    project.createDirectory(testsDirPath);
  }

  const filePath = path.join(testsDirPath, "document-model.test.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelSchemaIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSchemaIndexTemplate;
  const { documentModelDirPath } = variableNames;

  const schemaDirPath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "schema",
  );
  const schemaDir = project.getDirectory(schemaDirPath);

  if (!schemaDir) {
    project.createDirectory(schemaDirPath);
    project.saveSync();
  }

  const filePath = path.join(schemaDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenTypesFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenTypesTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "types.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenDocumentModelFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const { documentModelDirPath, documentModelState } = variableNames;
  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "document-model.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  const printNode = buildNodePrinter(sourceFile);

  sourceFile.addImportDeclaration({
    namedImports: ["DocumentModelGlobalState"],
    moduleSpecifier: "document-model",
    isTypeOnly: true,
  });

  const objectLiteral = buildObjectLiteral(documentModelState);

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: "documentModel",
        type: "DocumentModelGlobalState",
        initializer: printNode(objectLiteral),
      },
    ],
  });

  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenDocumentSchemaFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelDocumentSchemaFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "document-schema.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenCreatorsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenCreatorsFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "creators.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenPhFactoriesFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelPhFactoriesFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "ph-factories.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenIndexFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "index.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelHooksFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelHooksFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "hooks.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelRootActionsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelRootActionsFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "actions.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}
