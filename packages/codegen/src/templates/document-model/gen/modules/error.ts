import type {
  ActionFromOperation,
  DocumentModelTemplateInputsWithModule,
} from "@powerhousedao/codegen";
import { ts } from "@tmpl/core";
import { pascalCase } from "change-case";
import type { OperationErrorSpecification } from "document-model";

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

function getErrorsImplementations(errors: OperationErrorSpecification[]) {
  if (!errors.length) return "";

  return ts`
    ${getErrorCodeType(errors)}

    export interface ReducerError {
      errorCode: ErrorCode;
    }

    ${getErrorClassImplementations(errors)}
  `.raw;
}

function getActionErrorsExport(action: ActionFromOperation) {
  const errors = action.errors;
  if (errors.length === 0) return;
  const pascalCaseActionName = pascalCase(action.name);
  const errorNames = getErrorNames(errors).filter(Boolean).join(",\n");
  return ts`
    ${pascalCaseActionName}: { ${errorNames} }
  `.raw;
}

function getErrorsExport(actions: ActionFromOperation[]) {
  const errorsForEachAction = actions
    .map(getActionErrorsExport)
    .filter(Boolean)
    .join(",\n");

  return ts`
  export const errors = { ${errorsForEachAction} };
  `.raw;
}

export const documentModelOperationsModuleErrorFileTemplate = (
  v: DocumentModelTemplateInputsWithModule,
) =>
  ts`
  ${getErrorsImplementations(v.errors)}
  ${getErrorsExport(v.actions)}
`.raw;
