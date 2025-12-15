import { ts } from "@tmpl/core";
import { camelCase, constantCase, pascalCase } from "change-case";
import type {
  ActionFromOperation,
  DocumentModelTemplateInputsWithModule,
} from "../../../../name-builders/types.js";

function makeDocumentModelTypeImports(actions: ActionFromOperation[]) {
  const actionTypeImports = ["createAction"];
  const anyActionHasAttachment = actions.some((a) => a.hasAttachment);
  if (anyActionHasAttachment) {
    actionTypeImports.push("AttachmentInput");
  }
  return actionTypeImports.join(",\n");
}

function makeActionInputSchemaName(action: ActionFromOperation) {
  if (!action.hasInput) return;
  const pascalCaseActionName = pascalCase(action.name);
  return `${pascalCaseActionName}InputSchema`;
}

function makeActionInputTypeName(action: ActionFromOperation) {
  if (!action.hasInput) return;
  const pascalCaseActionName = pascalCase(action.name);
  return `${pascalCaseActionName}Input`;
}

function makeActionTypeName(action: ActionFromOperation) {
  const pascalCaseActionName = pascalCase(action.name);
  return `${pascalCaseActionName}Action`;
}

function makeActionInputSchemaImports(actions: ActionFromOperation[]) {
  return actions.map(makeActionInputSchemaName).filter(Boolean).join(",\n");
}

function makeActionInputTypeImports(actions: ActionFromOperation[]) {
  return actions.map(makeActionInputTypeName).filter(Boolean).join(",\n");
}

function makeActionTypeImports(actions: ActionFromOperation[]) {
  return actions.map(makeActionTypeName).join(",\n");
}

function makeActionCreatorWithInput(actionWithInput: ActionFromOperation) {
  if (!actionWithInput.hasInput) return;
  const camelCaseActionName = camelCase(actionWithInput.name);
  const constantCaseActionName = constantCase(actionWithInput.name);
  const actionTypeName = makeActionTypeName(actionWithInput);
  const inputSchemaName = makeActionInputSchemaName(actionWithInput)!;
  const inputTypeName = makeActionInputTypeName(actionWithInput)!;
  const inputArg = actionWithInput.isEmptyInput
    ? `input: ${inputTypeName} = {}`
    : `input: ${inputTypeName}`;
  const argsArray = [inputArg];
  if (actionWithInput.hasAttachment) {
    argsArray.push(`attachments: AttachmentInput[]`);
  }
  const args = argsArray.join(", ");

  return ts`
  export const ${camelCaseActionName} = (${args}) =>
    createAction<${actionTypeName}>(
      "${constantCaseActionName}",
      {...input},
      ${actionWithInput.hasAttachment ? "attachments" : "undefined"},
      ${inputSchemaName},
      "${actionWithInput.scope}"
    );`.raw;
}

function makeActionCreatorWithoutInput(
  actionWithoutInput: ActionFromOperation,
) {
  if (actionWithoutInput.hasInput) return;
  const camelCaseActionName = camelCase(actionWithoutInput.name);
  const constantCaseActionName = constantCase(actionWithoutInput.name);
  const actionTypeName = makeActionTypeName(actionWithoutInput);
  return ts`
   export const ${camelCaseActionName} = () =>
    createAction<${actionTypeName}>("${constantCaseActionName}");`.raw;
}

function makeCreatorsForActionsWithInput(actions: ActionFromOperation[]) {
  const actionsWithInput = actions.filter((a) => a.hasInput);
  return actionsWithInput.map(makeActionCreatorWithInput).join("\n\n");
}

function makeActionCreatorsWithoutInput(actions: ActionFromOperation[]) {
  const actionsWithoutInput = actions.filter((a) => !a.hasInput);
  return actionsWithoutInput.map(makeActionCreatorWithoutInput).join("\n\n");
}

export const documentModelOperationsModuleCreatorsFileTemplate = (
  v: DocumentModelTemplateInputsWithModule,
) =>
  ts`

import { ${makeDocumentModelTypeImports(v.actions)} } from 'document-model/core';
import {
${makeActionInputSchemaImports(v.actions)}
} from '../schema/zod.js';
import type {
${makeActionInputTypeImports(v.actions)}
} from '../types.js';
import type {
${makeActionTypeImports(v.actions)}
} from './actions.js';

${makeCreatorsForActionsWithInput(v.actions)}

${makeActionCreatorsWithoutInput(v.actions)}
`.raw;
