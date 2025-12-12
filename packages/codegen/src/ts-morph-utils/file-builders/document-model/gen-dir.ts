import {
  buildNodePrinter,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/ts-morph";
import { paramCase, pascalCase } from "change-case";
import path from "path";
import { VariableDeclarationKind } from "ts-morph";
import { getDocumentModelOperationsModuleVariableNames } from "../../name-builders/get-variable-names.js";
import type { DocumentModelTemplateInputsWithModule } from "../../name-builders/types.js";
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
    const operationsModuleVariableNames =
      getDocumentModelOperationsModuleVariableNames(module);
    makeGenDirOperationModuleFiles({
      module,
      ...fileMakerArgs,
      ...operationsModuleVariableNames,
    });
  }
}

function makeGenDirOperationModuleFiles(
  fileMakerArgs: DocumentModelTemplateInputsWithModule,
) {
  makeOperationModuleGenActionsFile(fileMakerArgs);
  makeOperationModuleGenCreatorsFile(fileMakerArgs);
  makeOperationModuleGenOperationsFile(fileMakerArgs);
  makeOperationModuleGenErrorFile(fileMakerArgs);
}

function makeDocumentModelGenUtilsFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenUtilsTemplate(args);
  const { project, genDirPath } = args;
  const utilsFilePath = path.join(genDirPath, "utils.ts");
  const { sourceFile } = getOrCreateSourceFile(project, utilsFilePath);
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelDocumentTypeFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelDocumentTypeTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "document-type.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelSchemaIndexFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelSchemaIndexTemplate;
  const { project, schemaDirPath } = args;
  const filePath = path.join(schemaDirPath, "index.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenTypesFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenTypesTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "types.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenDocumentModelFile(
  args: DocumentModelFileMakerArgs,
) {
  const { project, genDirPath, documentModelState } = args;
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

function makeDocumentModelGenDocumentSchemaFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelDocumentSchemaFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "document-schema.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenCreatorsFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenCreatorsFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "creators.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenPhFactoriesFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelPhFactoriesFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "ph-factories.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenIndexFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenIndexFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenActionsFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenActionsFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelGenReducerFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenReducerFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "reducer.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleGenActionsFile(
  args: DocumentModelTemplateInputsWithModule,
) {
  const { module } = args;
  const { actions } = getDocumentModelOperationsModuleVariableNames(module);
  const pascalCaseModuleName = pascalCase(module.name);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationModuleActionsFileTemplate({
    ...args,
    actions,
    pascalCaseModuleName,
  });
  const { project, genDirPath } = args;

  const dirPath = path.join(genDirPath, paramCaseModuleName);
  const filePath = path.join(dirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleGenCreatorsFile(
  args: DocumentModelTemplateInputsWithModule,
) {
  const { module } = args;
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleCreatorsFileTemplate({
    ...args,
    ...moduleVariableNames,
  });
  const { project, genDirPath } = args;

  const dirPath = path.join(genDirPath, paramCaseModuleName);
  const filePath = path.join(dirPath, "creators.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleGenOperationsFile(
  args: DocumentModelTemplateInputsWithModule,
) {
  const { module } = args;
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleOperationsFileTemplate({
    ...args,
    ...moduleVariableNames,
  });
  const { project, genDirPath } = args;

  const dirPath = path.join(genDirPath, paramCaseModuleName);
  const filePath = path.join(dirPath, "operations.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleGenErrorFile(
  args: DocumentModelTemplateInputsWithModule,
) {
  const { module } = args;
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleErrorFileTemplate({
    ...args,
    ...moduleVariableNames,
  });
  const { project, genDirPath } = args;

  const dirPath = path.join(genDirPath, paramCaseModuleName);

  const filePath = path.join(dirPath, "error.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}
