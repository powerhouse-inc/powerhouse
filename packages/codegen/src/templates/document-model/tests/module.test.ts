import type {
  ModuleSpecification,
  OperationSpecification,
} from "@powerhousedao/shared";
import { ts } from "@tmpl/core";
import { camelCase, constantCase, pascalCase } from "change-case";
import type { DocumentModelModuleFileMakerArgs } from "file-builders";
import { filter, isString, map, pipe, prop } from "remeda";

function makeModuleOperationsTypeName(module: ModuleSpecification) {
  const pascalCaseModuleName = pascalCase(module.name);
  return `${pascalCaseModuleName}Operations`;
}

function makeCamelCaseOperationNamesForImport(
  operations: OperationSpecification[],
) {
  return pipe(
    operations,
    map(prop("name")),
    filter(isString),
    map((n) => camelCase(n)),
  );
}

function makeOperationInputSchemasForImport(
  operations: OperationSpecification[],
) {
  return pipe(
    operations,
    map(prop("name")),
    filter(isString),
    map((n) => `${pascalCase(n)}InputSchema`),
  );
}

const VALID_ISO_DATETIME = `"2024-01-01T00:00:00.000Z"`;

export function makeTestCaseForOperation(
  operation: OperationSpecification,
  isPhDocumentOfTypeFunctionName: string,
  // Input fields feeding a Date/DateTime state field; mocked as a valid datetime.
  dateLikeInputFields: string[] = [],
) {
  if (operation.name === null) {
    throw new Error(`Operation is missing name.`);
  }
  const camelCaseActionName = camelCase(operation.name);
  const pascalCaseActionName = pascalCase(operation.name);
  const constantCaseActionName = constantCase(operation.name);
  const actionInputSchemaName = `${pascalCaseActionName}InputSchema`;
  const scope = operation.scope;
  const overridesArg =
    dateLikeInputFields.length > 0
      ? `\n            { ${dateLikeInputFields
          .map((field) => `${field}: ${VALID_ISO_DATETIME}`)
          .join(", ")} },`
      : "";
  return ts`
  it('should handle ${camelCaseActionName} operation', () => {
        const document = utils.createDocument();
        const input = generateMock(
            ${actionInputSchemaName}(),${overridesArg}
        );

        const updatedDocument = reducer(
            document,
            ${camelCaseActionName}(input),
        );

        expect(${isPhDocumentOfTypeFunctionName}(updatedDocument)).toBe(true);
        expect(updatedDocument.operations.${scope}).toHaveLength(1);
        expect(updatedDocument.operations.${scope}[0].action.type).toBe(
            "${constantCaseActionName}",
        );
        expect(updatedDocument.operations.${scope}[0].action.input).toStrictEqual(input);
        expect(updatedDocument.operations.${scope}[0].index).toEqual(0);
    });
  `.raw;
}

export function makeOperationImportNames(v: DocumentModelModuleFileMakerArgs) {
  const operationNames = makeCamelCaseOperationNamesForImport(
    v.module.operations,
  );
  const inputSchemaNames = makeOperationInputSchemasForImport(
    v.module.operations,
  );
  const importNames = [
    "reducer",
    "utils",
    v.isPhDocumentOfTypeFunctionName,
    ...operationNames,
    ...inputSchemaNames,
  ];
  return importNames;
}

export function makeOperationsImports(v: DocumentModelModuleFileMakerArgs) {
  const importNames = makeOperationImportNames(v).join("\n");
  return ts`
  import {
    ${importNames}
  } from "${v.versionImportPath}";
  `.raw;
}

function makeTestCasesForOperations(
  operations: OperationSpecification[],
  isPhDocumentOfTypeFunctionName: string,
) {
  return operations
    .map((operation) =>
      makeTestCaseForOperation(operation, isPhDocumentOfTypeFunctionName),
    )
    .join("\n\n");
}
export const documentModelOperationsModuleTestFileTemplate = (
  v: DocumentModelModuleFileMakerArgs,
) =>
  ts`
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect } from 'vitest';
import { generateMock } from 'document-model';
import {
  reducer,
  utils,
  ${v.isPhDocumentOfTypeFunctionName},
  ${makeCamelCaseOperationNamesForImport(v.module.operations)},
  ${makeOperationInputSchemasForImport(v.module.operations)},
} from "${v.versionImportPath}";

describe("${makeModuleOperationsTypeName(v.module)}", () => {
  ${makeTestCasesForOperations(v.module.operations, v.isPhDocumentOfTypeFunctionName)}
});

`.raw;
