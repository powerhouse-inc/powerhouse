import type {
  DocumentModelFileMakerArgs,
  DocumentModelModuleFileMakerArgs,
} from "@powerhousedao/codegen";
import { ts } from "@tmpl/core";
import { camelCase, kebabCase, pascalCase } from "change-case";
import path from "path";
import { filter, map, pipe } from "remeda";
import {
  documentModelTestFileTemplate,
  makeOperationImportNames,
  makeTestCaseForOperation,
} from "templates";
import { SyntaxKind } from "ts-morph";
import {
  getDateLikeFieldNames,
  getInputFieldNames,
} from "../../codegen/graphql.js";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
  getPreviousVersionSourceFile,
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
  const dateLikeFieldsByScope = {
    global: getDateLikeFieldNames(specification.state.global.schema),
    local: getDateLikeFieldNames(specification.state.local.schema),
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
        import { generateMock } from "document-model";
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
    // Use the literal value of the description so it doesn't include the
    // surrounding quotes — otherwise the dedup check below never matches.
    .map((c) => {
      const firstArg = c.getArguments()[0];
      const stringLiteral = firstArg.asKind(SyntaxKind.StringLiteral);
      if (stringLiteral) return stringLiteral.getLiteralValue();
      const noSubstitutionTemplate = firstArg.asKind(
        SyntaxKind.NoSubstitutionTemplateLiteral,
      );
      if (noSubstitutionTemplate)
        return noSubstitutionTemplate.getLiteralValue();
      return firstArg.getText();
    });

  // Skip operations whose generated test description is already present
  const testCasesToAdd = pipe(
    module.operations,
    filter((o) => {
      const opCamelCase = camelCase(o.name ?? "");
      const expectedTestCaseName = `should handle ${opCamelCase} operation`;
      return !testCaseNames.some((name) => name === expectedTestCaseName);
    }),
    map((o) => {
      const dateLikeStateFields =
        o.scope === "local"
          ? dateLikeFieldsByScope.local
          : dateLikeFieldsByScope.global;
      const dateLikeInputFields = getInputFieldNames(o.schema).filter((f) =>
        dateLikeStateFields.has(f),
      );
      return makeTestCaseForOperation(
        o,
        isPhDocumentOfTypeFunctionName,
        dateLikeInputFields,
      );
    }),
  );

  describeCallBody.addStatements(testCasesToAdd);

  const GENERATE_MOCK_NAME = "generateMock";
  const GENERATE_MOCK_MODULE_SPECIFIER = "document-model";

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
