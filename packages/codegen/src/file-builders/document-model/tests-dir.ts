import type { DocumentModelFileMakerArgs } from "@powerhousedao/codegen";
import { getDocumentModelOperationsModuleVariableNames } from "@powerhousedao/codegen/name-builders";
import {
  documentModelTestFileTemplate,
  makeActionImportNames,
  makeTestCaseForAction,
} from "@powerhousedao/codegen/templates";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
  getPreviousVersionSourceFile,
} from "@powerhousedao/codegen/utils";
import { ts } from "@tmpl/core";
import { camelCase, paramCase, pascalCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import path from "path";
import { SyntaxKind } from "ts-morph";

export async function makeTestsDirFiles(
  fileMakerArgs: DocumentModelFileMakerArgs,
) {
  await makeDocumentModelTestFile(fileMakerArgs);
  const modules = fileMakerArgs.modules;

  for (const module of modules) {
    await makeOperationModuleTestFile({ ...fileMakerArgs, module });
  }
}

async function makeOperationModuleTestFile(
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
        import { generateMock } from "@powerhousedao/common/utils";
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

  let actionsImportDeclaration = sourceFile
    .getImportDeclarations()
    .filter((i) => !i.isTypeOnly())
    .find((importDeclaration) =>
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
        pascalCase(firstArg.getText()).includes(moduleOperationsTypeName)
      );
    });

  if (!describeCall) {
    console.error(
      `Test file at path ${filePath} has no describe block for ${moduleOperationsTypeName}`,
    );
    return;
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

  const GENERATE_MOCK_NAME = "generateMock";
  const GENERATE_MOCK_MODULE_SPECIFIER = "@powerhousedao/codegen";

  const generateMockImport = sourceFile.getImportDeclaration((i) =>
    i.getNamedImports().some((v) => v.getText().includes(GENERATE_MOCK_NAME)),
  );

  const hasGenerateMockInSourceFile = sourceFile
    .getText()
    .includes(GENERATE_MOCK_NAME);

  if (hasGenerateMockInSourceFile && !generateMockImport) {
    sourceFile.addImportDeclaration({
      namedImports: [GENERATE_MOCK_NAME],
      moduleSpecifier: GENERATE_MOCK_MODULE_SPECIFIER,
    });
  }

  sourceFile.fixUnusedIdentifiers();
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelTestFile(args: DocumentModelFileMakerArgs) {
  const { project, testsDirPath } = args;
  const template = documentModelTestFileTemplate(args);

  const filePath = path.join(testsDirPath, "document-model.test.ts");

  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}
