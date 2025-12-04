import { ts } from "@tmpl/core";
import { paramCase, pascalCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import path from "path";
import { VariableDeclarationKind } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";
import { getDocumentModelOperationsModuleVariableNames } from "../../name-builders/get-variable-names.js";
import { getObjectLiteral } from "../../syntax-getters.js";
import { documentModelSrcIndexFileTemplate } from "../../templates/document-model/src/index.js";
import { documentModelTestFileTemplate } from "../../templates/document-model/src/tests/document-model.test.js";
import { documentModelOperationsModuleTestFileTemplate } from "../../templates/document-model/src/tests/module.test.js";
import { documentModelSrcUtilsTemplate } from "../../templates/document-model/src/utils.js";
import type { DocumentModelFileMakerArgs } from "./types.js";

export function makeSrcDirFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  makeDocumentModelSrcIndexFile(fileMakerArgs);
  makeDocumentModelSrcUtilsFile(fileMakerArgs);
  makeReducerOperationHandlersForModules(fileMakerArgs);
  makeSrcDirTestFiles(fileMakerArgs);
}

function makeSrcDirTestFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  makeDocumentModelTestFile(fileMakerArgs);
  const modules = fileMakerArgs.modules;

  for (const module of modules) {
    makeOperationModuleTestFile({ ...fileMakerArgs, module });
  }
}

function makeReducerOperationHandlersForModules(
  fileMakerArgs: DocumentModelFileMakerArgs,
) {
  const { modules } = fileMakerArgs;
  for (const module of modules) {
    makeReducerOperationHandlerForModule({
      ...fileMakerArgs,
      module,
    });
  }
}

function makeReducerOperationHandlerForModule({
  project,
  module,
  reducersDirPath,
  pascalCaseDocumentType,
  camelCaseDocumentType,
  documentModelVersionDirName,
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const paramCaseModuleName = paramCase(module.name);
  const pascalCaseModuleName = pascalCase(module.name);
  const filePath = path.join(reducersDirPath, `${paramCaseModuleName}.ts`);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  const operationsInterfaceTypeName = `${pascalCaseDocumentType}${pascalCaseModuleName}Operations`;
  const operationsInterfaceVariableName = `${camelCaseDocumentType}${pascalCaseModuleName}Operations`;

  if (alreadyExists) {
    return;
  }

  const operationsInterfaceTypeImport = sourceFile.addImportDeclaration({
    namedImports: [operationsInterfaceTypeName],
    moduleSpecifier: documentModelVersionDirName,
    isTypeOnly: true,
  });

  const operationsInterfaceTypeProperties = operationsInterfaceTypeImport
    .getNamedImports()
    .find((value) => value.getName() === operationsInterfaceTypeName)
    ?.getNameNode()
    .getType()
    .getProperties()
    .map((symbol) => symbol.getName());

  if (!operationsInterfaceTypeProperties) {
    throw new Error("Failed to create operation handler object");
  }

  const operationsInterfaceVariableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: operationsInterfaceVariableName,
        initializer: "{}",
        type: operationsInterfaceTypeName,
      },
    ],
  });

  const operationsInterfaceObject = getObjectLiteral(
    operationsInterfaceVariableStatement,
  );

  if (!operationsInterfaceObject) {
    throw new Error("Failed to build reducer object");
  }

  for (const name of operationsInterfaceTypeProperties) {
    operationsInterfaceObject.addMethod({
      name,
      parameters: [{ name: "state" }, { name: "action" }],
      statements: [
        `// TODO: implement ${name} reducer`,
        ts`throw new Error("Reducer for '${name}' not implemented.")`.raw,
      ],
    });
  }

  formatSourceFileWithPrettier(sourceFile);
}

function makeOperationModuleTestFile(
  args: DocumentModelFileMakerArgs & { module: ModuleSpecification },
) {
  const { project, module, ...variableNames } = args;
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleTestFileTemplate({
    ...args,
    ...moduleVariableNames,
  });
  const { testsDirPath } = variableNames;
  const filePath = path.join(testsDirPath, `${paramCaseModuleName}.test.ts`);

  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelSrcIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcIndexFileTemplate;
  const { srcDirPath } = variableNames;

  const filePath = path.join(srcDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeDocumentModelSrcUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcUtilsTemplate;
  const { srcDirPath } = variableNames;

  const utilsFilePath = path.join(srcDirPath, "utils.ts");

  const { alreadyExists, sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );

  if (alreadyExists) return;

  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

function makeDocumentModelTestFile(args: DocumentModelFileMakerArgs) {
  const { project, testsDirPath } = args;
  const template = documentModelTestFileTemplate(args);

  const filePath = path.join(testsDirPath, "document-model.test.ts");

  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}
