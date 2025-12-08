import { ts } from "@tmpl/core";
import { camelCase, paramCase, pascalCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import path from "path";
import type { Project } from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";
import { getDocumentModelOperationsModuleVariableNames } from "../../name-builders/get-variable-names.js";
import { getObjectLiteral } from "../../syntax-getters.js";
import { documentModelSrcIndexFileTemplate } from "../../templates/document-model/src/index.js";
import { documentModelTestFileTemplate } from "../../templates/document-model/src/tests/document-model.test.js";
import {
  makeActionImportNames,
  makeTestCaseForAction,
} from "../../templates/document-model/src/tests/module.test.js";
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

function getPreviousVersionSourceFile(args: {
  project: Project;
  version: number;
  filePath: string;
}) {
  const { project, version, filePath } = args;
  const previousVersion = version - 1;
  if (previousVersion < 1) return;
  const previousVersionFilePath = filePath.replace(
    `/v${version}/`,
    `/v${previousVersion}/`,
  );

  const previousVersionFile = project.getSourceFile(previousVersionFilePath);

  return previousVersionFile;
}

function makeReducerOperationHandlerForModule({
  project,
  module,
  version,
  reducersDirPath,
  pascalCaseDocumentType,
  camelCaseDocumentType,
  versionedDocumentModelPackageImportPath,
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const paramCaseModuleName = paramCase(module.name);
  const pascalCaseModuleName = pascalCase(module.name);
  const filePath = path.join(reducersDirPath, `${paramCaseModuleName}.ts`);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  if (!alreadyExists) {
    const previousVersionFile = getPreviousVersionSourceFile({
      project,
      version,
      filePath,
    });
    if (previousVersionFile) {
      sourceFile.replaceWithText(previousVersionFile.getText());
    }
  }
  const operationsInterfaceTypeName = `${pascalCaseDocumentType}${pascalCaseModuleName}Operations`;
  const operationsInterfaceVariableName = `${camelCaseDocumentType}${pascalCaseModuleName}Operations`;

  const existingOperationsInterfaceTypeImport = sourceFile.getImportDeclaration(
    (importDeclaration) =>
      !!importDeclaration
        .getNamedImports()
        .find(
          (importSpecifier) =>
            importSpecifier.getName() === operationsInterfaceTypeName,
        ),
  );
  if (existingOperationsInterfaceTypeImport) {
    existingOperationsInterfaceTypeImport.remove();
  }

  const operationsInterfaceTypeImport = sourceFile.addImportDeclaration({
    namedImports: [operationsInterfaceTypeName],
    moduleSpecifier: versionedDocumentModelPackageImportPath,
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

  let operationsInterfaceVariableStatement = sourceFile.getVariableStatement(
    operationsInterfaceVariableName,
  );

  if (!operationsInterfaceVariableStatement) {
    operationsInterfaceVariableStatement = sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [
        {
          name: operationsInterfaceVariableName,
          type: operationsInterfaceTypeName,
          initializer: "{}",
        },
      ],
    });
  }

  const operationsInterfaceObject = getObjectLiteral(
    operationsInterfaceVariableStatement,
  );

  if (!operationsInterfaceObject) {
    throw new Error("Failed to build reducer object");
  }

  for (const name of operationsInterfaceTypeProperties) {
    if (operationsInterfaceObject.getProperty(name)) continue;

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
  const {
    project,
    module,
    version,
    testsDirPath,
    documentModelPackageImportPath,
    versionedDocumentModelPackageImportPath,
    isPhDocumentOfTypeFunctionName,
  } = args;
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const { actions } = moduleVariableNames;
  const paramCaseModuleName = paramCase(module.name);
  const pascalCaseModuleName = pascalCase(module.name);
  const moduleOperationsTypeName = `${pascalCaseModuleName}Operations`;
  const filePath = path.join(testsDirPath, `${paramCaseModuleName}.test.ts`);

  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (!alreadyExists) {
    const previousVersionSourceFile = getPreviousVersionSourceFile({
      project,
      version,
      filePath,
    });

    if (previousVersionSourceFile) {
      sourceFile.replaceWithText(previousVersionSourceFile.getText());
    } else {
      sourceFile.replaceWithText(
        ts`
        import { generateMock } from "@powerhousedao/codegen";
        import { describe, expect, it } from "vitest";

        describe("${moduleOperationsTypeName}", () => {

        });
        `.raw,
      );
    }
  }

  const importNames = makeActionImportNames({
    ...args,
    ...moduleVariableNames,
  });

  const namedImports = importNames.map((name) => ({ name }));

  let actionsImportDeclaration = sourceFile.getImportDeclaration(
    (importDeclaration) =>
      importDeclaration
        .getModuleSpecifier()
        .getText()
        .includes(documentModelPackageImportPath),
  );

  if (!actionsImportDeclaration) {
    actionsImportDeclaration = sourceFile.addImportDeclaration({
      namedImports,
      moduleSpecifier: versionedDocumentModelPackageImportPath,
    });
  } else {
    actionsImportDeclaration.setModuleSpecifier(
      versionedDocumentModelPackageImportPath,
    );
    const existingNamedImports = actionsImportDeclaration
      .getNamedImports()
      .map((value) => value.getName());

    for (const name of importNames) {
      if (!existingNamedImports.includes(name)) {
        actionsImportDeclaration.addNamedImport(name);
      }
    }
  }

  const describeCall = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => {
      const expressionText = call.getExpression().getText();
      const args = call.getArguments();
      const firstArg = args[0];
      return (
        expressionText === "describe" &&
        firstArg.getText().includes(moduleOperationsTypeName)
      );
    });

  if (!describeCall) {
    throw new Error(
      `Test file has no describe block for ${moduleOperationsTypeName}`,
    );
  }

  const describeCallBody = describeCall
    .getArguments()[1]
    .asKindOrThrow(SyntaxKind.ArrowFunction);

  const testCaseNames = describeCall
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expressionText = call.getExpression().getText();
      return expressionText === "it" || expressionText === "test";
    })
    .map((c) => c.getArguments()[0].getText());

  const actionsWithoutExistingTestCases = actions.filter((action) => {
    const camelCaseActionName = camelCase(action.name);
    return !testCaseNames.some((c) => c.includes(camelCaseActionName));
  });

  const testCasesToAdd = actionsWithoutExistingTestCases.map((action) =>
    makeTestCaseForAction(action, isPhDocumentOfTypeFunctionName),
  );

  describeCallBody.addStatements(testCasesToAdd);

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
