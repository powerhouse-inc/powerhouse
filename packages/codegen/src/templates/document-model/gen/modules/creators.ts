import type { DocumentModelModuleFileMakerArgs } from "@powerhousedao/codegen";
import type { OperationSpecification } from "@powerhousedao/shared";
import { ts } from "@tmpl/core";
import { camelCase, constantCase, pascalCase } from "change-case";
import { operationHasAttachment, operationHasEmptyInput } from "file-builders";
import { isTruthy } from "remeda";

function makeDocumentModelTypeImports(args: DocumentModelModuleFileMakerArgs) {
  const actionTypeImports = ["createAction"];
  const anyActionHasAttachment = args.module.operations.some((a) =>
    operationHasAttachment(a),
  );
  if (anyActionHasAttachment) {
    actionTypeImports.push("AttachmentInput");
  }
  return actionTypeImports.join(",\n");
}

function makeActionInputSchemaName(action: OperationSpecification) {
  if (!action.name || !action.schema) return;
  const pascalCaseActionName = pascalCase(action.name);
  return `${pascalCaseActionName}InputSchema`;
}

function makeActionInputTypeName(action: OperationSpecification) {
  if (!action.name || !action.schema) return;
  const pascalCaseActionName = pascalCase(action.name);
  return `${pascalCaseActionName}Input`;
}

function makeActionTypeName(action: OperationSpecification) {
  if (!action.name || !action.schema) return;
  return `${pascalCase(action.name)}Action`;
}

function makeActionInputSchemaImports(args: DocumentModelModuleFileMakerArgs) {
  return args.module.operations
    .map(makeActionInputSchemaName)
    .filter(Boolean)
    .join(",\n");
}

function makeActionInputTypeImports(args: DocumentModelModuleFileMakerArgs) {
  return args.module.operations
    .map(makeActionInputTypeName)
    .filter(Boolean)
    .join(",\n");
}

function makeActionTypeImports(args: DocumentModelModuleFileMakerArgs) {
  return args.module.operations.map(makeActionTypeName).join(",\n");
}

function makeActionCreatorWithInput(operation: OperationSpecification) {
  if (!operation.name || !operation.schema) return;
  const camelCaseActionName = camelCase(operation.name);
  const constantCaseActionName = constantCase(operation.name);
  const actionTypeName = makeActionTypeName(operation);
  const inputSchemaName = makeActionInputSchemaName(operation)!;
  const inputTypeName = makeActionInputTypeName(operation)!;
  const hasAttachment = operationHasAttachment(operation);
  const isEmptyInput = operationHasEmptyInput(operation);
  const inputArg = isEmptyInput
    ? `input: ${inputTypeName} = {}`
    : `input: ${inputTypeName}`;
  const argsArray = [inputArg];
  if (hasAttachment) {
    argsArray.push(`attachments: AttachmentInput[]`);
  }
  const args = argsArray.join(", ");

  return ts`
  export const ${camelCaseActionName} = (${args}) =>
    createAction<${actionTypeName}>(
      "${constantCaseActionName}",
      {...input},
      ${hasAttachment ? "attachments" : "undefined"},
      ${inputSchemaName},
      "${operation.scope}"
    );`.raw;
}

function makeActionCreatorWithoutInput(operation: OperationSpecification) {
  if (!operation.name || !operation.schema) return;
  const camelCaseActionName = camelCase(operation.name);
  const constantCaseActionName = constantCase(operation.name);
  const actionTypeName = makeActionTypeName(operation);
  return ts`
   export const ${camelCaseActionName} = () =>
    createAction<${actionTypeName}>("${constantCaseActionName}");`.raw;
}

function makeCreatorsForActionsWithInput(
  args: DocumentModelModuleFileMakerArgs,
) {
  const actionsWithInput = args.module.operations.filter((a) =>
    isTruthy(a.schema),
  );
  return actionsWithInput.map(makeActionCreatorWithInput).join("\n\n");
}

function makeActionCreatorsWithoutInput(
  args: DocumentModelModuleFileMakerArgs,
) {
  const actionsWithoutInput = args.module.operations.filter(
    (a) => !isTruthy(a.schema),
  );
  return actionsWithoutInput.map(makeActionCreatorWithoutInput).join("\n\n");
}

export const documentModelOperationsModuleCreatorsFileTemplate = (
  v: DocumentModelModuleFileMakerArgs,
) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { ${makeDocumentModelTypeImports(v)} } from "document-model";
import {
${makeActionInputSchemaImports(v)}
} from '../schema/zod.js';
import type {
${makeActionInputTypeImports(v)}
} from '../types.js';
import type {
${makeActionTypeImports(v)}
} from './actions.js';

${makeCreatorsForActionsWithInput(v)}

${makeActionCreatorsWithoutInput(v)}
`.raw;
