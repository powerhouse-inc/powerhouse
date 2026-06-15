import type { OperationSpecification } from "@powerhousedao/shared";
import { isNonNullish } from "remeda";

export function operationHasInput(operation: OperationSpecification) {
  return isNonNullish(operation.schema);
}

export function operationHasEmptyInput(operation: OperationSpecification) {
  return (
    operation.schema?.includes("_empty") &&
    !operation.schema.replace(/_empty:\s*Boolean/, "").match(/\w+:\s*\w+/)
  );
}
