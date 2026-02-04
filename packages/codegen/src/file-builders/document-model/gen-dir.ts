import type {
  DocumentModelFileMakerArgs,
  DocumentModelTemplateInputsWithModule,
} from "@powerhousedao/codegen/file-builders";
import { getDocumentModelOperationsModuleVariableNames } from "@powerhousedao/codegen/name-builders";
import {
  documentModelDocumentSchemaFileTemplate,
  documentModelDocumentTypeTemplate,
  documentModelGenActionsFileTemplate,
  documentModelGenCreatorsFileTemplate,
  documentModelGenIndexFileTemplate,
  documentModelGenReducerFileTemplate,
  documentModelGenTypesTemplate,
  documentModelGenUtilsTemplate,
  documentModelOperationModuleActionsFileTemplate,
  documentModelOperationsModuleCreatorsFileTemplate,
  documentModelOperationsModuleErrorFileTemplate,
  documentModelOperationsModuleOperationsFileTemplate,
  documentModelPhFactoriesFileTemplate,
  documentModelSchemaIndexTemplate,
} from "@powerhousedao/codegen/templates";
import {
  buildObjectLiteral,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import { paramCase, pascalCase } from "change-case";
import path from "path";
import { VariableDeclarationKind } from "ts-morph";

export async function makeGenDirFiles(
  fileMakerArgs: DocumentModelFileMakerArgs,
) {
  await makeDocumentModelSchemaIndexFile(fileMakerArgs);
  await makeDocumentModelGenUtilsFile(fileMakerArgs);
  await makeDocumentModelGenTypesFile(fileMakerArgs);
  await makeDocumentModelGenCreatorsFile(fileMakerArgs);
  await makeDocumentModelGenActionsFile(fileMakerArgs);
  await makeDocumentModelGenDocumentSchemaFile(fileMakerArgs);
  await makeDocumentModelGenReducerFile(fileMakerArgs);
  await makeDocumentModelDocumentTypeFile(fileMakerArgs);
  await makeDocumentModelGenIndexFile(fileMakerArgs);
  await makeDocumentModelGenDocumentModelFile(fileMakerArgs);
  await makeDocumentModelGenPhFactoriesFile(fileMakerArgs);

  const modules = fileMakerArgs.modules;

  for (const module of modules) {
    const operationsModuleVariableNames =
      getDocumentModelOperationsModuleVariableNames(module);
    await makeGenDirOperationModuleFiles({
      module,
      ...fileMakerArgs,
      ...operationsModuleVariableNames,
    });
  }
}

async function makeGenDirOperationModuleFiles(
  fileMakerArgs: DocumentModelTemplateInputsWithModule,
) {
  await makeOperationModuleGenActionsFile(fileMakerArgs);
  await makeOperationModuleGenCreatorsFile(fileMakerArgs);
  await makeOperationModuleGenOperationsFile(fileMakerArgs);
  await makeOperationModuleGenErrorFile(fileMakerArgs);
}

async function makeDocumentModelGenUtilsFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenUtilsTemplate(args);
  const { project, genDirPath } = args;
  const utilsFilePath = path.join(genDirPath, "utils.ts");
  const { sourceFile } = getOrCreateSourceFile(project, utilsFilePath);
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelDocumentTypeFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelDocumentTypeTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "document-type.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelSchemaIndexFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelSchemaIndexTemplate;
  const { project, schemaDirPath } = args;
  const filePath = path.join(schemaDirPath, "index.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelGenTypesFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenTypesTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "types.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelGenDocumentModelFile(
  args: DocumentModelFileMakerArgs,
) {
  const { project, genDirPath, documentModelState } = args;
  const filePath = path.join(genDirPath, "document-model.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText("");

  sourceFile.addImportDeclaration({
    namedImports: ["DocumentModelGlobalState"],
    moduleSpecifier: "document-model",
    isTypeOnly: true,
  });

  const documentModelStateString = buildObjectLiteral(
    documentModelState,
    sourceFile,
  );

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: "documentModel",
        type: "DocumentModelGlobalState",
        initializer: documentModelStateString,
      },
    ],
  });

  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelGenDocumentSchemaFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelDocumentSchemaFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "document-schema.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelGenCreatorsFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenCreatorsFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "creators.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelGenPhFactoriesFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelPhFactoriesFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "ph-factories.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelGenIndexFile(args: DocumentModelFileMakerArgs) {
  const template = documentModelGenIndexFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelGenActionsFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenActionsFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelGenReducerFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenReducerFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "reducer.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeOperationModuleGenActionsFile(
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
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeOperationModuleGenCreatorsFile(
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
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeOperationModuleGenOperationsFile(
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
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeOperationModuleGenErrorFile(
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
  await formatSourceFileWithPrettier(sourceFile);
}
