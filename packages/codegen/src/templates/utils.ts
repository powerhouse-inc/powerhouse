import type { ActionFromOperation } from "@powerhousedao/codegen/ts-morph";
import { constantCase, pascalCase } from "change-case";

export function getActionTypeName(action: ActionFromOperation) {
  return `${pascalCase(action.name)}Action`;
}

export function getActionInputName(action: ActionFromOperation) {
  if (!action.hasInput) return;
  return `${pascalCase(action.name)}Input`;
}

export function getActionType(action: ActionFromOperation) {
  return constantCase(action.name);
}

export function getActionInputTypeNames(actions: ActionFromOperation[]) {
  return actions.map(getActionInputName).join(",\n");
}
