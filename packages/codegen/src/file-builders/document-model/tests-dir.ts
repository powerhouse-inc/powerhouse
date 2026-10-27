import type {
  DocumentModelFileMakerArgs,
  DocumentModelModuleFileMakerArgs,
} from "@powerhousedao/codegen";
import { ts } from "@tmpl/core";
import { camelCase, constantCase, kebabCase, pascalCase } from "change-case";
import path from "path";
import { map, pipe } from "remeda";
import {
  documentModelTestFileTemplate,
  makeOperationImportNames,
  makeTestCaseForOperation,
} from "templates";
import { Node, SyntaxKind } from "ts-morph";
import {
  getInputFieldNames,
  getMockOverrideFieldNames,
} from "../../codegen/graphql.js";
import {
  fixGenerateMockImports,
  formatSourceFileWithPrettier,
  GENERATE_MOCK_MODULE_SPECIFIER,
  GENERATE_MOCK_NAME,
  getOrCreateSourceFile,
  getPreviousVersionSourceFile,
  hasGenerateMockImport,
  updateVersionedImports,
} from "utils";

export async function makeDocumentModelModulesOperationTestFiles(
  fileMakerArgs: DocumentModelFileMakerArgs,
) {
  for (const module of fileMakerArgs.specification.modules) {
    await makeOperationModuleTestFile({ ...fileMakerArgs, module });
  }
}

export async function makeOperationModuleTestFile(
  args: DocumentModelModuleFileMakerArgs,
) {
  const {
    project,
    module,
    specification,
    version,
    versionImportPath,
    testsDirPath,
    isPhDocumentOfTypeFunctionName,
  } = args;
  const overrideFieldsByScope = {
    global: getMockOverrideFieldNames(specification.state.global.schema),
    local: getMockOverrideFieldNames(specification.state.local.schema),
  };
  const kebabCaseModuleName = kebabCase(module.name);
  const pascalCaseModuleName = pascalCase(module.name);
  const moduleOperationsTypeName = `${pascalCaseModuleName}Operations`;
  const filePath = path.join(testsDirPath, `${kebabCaseModuleName}.test.ts`);

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
      updateVersionedImports({ sourceFile, version });
    } else {
      sourceFile.replaceWithText(
        ts`
        import { generateMock } from "document-model/mock";
        import { describe, expect, it } from "vitest";

        describe("${moduleOperationsTypeName}", () => {

        });
        `.raw,
      );
    }
  }

  const importNames = makeOperationImportNames(args);
  const namedImports = importNames.map((name) => ({ name }));

  const actionsImportDeclaration = sourceFile
    .getImportDeclarations()
    .filter((i) => !i.isTypeOnly())
    .find((importDeclaration) =>
      importDeclaration
        .getModuleSpecifier()
        .getText()
        .includes(versionImportPath),
    );

  if (!actionsImportDeclaration) {
    sourceFile.addImportDeclaration({
      namedImports,
      moduleSpecifier: versionImportPath,
    });
  } else {
    actionsImportDeclaration.setModuleSpecifier(versionImportPath);
    const existingNamedImports = actionsImportDeclaration
      .getNamedImports()
      .map((value) => value.getName());

    for (const name of importNames) {
      if (!existingNamedImports.includes(name)) {
        actionsImportDeclaration.addNamedImport(name);
      }
    }
  }

  // An operation is tested once a test of the scaffold's name is in the file,
  // or anything in it calls its action creator or names its action type.
  const testCaseNames = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expressionText = call.getExpression().getText();
      return expressionText === "it" || expressionText === "test";
    })
    .map((c) => literalText(c.getArguments()[0]));
  const calledNames = new Set(
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).map((call) => {
      const callee = call.getExpression();
      if (Node.isIdentifier(callee)) return callee.getText();
      if (Node.isPropertyAccessExpression(callee)) return callee.getName();
      return undefined;
    }),
  );

  const strings = new Set(
    sourceFile
      .getDescendantsOfKind(SyntaxKind.StringLiteral)
      .map((literal) => literal.getLiteralValue()),
  );

  const untested = module.operations.filter((o) => {
    const opCamelCase = camelCase(o.name ?? "");
    const expectedTestCaseName = `should handle ${opCamelCase} operation`;
    return (
      !testCaseNames.includes(expectedTestCaseName) &&
      !calledNames.has(opCamelCase) &&
      !strings.has(constantCase(o.name ?? ""))
    );
  });

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

  if (!describeCall && untested.length > 0) {
    console.error(
      `Test file at path ${filePath} has no describe block for ${moduleOperationsTypeName}`,
    );
    return;
  }

  const testCasesToAdd = pipe(
    untested,
    map((o) => {
      const overrideStateFields =
        o.scope === "local"
          ? overrideFieldsByScope.local
          : overrideFieldsByScope.global;
      const overrideInputFields = getInputFieldNames(
        o.schema,
        `${pascalCase(o.name ?? "")}Input`,
      )
        .filter((f) => overrideStateFields.has(f))
        .map((f) => ({ name: f, literal: overrideStateFields.get(f)! }));
      return makeTestCaseForOperation(
        o,
        isPhDocumentOfTypeFunctionName,
        overrideInputFields,
      );
    }),
  );

  if (describeCall && testCasesToAdd.length > 0) {
    describeCall
      .getArguments()[1]
      .asKindOrThrow(SyntaxKind.ArrowFunction)
      .addStatements(testCasesToAdd);
  }

  if (sourceFile.getText().includes(GENERATE_MOCK_NAME)) {
    fixGenerateMockImports(sourceFile);
    if (!hasGenerateMockImport(sourceFile)) {
      sourceFile.addImportDeclaration({
        namedImports: [GENERATE_MOCK_NAME],
        moduleSpecifier: GENERATE_MOCK_MODULE_SPECIFIER,
      });
    }
  }

  sourceFile.fixUnusedIdentifiers();
  await formatSourceFileWithPrettier(sourceFile);
}

// A test's description as written: a string's value, else its source.
function literalText(node: Node | undefined) {
  if (!node) return "";
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralValue();
  }
  return node.getText();
}

export async function makeDocumentModelTestFile(
  args: DocumentModelFileMakerArgs,
) {
  const { project, version, testsDirPath } = args;
  const template = documentModelTestFileTemplate(args);

  const filePath = path.join(testsDirPath, "document-model.test.ts");

  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) {
    updateVersionedImports({ sourceFile, version });
    return;
  }

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}
