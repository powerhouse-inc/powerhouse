import { paramCase, pascalCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import path from "path";
import { VariableDeclarationKind } from "ts-morph";
import {
  buildNodePrinter,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";
import { getDocumentModelOperationsModuleVariableNames } from "../../name-builders/get-variable-names.js";
import { buildObjectLiteral } from "../../syntax-builders.js";
import { documentModelGenActionsFileTemplate } from "../../templates/document-model/gen/actions.js";
import { documentModelGenCreatorsFileTemplate } from "../../templates/document-model/gen/creators.js";
import { documentModelDocumentSchemaFileTemplate } from "../../templates/document-model/gen/document-schema.js";
import { documentModelDocumentTypeTemplate } from "../../templates/document-model/gen/document-type.js";
import { documentModelGenIndexFileTemplate } from "../../templates/document-model/gen/index.js";
import { documentModelOperationModuleActionsFileTemplate } from "../../templates/document-model/gen/modules/actions.js";
import { documentModelOperationsModuleCreatorsFileTemplate } from "../../templates/document-model/gen/modules/creators.js";
import { documentModelOperationsModuleErrorFileTemplate } from "../../templates/document-model/gen/modules/error.js";
import { documentModelOperationsModuleOperationsFileTemplate } from "../../templates/document-model/gen/modules/operations.js";
import { documentModelPhFactoriesFileTemplate } from "../../templates/document-model/gen/ph-factories.js";
import { documentModelGenReducerFileTemplate } from "../../templates/document-model/gen/reducer.js";
import { documentModelSchemaIndexTemplate } from "../../templates/document-model/gen/schema/index.js";
import { documentModelGenTypesTemplate } from "../../templates/document-model/gen/types.js";
import { documentModelGenUtilsTemplate } from "../../templates/document-model/gen/utils.js";
import type { DocumentModelFileMakerArgs } from "./types.js";

export function makeGenDirFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  makeDocumentModelSchemaIndexFile(fileMakerArgs);
  makeDocumentModelGenUtilsFile(fileMakerArgs);
  makeDocumentModelGenTypesFile(fileMakerArgs);
  makeDocumentModelGenCreatorsFile(fileMakerArgs);
  makeDocumentModelGenActionsFile(fileMakerArgs);
  makeDocumentModelGenDocumentSchemaFile(fileMakerArgs);
  makeDocumentModelGenReducerFile(fileMakerArgs);
  makeDocumentModelDocumentTypeFile(fileMakerArgs);
  makeDocumentModelGenIndexFile(fileMakerArgs);
  makeDocumentModelGenDocumentModelFile(fileMakerArgs);
  makeDocumentModelGenPhFactoriesFile(fileMakerArgs);

  const modules = fileMakerArgs.modules;

  for (const module of modules) {
    makeGenDirOperationModuleFiles({ ...fileMakerArgs, module });
  }
}

function makeGenDirOperationModuleFiles(
  fileMakerArgs: DocumentModelFileMakerArgs & { module: ModuleSpecification },
) {
  makeOperationModuleGenActionsFile(fileMakerArgs);
  makeOperationModuleGenCreatorsFile(fileMakerArgs);
  makeOperationModuleGenOperationsFile(fileMakerArgs);
  makeOperationModuleGenErrorFile(fileMakerArgs);
}

function makeDocumentModelGenUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenUtilsTemplate(variableNames);
  const { genDirPath } = variableNames;
  const utilsFilePath = path.join(genDirPath, "utils.ts");
  const { sourceFile } = getOrCreateSourceFile(project, utilsFilePath);
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelDocumentTypeFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelDocumentTypeTemplate(variableNames);
  const { genDirPath } = variableNames;

  const filePath = path.join(genDirPath, "document-type.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelSchemaIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSchemaIndexTemplate;
  const { schemaDirPath } = variableNames;

  const filePath = path.join(schemaDirPath, "index.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenTypesFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenTypesTemplate(variableNames);
  const { genDirPath } = variableNames;

  const filePath = path.join(genDirPath, "types.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenDocumentModelFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const { genDirPath, documentModelState } = variableNames;
  const filePath = path.join(genDirPath, "document-model.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  const printNode = buildNodePrinter(sourceFile);

  sourceFile.replaceWithText("");

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

function makeDocumentModelGenDocumentSchemaFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelDocumentSchemaFileTemplate(variableNames);
  const { genDirPath } = variableNames;

  const filePath = path.join(genDirPath, "document-schema.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenCreatorsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenCreatorsFileTemplate(variableNames);
  const { genDirPath } = variableNames;

  const filePath = path.join(genDirPath, "creators.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenPhFactoriesFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelPhFactoriesFileTemplate(variableNames);
  const { genDirPath } = variableNames;

  const filePath = path.join(genDirPath, "ph-factories.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenIndexFileTemplate(variableNames);
  const { genDirPath } = variableNames;

  const filePath = path.join(genDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenActionsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenActionsFileTemplate(variableNames);
  const { genDirPath } = variableNames;

  const filePath = path.join(genDirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenReducerFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenReducerFileTemplate(variableNames);
  const { genDirPath } = variableNames;

  const filePath = path.join(genDirPath, "reducer.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleGenActionsFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const { actions } = getDocumentModelOperationsModuleVariableNames(module);
  const pascalCaseModuleName = pascalCase(module.name);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationModuleActionsFileTemplate({
    ...variableNames,
    actions,
    pascalCaseModuleName,
  });
  const { genDirPath } = variableNames;

  const dirPath = path.join(genDirPath, paramCaseModuleName);
  const filePath = path.join(dirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleGenCreatorsFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleCreatorsFileTemplate({
    ...variableNames,
    ...moduleVariableNames,
  });
  const { genDirPath } = variableNames;

  const dirPath = path.join(genDirPath, paramCaseModuleName);
  const filePath = path.join(dirPath, "creators.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleGenOperationsFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleOperationsFileTemplate({
    ...variableNames,
    ...moduleVariableNames,
  });
  const { genDirPath } = variableNames;

  const dirPath = path.join(genDirPath, paramCaseModuleName);
  const filePath = path.join(dirPath, "operations.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleGenErrorFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleErrorFileTemplate({
    ...variableNames,
    ...moduleVariableNames,
  });
  const { genDirPath } = variableNames;

  const dirPath = path.join(genDirPath, paramCaseModuleName);

  const filePath = path.join(dirPath, "error.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}
