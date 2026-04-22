import type { DocumentModelModuleFileMakerArgs } from "@powerhousedao/codegen";
import type {
  OperationErrorSpecification,
  OperationSpecification,
} from "@powerhousedao/shared";
import { ts } from "@tmpl/core";
import { pascalCase } from "change-case";
import { flatMap, prop } from "remeda";

function getErrorName(error: OperationErrorSpecification) {
  if (!error.name) return;
  const pascalCaseErrorName = pascalCase(error.name);
  return pascalCaseErrorName;
}

function getErrorNames(errors: OperationErrorSpecification[]) {
  return errors.map(getErrorName).filter((name) => name !== undefined);
}
function getErrorCodeType(errors: OperationErrorSpecification[]) {
  const errorNames = getErrorNames(errors)
    .map((name) => `"${name}"`)
    .join(" |\n");

  return ts`export type ErrorCode = ${errorNames};`.raw;
}

function errorClassTemplate(error: OperationErrorSpecification) {
  const errorName = getErrorName(error);
  if (!errorName) return;

  return ts`
    export class ${errorName} extends Error implements ReducerError {
      errorCode = "${errorName}" as ErrorCode;
      constructor(message = "${errorName}") {
        super(message);
      }
    }
  `.raw;
}

function getErrorClassImplementations(errors: OperationErrorSpecification[]) {
  return errors
    .map((error) => errorClassTemplate(error))
    .filter(Boolean)
    .join("\n\n");
}

function getErrorsImplementations(args: DocumentModelModuleFileMakerArgs) {
  const errors = flatMap(args.module.operations, (o) => prop(o, "errors"));
  if (!errors.length) return "";

  const deduplicatedErrors = errors.reduce((acc, error) => {
    if (!acc.some((e) => getErrorName(e) === getErrorName(error))) {
      acc.push(error);
    }
    return acc;
  }, new Array<OperationErrorSpecification>());

  return ts`
    ${getErrorCodeType(deduplicatedErrors)}

    export interface ReducerError {
      errorCode: ErrorCode;
    }

    ${getErrorClassImplementations(deduplicatedErrors)}
  `.raw;
}

function getActionErrorsExport(operation: OperationSpecification) {
  if (!operation.name) return;
  const errors = operation.errors;
  if (errors.length === 0) return;
  const pascalCaseActionName = pascalCase(operation.name);
  const errorNames = getErrorNames(errors).filter(Boolean).join(",\n");
  return ts`
    ${pascalCaseActionName}: { ${errorNames} }
  `.raw;
}

function getErrorsExport(args: DocumentModelModuleFileMakerArgs) {
  const errorsForEachAction = args.module.operations
    .map(getActionErrorsExport)
    .filter(Boolean)
    .join(",\n");

  return ts`
  export const errors = { ${errorsForEachAction} };
  `.raw;
}

export const documentModelOperationsModuleErrorFileTemplate = (
  v: DocumentModelModuleFileMakerArgs,
) =>
  ts`
  ${getErrorsImplementations(v)}
  ${getErrorsExport(v)}
`.raw;
