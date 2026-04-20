import type { OperationSpecification } from "@powerhousedao/shared";
import { constantCase, pascalCase } from "change-case";
import {
  operationHasInput,
  type DocumentModelModuleFileMakerArgs,
} from "file-builders";
export function getActionTypeName(operation: OperationSpecification) {
  if (!operation.name) return;
  return `${pascalCase(operation.name)}Action`;
}

export function getActionInputName(operation: OperationSpecification) {
  if (!operation.name) return;
  if (!operationHasInput(operation)) return;
  return `${pascalCase(operation.name)}Input`;
}

export function getActionType(operation: OperationSpecification) {
  if (!operation.name) return;
  return constantCase(operation.name);
}

export function getActionInputTypeNames(
  args: DocumentModelModuleFileMakerArgs,
) {
  return args.module.operations.map(getActionInputName).join(",\n");
}
