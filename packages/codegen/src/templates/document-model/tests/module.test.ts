import type {
  ActionFromOperation,
  DocumentModelTemplateInputsWithModule,
} from "@powerhousedao/codegen/file-builders";
import { ts } from "@tmpl/core";
import { camelCase, constantCase, pascalCase } from "change-case";
import type { ModuleSpecification } from "document-model";

function makeModuleOperationsTypeName(module: ModuleSpecification) {
  const pascalCaseModuleName = pascalCase(module.name);
  return `${pascalCaseModuleName}Operations`;
}

function makeCamelCaseActionNamesForImport(actions: ActionFromOperation[]) {
  return actions.map((a) => camelCase(a.name));
}

function makeActionInputSchemasForImport(actions: ActionFromOperation[]) {
  return actions.map((a) => `${pascalCase(a.name)}InputSchema`);
}

export function makeTestCaseForAction(
  action: ActionFromOperation,
  isPhDocumentOfTypeFunctionName: string,
) {
  const camelCaseActionName = camelCase(action.name);
  const pascalCaseActionName = pascalCase(action.name);
  const constantCaseActionName = constantCase(action.name);
  const actionInputSchemaName = `${pascalCaseActionName}InputSchema`;
  const scope = action.scope;
  return ts`
  it('should handle ${camelCaseActionName} operation', () => {
        const document = utils.createDocument();
        const input = generateMock(
            ${actionInputSchemaName}(),
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

export function makeActionImportNames(
  v: DocumentModelTemplateInputsWithModule,
) {
  const actionNames = makeCamelCaseActionNamesForImport(v.actions);
  const inputSchemaNames = makeActionInputSchemasForImport(v.actions);
  const importNames = [
    "reducer",
    "utils",
    v.isPhDocumentOfTypeFunctionName,
    ...actionNames,
    ...inputSchemaNames,
  ];
  return importNames;
}

export function makeActionsImports(v: DocumentModelTemplateInputsWithModule) {
  const importNames = makeActionImportNames(v).join("\n");
  return ts`
  import {
    ${importNames}
  } from "${v.versionedDocumentModelPackageImportPath}";
  `.raw;
}

function makeTestCasesForActions(
  actions: ActionFromOperation[],
  isPhDocumentOfTypeFunctionName: string,
) {
  return actions
    .map((action) =>
      makeTestCaseForAction(action, isPhDocumentOfTypeFunctionName),
    )
    .join("\n\n");
}
export const documentModelOperationsModuleTestFileTemplate = (
  v: DocumentModelTemplateInputsWithModule,
) =>
  ts`
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect } from 'vitest';
import { generateMock } from '@powerhousedao/common';
import {
  reducer,
  utils,
  ${v.isPhDocumentOfTypeFunctionName},
  ${makeCamelCaseActionNamesForImport(v.actions)},
  ${makeActionInputSchemasForImport(v.actions)},
} from "${v.versionedDocumentModelPackageImportPath}";

describe("${makeModuleOperationsTypeName(v.module)}", () => {
  ${makeTestCasesForActions(v.actions, v.isPhDocumentOfTypeFunctionName)}
});

`.raw;
